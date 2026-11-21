"""Seed data for Tap In: 20 fake people in 4 groups, a few links, 2 mentors, and the two judge badges.

Writes straight to the database in DATABASE_URL (.env), the same one the server uses.

    python tools/seed.py                     # add the fake room; does nothing if it is already there
    python tools/seed.py --judge1 <UID> --judge2 <UID>   # register two real spare badges as Judge 1 and Judge 2
    python tools/seed.py --remove            # delete only the fake people and the groups that only had them
    python tools/seed.py --reset             # WIPE EVERY TABLE (see the warning in --help)

Every fake badge UID starts with 5EED (14 hex characters, e.g. 5EED0000000001), so real sign-ups can always be
counted apart: see tools/count.py. Judge badges need the real UIDs of two spare cards: tap each one with no claim
waiting and read the uid from the server log (outcome=unknown).
"""
import argparse
import asyncio
import os
import sys
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FAKE_PREFIX = "5EED"
JUDGES = [("Judge 1", ["design"], ["hardware"]), ("Judge 2", ["hardware"], ["design"])]
# A real person: not a fake 5EED badge, not a judge, not a "Test ..." person left by fake_taps.py --taps.
REAL = ("(people.uid IS NULL OR people.uid NOT LIKE '5EED%') "
        "AND people.name NOT IN ('Judge 1', 'Judge 2') AND people.name NOT LIKE 'Test %'")

# name, role, skills, looking_for, working_on
PEOPLE = [
    ("Maya", "student", ["firmware", "hardware"], ["design"], ""),  # solo, so "Maya gets Table 2 first" can be checked
    ("Sam", "student", ["backend", "data"], ["firmware"], "a robot arm"),
    ("Priya", "student", ["design", "frontend"], ["firmware"], "a robot arm"),
    ("Ethan", "student", ["mobile"], ["firmware"], "a robot arm"),
    ("Leo", "student", ["ml", "data"], ["design"], "a T delay predictor"),
    ("Ava", "student", ["frontend", "mobile"], ["ml"], "a T delay predictor"),
    ("Omar", "student", ["backend"], ["design"], "a T delay predictor"),
    ("Zoe", "student", ["research", "pitch"], ["backend"], "a study-room finder"),
    ("Lina", "student", ["design"], ["backend"], "a study-room finder"),
    ("Noah", "student", ["backend", "ml"], ["frontend"], "a dorm laundry bot"),
    ("Chloe", "student", ["pitch", "design"], ["frontend"], "a dorm laundry bot"),
    ("Ravi", "student", ["firmware"], ["data"], ""),
    ("Mia", "student", ["data", "research"], ["ml"], ""),
    ("Jonah", "student", ["frontend"], ["design"], ""),
    ("Aisha", "student", ["ml"], ["hardware"], ""),
    ("Theo", "student", ["design"], ["firmware"], ""),
    ("Nora", "student", ["mobile"], ["backend"], ""),
    ("Kai", "student", ["hardware", "firmware"], ["pitch"], ""),
    ("Elena", "mentor", ["backend", "data"], [], ""),
    ("Marcus", "mentor", ["hardware", "firmware"], [], ""),
]
# member indexes into PEOPLE, station, mode, looking_for (one need row per tag), working_on.
# The station 2 firmware group is inserted second, so on a fresh database it is named "Table 2".
GROUPS = [
    ([4, 5, 6], 1, "open", ["design"], "a T delay predictor"),
    ([1, 2, 3], 2, "open", ["firmware"], "a robot arm"),
    ([7, 8], 1, "open", ["backend"], "a study-room finder"),
    ([9, 10], 2, "heads_down", ["frontend"], "a dorm laundry bot"),
]
EXTRA_LINKS = [(0, 1), (4, 11), (2, 13), (5, 12), (6, 18)]  # across groups; Maya already knows Sam
NOT_HERE = {15, 16, 17}  # registered but not checked in
TABLES = ["people", "groups", "group_members", "connections", "needs", "taps", "scan_events"]


def fake_uid(i: int) -> str:
    return f"{FAKE_PREFIX}{i + 1:010X}"  # 5EED0000000001 ...


SEED_UIDS = [fake_uid(i) for i in range(len(PEOPLE))]


async def connect():
    import asyncpg
    from server import db
    db.load_env()
    url = os.environ.get("DATABASE_URL", "")
    if not url or "user:pass@host" in url:
        sys.exit("set DATABASE_URL in .env first")
    conn = await asyncpg.connect(url)
    await conn.execute((ROOT / "server" / "schema.sql").read_text())
    return conn, url.split("@")[-1].split("/")[0]


async def delete_people(conn, where: str, *args) -> int:
    """Delete the people matching `where` (SQL on people) plus every group that only had them, and their
    needs, links, memberships, taps and scans. Groups that also hold other people keep them."""
    async with conn.transaction():
        rows = await conn.fetch(f"SELECT id, uid FROM people WHERE {where}", *args)
        pids = [r["id"] for r in rows]
        uids = [r["uid"] for r in rows if r["uid"]]
        gids = [r["group_id"] for r in await conn.fetch(
            """SELECT group_id FROM group_members GROUP BY group_id
               HAVING bool_and(person_id = ANY($1::int[]))""", pids)]
        await conn.execute("DELETE FROM needs WHERE group_id = ANY($1::int[]) OR handled_by = ANY($2::int[])", gids, pids)
        await conn.execute("DELETE FROM group_members WHERE group_id = ANY($1::int[]) OR person_id = ANY($2::int[])", gids, pids)
        await conn.execute("DELETE FROM scan_events WHERE group_id = ANY($1::int[])", gids)
        await conn.execute("DELETE FROM groups WHERE id = ANY($1::int[])", gids)
        await conn.execute("DELETE FROM connections WHERE person_a = ANY($1::int[]) OR person_b = ANY($1::int[])", pids)
        await conn.execute("DELETE FROM taps WHERE uid = ANY($1::text[])", uids)
        await conn.execute("DELETE FROM people WHERE id = ANY($1::int[])", pids)
    return len(pids)


