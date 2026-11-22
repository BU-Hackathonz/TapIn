"""Group scan rules without a database: which table a scan joins, who is missing, and one window per person across stations.
Run: uv run --no-project --with asyncpg --with fastapi --with httpx python tests/table_rules_checks.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import db, scans  # noqa: E402
from server.groups import choose_table  # noqa: E402

fails = 0


def check(name, ok, got=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f"  got {got}"))
    fails += 0 if ok else 1


# tables: 10 at station 1 (Entrance), 20 at station 2 (Table 2)
ST = {10: 1, 20: 2}
check("nobody at a table: new table", choose_table(2, [1, 2], {1: None, 2: None}, ST, {}) == (None, set()))
# A (in table 10) taps at station 2 with B (in table 20): A joins B's table, the one at this station
check("rescan at a different table with its member: you join THAT table",
      choose_table(2, [1, 2], {1: 10, 2: 20}, ST, {10: {1}, 20: {2}})[0] == 20)
check("...even when you tapped first", choose_table(2, [1, 2], {1: 10, 2: 20}, ST, {20: {2}})[0] == 20)
# table 20 has 3 people here; only 1 of them taps with the newcomer: join refused, the other 2 are missing
g, missing = choose_table(2, [5, 2], {5: None, 2: 20}, ST, {20: {2, 3, 4}})
check("join needs everyone at that table: missing members named", g == 20 and missing == {3, 4}, (g, missing))
g, missing = choose_table(2, [5, 2, 3, 4], {5: None, 2: 20, 3: 20, 4: 20}, ST, {20: {2, 3, 4}})
check("everyone at the table tapped: join goes through", g == 20 and missing == set(), (g, missing))
# no table pinned to this station: the table with the most people in the scan, tie to the first tapper
check("most people in the scan wins", choose_table(3, [1, 2, 3], {1: 10, 2: 20, 3: 20}, ST, {20: {2, 3}})[0] == 20)
check("tie goes to the first tapper's table", choose_table(3, [1, 2], {1: 10, 2: 20}, ST, {10: {1}})[0] == 10)
check("away members don't block a join (only here-now members count)",
      choose_table(2, [5, 2], {5: None, 2: 20}, ST, {20: {2}}) == (20, set()))


class Pool:
    async def fetchrow(self, sql, *args):
        return {"id": {"U1": 1, "U2": 2, "U3": 3}[args[0]]} if sql.startswith("SELECT id FROM people WHERE uid") else None


async def no_log(*a, **k):
    return None


async def main():
    db.pool = Pool(); db.log_tap = no_log
    scans.resolve_scan = no_log; scans.hub.broadcast = no_log
    await scans.on_tap(1, "U1")
    await scans.on_tap(1, "U2")
    check("two people in station 1's window", scans.windows[1].person_ids == [1, 2], scans.windows[1].person_ids)
    r = await scans.on_tap(2, "U2")
    check("tapping station 2 moves you out of station 1's window", scans.windows[1].person_ids == [1] and scans.windows[2].person_ids == [2])
    check("station 2 shows its own count", r["state"] == "collecting" and r["count"] == 1, r)
    await scans.on_tap(2, "U1")
    check("a window left empty closes without a scan", 1 not in scans.windows, list(scans.windows))
    check("station 2 now holds both", scans.windows[2].person_ids == [2, 1], scans.windows[2].person_ids)
    for w in scans.windows.values():
        w.timer.cancel()


asyncio.run(main())
print("\n%d failed" % fails if fails else "\nall passed")
sys.exit(1 if fails else 0)
