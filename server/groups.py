"""Resolve a closed scan window: check-in, new group, join, help or repeat (Playbook: Resolving a scan).

resolve() runs inside one transaction and returns (kind, station_state, events). The caller broadcasts the events.
"""
from itertools import combinations

from . import matching
from . import points as P

HERE = f"{P.HERE_HOURS} hours"


async def known_here(conn, person_id: int) -> list[int]:
    rows = await conn.fetch(
        f"""SELECT p.id FROM connections c
            JOIN people p ON p.id = CASE WHEN c.person_a=$1 THEN c.person_b ELSE c.person_a END
            WHERE (c.person_a=$1 OR c.person_b=$1) AND p.last_checkin > now() - interval '{HERE}'""",
        person_id,
    )
    return [r["id"] for r in rows]


async def active_group_of(conn, person_id: int):
    """Newest group the person is in that still has someone here now."""
    return await conn.fetchval(
        f"""SELECT gm.group_id FROM group_members gm
            WHERE gm.person_id=$1 AND EXISTS (
              SELECT 1 FROM group_members m JOIN people p ON p.id=m.person_id
              WHERE m.group_id=gm.group_id AND p.last_checkin > now() - interval '{HERE}')
            ORDER BY gm.joined_at DESC LIMIT 1""",
        person_id,
    )


async def list_needs(conn) -> list[dict]:
    """The needs board: what each OPEN group is looking for (heads-down groups stay off it)."""
    rows = await conn.fetch(
        """SELECT n.group_id, g.name AS "table", n.need, n.since, n.handled_by
           FROM needs n JOIN groups g ON g.id=n.group_id WHERE g.mode='open' ORDER BY n.since"""
    )
    return [{**dict(r), "since": r["since"].isoformat()} for r in rows]


async def sync_needs(conn, group_id: int, tags) -> None:
    """One need row per looking_for tag. Drops still-open needs for tags no longer wanted; keeps handled ones."""
    tags = list(tags or [])
    await conn.execute(
        "DELETE FROM needs WHERE group_id=$1 AND handled_by IS NULL AND NOT (need = ANY($2::text[]))", group_id, tags
    )
    have = {r["need"] for r in await conn.fetch("SELECT need FROM needs WHERE group_id=$1", group_id)}
    for tag in tags:
        if tag not in have:
            await conn.execute("INSERT INTO needs (group_id, need) VALUES ($1,$2)", group_id, tag)


async def _connect_pairs(conn, ids, award, new_links, strengthened, pay):
    for x, y in combinations(ids, 2):
        a, b = min(x, y), max(x, y)
        row = await conn.fetchrow(
            """INSERT INTO connections (person_a, person_b) VALUES ($1,$2)
               ON CONFLICT (person_a, person_b)
               DO UPDATE SET strength = connections.strength + 1, last_seen = now()
               RETURNING strength, (xmax = 0) AS inserted""",
            a, b,
        )
        if row["inserted"]:
            new_links.append([a, b])
            if pay:
                award["people"][a] = award["people"].get(a, 0) + P.NEW_CONNECTION
                award["people"][b] = award["people"].get(b, 0) + P.NEW_CONNECTION
        else:
            strengthened.append({"a": a, "b": b, "strength": row["strength"]})


async def _new_group(conn, station_id: int, first) -> int:
    gid = await conn.fetchval(
        "INSERT INTO groups (station_id, looking_for, working_on) VALUES ($1,$2,$3) RETURNING id",
        station_id, first["looking_for"], first["working_on"],
    )
    await conn.execute("UPDATE groups SET name = 'Table ' || id WHERE id=$1", gid)
    await sync_needs(conn, gid, first["looking_for"])
    return gid


async def _apply_points(conn, award: dict) -> dict:
    for pid, pts in award["people"].items():
        await conn.execute("UPDATE people SET points = points + $2 WHERE id=$1", pid, pts)
    for gid, pts in award["groups"].items():
        await conn.execute("UPDATE groups SET points = points + $2 WHERE id=$1", gid, pts)
    people = await conn.fetch("SELECT id, points FROM people WHERE id = ANY($1::int[])", list(award["people"]))
    grps = await conn.fetch("SELECT id, points FROM groups WHERE id = ANY($1::int[])", list(award["groups"]))
    return {"people": [dict(r) for r in people], "groups": [dict(r) for r in grps]}


