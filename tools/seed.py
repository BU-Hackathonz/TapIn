"""Seed data for Tap In: about 20 people in 4 groups, a few links, a mentor, and the two judge badges.

Writes straight to the database in DATABASE_URL (.env), the same one the server uses.

    python tools/seed.py                                   # add the seed room (refuses if it is already there)
    python tools/seed.py --judge1 04A1B2C3D4E5F6 --judge2 04FFEEDDCCBBAA   # only register the judge badges
    python tools/seed.py --remove                          # delete only the seed people and their groups
    python tools/seed.py --reset                           # WIPE EVERYTHING, asks you to type RESET first

Seed badges have fake UIDs starting with SEED, so they never collide with real badges. Judge badges need the real
UIDs of two spare badges (read them off the server log: tap each one, it shows as outcome=unknown).
--reset deletes every person, group, link, need, tap and scan, real ones included. Never run it after recruiting starts.
"""
import argparse
import asyncio
import os
import sys
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# name, role, skills, looking_for, working_on
PEOPLE = [
    ("Maya", "student", ["firmware", "hardware"], ["design"], "a robot arm"),
    ("Sam", "student", ["backend", "data"], ["firmware"], "a robot arm"),
    ("Priya", "student", ["design", "frontend"], ["backend"], "a robot arm"),
    ("Leo", "student", ["ml", "data"], ["frontend"], "a T delay predictor"),
    ("Ava", "student", ["frontend", "mobile"], ["ml"], "a T delay predictor"),
    ("Omar", "student", ["backend"], ["design"], "a T delay predictor"),
    ("Zoe", "student", ["hardware"], ["firmware"], "a study-room finder"),
    ("Ethan", "student", ["mobile", "design"], ["hardware"], "a study-room finder"),
    ("Lina", "student", ["research", "pitch"], ["frontend"], "a study-room finder"),
    ("Noah", "student", ["backend", "ml"], ["mobile"], "a dorm laundry bot"),
    ("Chloe", "student", ["pitch", "design"], ["backend"], "a dorm laundry bot"),
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
# groups: member indexes into PEOPLE, station, mode, looking_for (one need row per tag)
GROUPS = [
    ([0, 1, 2], 2, "open", ["firmware"], "a robot arm"),
    ([3, 4, 5], 1, "open", ["design"], "a T delay predictor"),
    ([6, 7, 8], 1, "open", ["backend", "hardware"], "a study-room finder"),
    ([9, 10], 2, "heads_down", ["firmware"], "a dorm laundry bot"),
]
EXTRA_LINKS = [(0, 6), (3, 11), (2, 13), (4, 12), (1, 18)]  # across groups, so the room isn't four islands
NOT_HERE = {15, 16, 17}  # registered but not checked in yet
JUDGES = [("Judge 1", ["design"], ["hardware"]), ("Judge 2", ["hardware"], ["design"])]
TABLES = ["people", "groups", "group_members", "connections", "needs", "taps", "scan_events"]


async def connect():
    import asyncpg
    from server import db
    db.load_env()
    url = os.environ.get("DATABASE_URL", "")
    if not url or "user:pass@host" in url:
        sys.exit("seed: set DATABASE_URL in .env first")
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
    if await conn.fetchval("SELECT count(*) FROM people WHERE uid LIKE 'SEED%'"):
        sys.exit("seed: the seed room is already there (run with --remove first to redo it)")
    async with conn.transaction():
        ids = []
        for i, (name, role, skills, looking, working) in enumerate(PEOPLE):
            ids.append(await conn.fetchval(
                """INSERT INTO people (uid, name, role, skills, looking_for, working_on, points, last_checkin)
                   VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8 THEN now() - interval '20 minutes' END) RETURNING id""",
                f"SEED{i + 1:02d}", name, role, skills, looking, working, 1 if i not in NOT_HERE else 0, i not in NOT_HERE))
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
    print(f"seed: added {len(PEOPLE)} people, {len(GROUPS)} groups, {len(pairs)} links")


async def judges(conn, uids: dict) -> None:
    for name, skills, looking in JUDGES:
        if not uids.get(name):
            continue
        uid = uids[name].strip().upper()
        if await conn.fetchval("SELECT 1 FROM people WHERE uid=$1", uid):
            print(f"seed: badge {uid} is already registered, skipped {name}")
            continue
        await conn.execute("DELETE FROM people WHERE name=$1 AND uid IS NULL", name)
        await conn.execute("INSERT INTO people (uid, name, role, skills, looking_for) VALUES ($1,$2,'student',$3,$4)",
                           uid, name, skills, looking)
        print(f"seed: registered {name} on badge {uid}")


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--judge1", help="real UID of the Judge 1 badge")
    ap.add_argument("--judge2", help="real UID of the Judge 2 badge")
    ap.add_argument("--remove", action="store_true", help="delete only the seed people (SEED badges) and their groups")
    ap.add_argument("--reset", action="store_true", help="wipe every table, real data included (asks first)")
    a = ap.parse_args()
    conn, host = await connect()
    try:
        if a.reset:
            n = await conn.fetchval("SELECT count(*) FROM people")
            print(f"seed: this deletes ALL {n} people and every group, link, need, tap and scan on {host}.")
            if input("Type RESET to continue: ").strip() != "RESET":
                sys.exit("seed: nothing deleted")
            await conn.execute(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY")
            print("seed: database wiped")
            return
        if a.remove:
            n = await delete_people(conn, "uid LIKE 'SEED%'")
            print(f"seed: removed {n} seed people")
            return
        if a.judge1 or a.judge2:
            await judges(conn, {"Judge 1": a.judge1, "Judge 2": a.judge2})
        else:
            await seed(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
