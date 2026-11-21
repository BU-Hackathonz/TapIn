"""Honest numbers for the pitch: real people only.

    python tools/count.py

Read-only: it never writes to the database, so a read-only login is enough.

Real = not a fake 5EED badge (seed.py, fake_taps.py), not Judge 1 or Judge 2, not a "Test ..." person.
- people signed up: real people with a badge (plus, separately, sign-ups that never claimed a badge;
  those can include the same person retrying, so don't add them to the headline number)
- groups formed: groups with at least 2 real members
- help scans: mentor or staff scans whose helped group has at least 1 real member
- connections: links where both people are real
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed import REAL, connect  # noqa: E402

REAL_IDS = f"SELECT id FROM people WHERE {REAL}"


async def main() -> None:
    conn, host = await connect(apply_schema=False)
    try:
        people = await conn.fetchval(f"SELECT count(*) FROM people WHERE {REAL} AND uid IS NOT NULL")
        unclaimed = await conn.fetchval(f"SELECT count(*) FROM people WHERE {REAL} AND uid IS NULL")
        groups = await conn.fetchval(
            f"""SELECT count(*) FROM (SELECT group_id FROM group_members WHERE person_id IN ({REAL_IDS})
                GROUP BY group_id HAVING count(*) >= 2) g""")
        helps = await conn.fetchval(
            f"""SELECT count(*) FROM scan_events s WHERE s.kind = 'help' AND EXISTS (
                SELECT 1 FROM group_members m WHERE m.group_id = s.group_id AND m.person_id IN ({REAL_IDS}))""")
        links = await conn.fetchval(
            f"SELECT count(*) FROM connections WHERE person_a IN ({REAL_IDS}) AND person_b IN ({REAL_IDS})")
    finally:
        await conn.close()
    print(f"Real numbers from {host}")
    print(f"  People signed up (with a badge): {people}")
    print(f"  Groups formed:                   {groups}")
    print(f"  Help scans:                      {helps}")
    print(f"  Connections:                     {links}")
    print(f"  (Also {unclaimed} sign-ups that never claimed a badge; may include retries, not in the headline.)")


if __name__ == "__main__":
    asyncio.run(main())