async def _members(conn, gid: int) -> list[int]:
    return [r["person_id"] for r in await conn.fetch("SELECT person_id FROM group_members WHERE group_id=$1", gid)]


def choose_table(station_id: int, ids: list, active: dict, table_station: dict, here_members: dict):
    """Which table a group scan is about, and who from that table is missing. Pure: no database, so it is unit-tested.
    - ids: the people in the scan, in tap order. active: person -> their active table (or None).
    - table_station: table -> the station it is pinned to. here_members: table -> its members who are here now.
    Rules: a table pinned to THIS station wins (you joined the table you walked up to); otherwise the table with the most
    people in the scan; a tie goes to the first tapper's table. A join only counts when every member of that table who is
    here now is in the scan, so the whole table has to tap in together. Returns (table or None, missing member ids)."""
    tables = [active[i] for i in ids if active.get(i)]
    if not tables:
        return None, set()
    count = {g: tables.count(g) for g in tables}
    first = {}
    for n, g in enumerate(tables):
        first.setdefault(g, n)
    here = [g for g in count if table_station.get(g) == station_id]
    pool = here or list(count)
    gid = min(pool, key=lambda g: (-count[g], first[g]))
    missing = set(here_members.get(gid, set())) - set(ids)
    return gid, missing


async def _here_members(conn, gid: int) -> set:
    rows = await conn.fetch(
        f"""SELECT m.person_id FROM group_members m JOIN people p ON p.id = m.person_id
            WHERE m.group_id=$1 AND p.last_checkin > now() - interval '{HERE}'""", gid)
    return {r["person_id"] for r in rows}


async def _table_for(conn, station_id: int, ids):
    active = {i: await active_group_of(conn, i) for i in ids}
    cands = {g for g in active.values() if g}
    stations = {g: await conn.fetchval("SELECT station_id FROM groups WHERE id=$1", g) for g in cands}
    here = {g: await _here_members(conn, g) for g in cands}
    return choose_table(station_id, ids, active, stations, here)


async def _first_active_group(conn, ids, station_id: int = 0):
    gid, _ = await _table_for(conn, station_id, ids)
    return gid