async def seed(conn) -> None:
    have = await conn.fetchval("SELECT count(*) FROM people WHERE uid = ANY($1::text[])", SEED_UIDS)
    if have:
        print(f"The fake room is already there ({have} fake people). Nothing added.")
        return
    async with conn.transaction():
        ids = []
        for i, (name, role, skills, looking, working) in enumerate(PEOPLE):
            here = i not in NOT_HERE
            ids.append(await conn.fetchval(
                """INSERT INTO people (uid, name, role, skills, looking_for, working_on, points, last_checkin)
                   VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8 THEN now() - interval '20 minutes' END) RETURNING id""",
                SEED_UIDS[i], name, role, skills, looking, working, 1 if here else 0, here))
        pairs = set()
        for members, station, mode, looking, working in GROUPS:
            gid = await conn.fetchval(
                "INSERT INTO groups (station_id, mode, looking_for, working_on, points) VALUES ($1,$2,$3,$4,$5) RETURNING id",
                station, mode, looking, working, 5 * len(members) * (len(members) - 1))
            await conn.execute("UPDATE groups SET name = 'Table ' || id WHERE id=$1", gid)
            for m in members:
                await conn.execute("INSERT INTO group_members (group_id, person_id) VALUES ($1,$2)", gid, ids[m])
            for tag in looking:
                await conn.execute("INSERT INTO needs (group_id, need, since) VALUES ($1,$2, now() - interval '15 minutes')", gid, tag)
            pairs |= {tuple(sorted((ids[a], ids[b]))) for a, b in combinations(members, 2)}
        pairs |= {tuple(sorted((ids[a], ids[b]))) for a, b in EXTRA_LINKS}
        for a, b in sorted(pairs):
            await conn.execute("INSERT INTO connections (person_a, person_b) VALUES ($1,$2)", a, b)
            await conn.execute("UPDATE people SET points = points + 5 WHERE id = ANY($1::int[])", [a, b])
    print(f"Added {len(PEOPLE)} fake people, {len(GROUPS)} groups, {len(pairs)} links.")


async def judges(conn, uids: dict) -> None:
    for name, skills, looking in JUDGES:
        if not uids.get(name):
            continue
        uid = uids[name].strip().upper()
        owner = await conn.fetchval("SELECT name FROM people WHERE uid=$1", uid)
        if owner:
            print(f"Badge {uid} already belongs to {owner}. Skipped {name}.")
            continue
        if await conn.fetchval("SELECT 1 FROM people WHERE name=$1 AND uid IS NOT NULL", name):
            print(f"{name} already has a badge. Skipped.")
            continue
        await conn.execute("DELETE FROM people WHERE name=$1 AND uid IS NULL", name)
        await conn.execute("INSERT INTO people (uid, name, role, skills, looking_for) VALUES ($1,$2,'student',$3,$4)",
                           uid, name, skills, looking)
        print(f"Registered {name} on badge {uid}.")


async def real_signups(conn) -> None:
    with_badge = await conn.fetchval(f"SELECT count(*) FROM people WHERE {REAL} AND uid IS NOT NULL")
    without = await conn.fetchval(f"SELECT count(*) FROM people WHERE {REAL} AND uid IS NULL")
    print(f"Real sign-ups: {with_badge} with a badge, {without} more who never finished claiming a badge.")


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--judge1", metavar="UID", help="real UID of the spare card for Judge 1 (design, looking for hardware)")
    ap.add_argument("--judge2", metavar="UID", help="real UID of the spare card for Judge 2 (hardware, looking for design)")
    ap.add_argument("--remove", action="store_true", help="delete only the fake 5EED people and the groups that only had them")
    ap.add_argument("--reset", action="store_true",
                    help="!!! DANGER !!! WIPES EVERY TABLE, REAL SIGN-UPS INCLUDED. NEVER RUN THIS AFTER RECRUITING "
                         "STARTS: it deletes every real person, group, link and scan, and they cannot be brought back.")
    a = ap.parse_args()
    conn, host = await connect()
    try:
        if a.reset:
            n = await conn.fetchval("SELECT count(*) FROM people")
            print(f"!!! This deletes ALL {n} people (real sign-ups too) and every group, link, need, tap and scan on {host}.")
            if input("Type RESET to continue: ").strip() != "RESET":
                sys.exit("Nothing deleted.")
            await conn.execute(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY")
            if await conn.fetchval("SELECT to_regclass('scans_per_10min')"):
                # Clear old chart buckets too; CALL must run on its own, outside a transaction.
                await conn.execute("CALL refresh_continuous_aggregate('scans_per_10min', NULL, NULL)")
            print("Database wiped.")
        elif a.remove:
            n = await delete_people(conn, "uid = ANY($1::text[])", SEED_UIDS)
            print(f"Removed {n} fake people.")
        elif a.judge1 or a.judge2:
            await judges(conn, {"Judge 1": a.judge1, "Judge 2": a.judge2})
        else:
            await seed(conn)
        await real_signups(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
