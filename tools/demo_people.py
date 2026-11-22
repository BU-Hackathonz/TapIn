"""Demo people for the live room: 14 fake hackers with stock photos, at tables of 4, 4, 3 and 2, plus one solo.

Writes to the database in DATABASE_URL (.env), like tools/seed.py, and reuses its helpers.

    python tools/demo_people.py            # add them (does nothing if they are already there)
    python tools/demo_people.py --remove   # delete exactly these people, their tables, links and needs

Badge UIDs start with 5EEDD (inside seed.py's 5EED range), so tools/count.py never counts them as real sign-ups.
Each photo URL goes in people.note, which /api/graph already sends; the room map shows it instead of the drawn avatar.
Photos: randomuser.me portraits (free placeholder photos of real people), copied to wall/img/people/, each used once.
"""
import argparse
import asyncio
import sys
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed import connect, delete_people  # noqa: E402

PHOTO = "/wall/img/people/{}.jpg"   # copied from randomuser.me portraits (no CORS there, and the map draws photos on a canvas)
# name, role, skills, looking_for, working_on, photo
TABLES = [
    ("a T delay predictor", ["design"], [
        ("Jasmine", "student", ["backend", "data"], ["design"], "women-44"),
        ("Tyler", "student", ["frontend"], ["ml"], "men-32"),
        ("Ananya", "student", ["ml", "data"], ["frontend"], "women-68"),
        ("Andre", "student", ["hardware", "firmware"], ["pitch"], "men-75"),
    ]),
    ("a study-room finder", ["hardware"], [
        ("Sofia", "student", ["design", "frontend"], ["backend"], "women-21"),
        ("Daniel", "student", ["backend"], ["design"], "men-46"),
        ("Fatima", "student", ["pitch", "research"], ["mobile"], "women-90"),
        ("Kenji", "student", ["mobile", "frontend"], ["data"], "men-11"),
    ]),
    ("a dining hall wait-time app", ["pitch"], [
        ("Olivia", "student", ["data", "research"], ["firmware"], "women-57"),
        ("Liam", "student", ["firmware", "hardware"], ["design"], "men-86"),
        ("Hana", "student", ["design"], ["ml"], "women-12"),
    ]),
    ("a bike-share rebalancer", ["frontend"], [
        ("Carlos", "student", ["backend", "ml"], ["frontend"], "men-64"),
        ("Grace", "student", ["hardware"], ["backend"], "women-33"),
    ]),
]
SOLO = ("Diego", "student", ["frontend", "design"], ["hardware", "backend"], "Looking for a team", "men-52")

PEOPLE = [(n, r, s, lf, wo, ph) for wo, _, members in TABLES for (n, r, s, lf, ph) in members] + [SOLO]
UIDS = [f"5EEDD{i:09d}" for i in range(1, len(PEOPLE) + 1)]
assert len({p[5] for p in PEOPLE}) == len(PEOPLE), "every photo must be different"


async def add(conn) -> None:
    if await conn.fetchval("SELECT count(*) FROM people WHERE uid = ANY($1::text[])", UIDS):
        print("Demo people are already there. Use --remove first to start over.")
        return
    async with conn.transaction():
        ids = {}
        for uid, (name, role, skills, looking, working, photo) in zip(UIDS, PEOPLE):
            ids[name] = await conn.fetchval(
                """INSERT INTO people (uid, name, role, skills, looking_for, working_on, note, points, last_checkin)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,0, now() - (random() * interval '40 minutes')) RETURNING id""",
                uid, name, role, skills, looking, working, PHOTO.format(photo))
        for working, needs, members in TABLES:
            looking = sorted({t for m in members for t in m[3]})
            gid = await conn.fetchval(
                "INSERT INTO groups (station_id, mode, looking_for, working_on, points) VALUES ($1,'open',$2,$3,$4) RETURNING id",
                1 + len(members) % 2, looking, working, 5 * len(members))
            await conn.execute("UPDATE groups SET name = 'Table ' || id WHERE id=$1", gid)
            for m in members:
                await conn.execute("INSERT INTO group_members (group_id, person_id) VALUES ($1,$2)", gid, ids[m[0]])
            for need in needs:
                await conn.execute("INSERT INTO needs (group_id, need, since) VALUES ($1,$2, now() - interval '10 minutes')", gid, need)
            for a, b in combinations(sorted(ids[m[0]] for m in members), 2):
                await conn.execute("INSERT INTO connections (person_a, person_b) VALUES ($1,$2) ON CONFLICT DO NOTHING", a, b)
                await conn.execute("UPDATE people SET points = points + 5 WHERE id = ANY($1::int[])", [a, b])
    sizes = " + ".join(str(len(t[2])) for t in TABLES)
    print(f"Added {len(PEOPLE)} demo people: tables of {sizes}, and {SOLO[0]} on their own.")


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--remove", action="store_true", help="delete only these demo people and their tables")
    args = ap.parse_args()
    conn, _host = await connect(apply_schema=False)   # seed.connect returns (connection, host)
    try:
        if args.remove:
            n = await delete_people(conn, "uid = ANY($1::text[])", UIDS)
            print(f"Removed {n} demo people.")
        else:
            await add(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