async def resolve(conn, station_id: int, person_ids: list[int]):
    rows = {r["id"]: r for r in await conn.fetch("SELECT * FROM people WHERE id = ANY($1::int[])", person_ids)}
    ids = [i for i in person_ids if i in rows]  # keep tap order
    award = {"people": {}, "groups": {}}
    events: list = []
    new_links: list = []
    strengthened: list = []
    gid = None

    if len(ids) == 1:
        pid = ids[0]
        first_today = await conn.fetchval(
            """SELECT last_checkin IS NULL
                  OR (last_checkin AT TIME ZONE $2)::date < (now() AT TIME ZONE $2)::date
               FROM people WHERE id=$1""",
            pid, P.TIMEZONE,
        )
        await conn.execute("UPDATE people SET last_checkin = now() WHERE id=$1", pid)
        if first_today:
            award["people"][pid] = P.FIRST_CHECKIN
        ms = await matching.load(conn)
        events.append(("checked_in", {
            "person_id": pid, "station_id": station_id,
            "known_here": await known_here(conn, pid),
            "suggested_groups": [
                {"group_id": x["group_id"], "reason": x["reason"]} for x in matching.suggested_groups(ms, pid)
            ],
        }))
        kind, state = "checkin", "checked_in"
    else:
        counts = {
            i: await conn.fetchval("SELECT count(*) FROM connections WHERE person_a=$1 OR person_b=$1", i) for i in ids
        }
        helpers = [i for i in ids if rows[i]["role"] in ("mentor", "staff")]
        students = [i for i in ids if i not in helpers]
        await conn.execute("UPDATE people SET last_checkin = now() WHERE id = ANY($1::int[])", ids)

        if helpers and students:
            # Help: the mentor is not a member; the students' group is the one helped. No points for help links.
            gid = await _first_active_group(conn, students, station_id)
            formed = gid is None
            if formed:
                gid = await _new_group(conn, station_id, rows[students[0]])
            members = await _members(conn, gid)
            added = [s for s in students if s not in members]
            for s in added:
                await conn.execute("INSERT INTO group_members (group_id, person_id) VALUES ($1,$2)", gid, s)
            await _connect_pairs(conn, ids, award, new_links, strengthened, pay=False)
            await conn.execute("UPDATE needs SET handled_by=$2 WHERE group_id=$1 AND handled_by IS NULL", gid, helpers[0])
            if formed:
                events.append(("group_formed", {"group_id": gid, "member_ids": added, "station_id": station_id}))
            events.append(("help", {"group_id": gid, "mentor_id": helpers[0]}))
            events.append(("needs_updated", {"needs": await list_needs(conn)}))
            kind, state = "help", "joined"
        else:
            gid, missing = await _table_for(conn, station_id, ids)
            joiners: list = []
            table_members = set(await _members(conn, gid)) if gid is not None else set()
            adding = gid is not None and any(i not in table_members for i in ids)
            if adding and missing:   # only a JOIN needs the whole table; members re-tapping together is a repeat
                # Not everyone at that table tapped in: nobody joins and nothing is linked. The station blinks red and the
                # wall says the whole table has to tap in together.
                events.append(("join_incomplete", {"group_id": gid, "station_id": station_id,
                                                   "scanned_ids": ids, "missing_ids": sorted(missing)}))
                await conn.execute(
                    "INSERT INTO scan_events (station_id, kind, size, group_id) VALUES ($1,'incomplete',$2,$3)",
                    station_id, len(ids), gid)
                return "incomplete", "unknown", events
            if gid is None:
                gid = await _new_group(conn, station_id, rows[ids[0]])
                for i in ids:
                    await conn.execute("INSERT INTO group_members (group_id, person_id) VALUES ($1,$2)", gid, i)
                    await conn.execute("DELETE FROM group_members WHERE person_id=$1 AND group_id<>$2", i, gid)   # one table each
                events.append(("group_formed", {"group_id": gid, "member_ids": ids, "station_id": station_id}))
                events.append(("needs_updated", {"needs": await list_needs(conn)}))
                kind = "new_group"
            else:
                members = await _members(conn, gid)
                joiners = [i for i in ids if i not in members]
                for j in joiners:
                    await conn.execute("INSERT INTO group_members (group_id, person_id) VALUES ($1,$2)", gid, j)
                    await conn.execute("DELETE FROM group_members WHERE person_id=$1 AND group_id<>$2", j, gid)   # moving tables: leave the old one
                    group_pts = P.MEMBER_WELCOME * len(members)
                    if counts[j] < P.WELCOME_BONUS_BELOW:
                        group_pts *= 2
                    award["people"][j] = award["people"].get(j, 0) + P.JOIN_GROUP
                    for m in members:
                        award["people"][m] = award["people"].get(m, 0) + P.MEMBER_WELCOME
                    award["groups"][gid] = award["groups"].get(gid, 0) + group_pts
                kind = "join"
            await _connect_pairs(conn, ids, award, new_links, strengthened, pay=True)
            if joiners:
                events.append(("group_joined", {"group_id": gid, "new_member_ids": joiners, "new_links": new_links}))
            if kind == "join" and not joiners and not new_links:
                kind = "repeat"
            state = "joined" if new_links else "repeat"

        for s in strengthened:
            events.append(("link_strengthened", s))

    if award["people"] or award["groups"]:
        events.append(("points_updated", await _apply_points(conn, award)))
    await conn.execute(
        "INSERT INTO scan_events (station_id, kind, size, group_id) VALUES ($1,$2,$3,$4)",
        station_id, kind, len(ids), gid,
    )
    return kind, state, events
