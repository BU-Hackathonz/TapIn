"""Scan scenarios 1-8 from the Playbook, run against the real database with fake badges (uid TST...).

    uv run --no-project --with asyncpg --with fastapi python tests/scan_scenarios.py

Uses a short scan window so it runs in seconds. Test rows are deleted at the end.
"""
import asyncio
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TAPIN_WINDOW", "0.4")
os.environ.setdefault("TAPIN_DEDUPE", "1.0")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import db, scans  # noqa: E402
from server.hub import hub  # noqa: E402

events: list = []
failures: list = []


class FakeClient:
    async def send_text(self, text: str) -> None:
        events.append(json.loads(text))


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def of_type(t: str) -> list:
    return [e["data"] for e in events if e["type"] == t]


async def settle() -> None:
    await asyncio.sleep(max(scans.WINDOW_SECONDS + 0.3, scans.DEDUPE_SECONDS + 0.1))
    while scans.windows or scans.resolve_lock.locked():
        await asyncio.sleep(0.1)
    await asyncio.sleep(0.2)


async def person(uid: str, name: str, role: str = "student") -> int:
    return await db.pool.fetchval(
        "INSERT INTO people (uid, name, role, skills, looking_for, working_on) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        uid, name, role, ["firmware"], ["design"], "robot arm",
    )


async def points(pid: int) -> int:
    return await db.pool.fetchval("SELECT points FROM people WHERE id=$1", pid)


async def main() -> int:
    await db.connect()
    if db.pool is None:
        print("no DATABASE_URL")
        return 1
    real = await db.pool.fetchval("SELECT count(*) FROM people WHERE uid NOT LIKE 'TST%'")
    if real and not os.environ.get("ALLOW_LIVE"):
        # Cleanup deletes scan_events by time, which would also delete real scans.
        print(f"refusing to run: {real} real people in the database (set ALLOW_LIVE=1 to override)")
        return 1
    started = await db.pool.fetchval("SELECT now()")
    hub.clients.add(FakeClient())
    try:
        a = await person("TST01", "Ann")
        b = await person("TST02", "Ben")
        c = await person("TST03", "Cy")
        d = await person("TST04", "Di")
        e = await person("TST05", "Eve")
        m = await person("TST06", "Mo", "mentor")

        # 1. one badge at station 1 -> check-in, +1
        r = await scans.on_tap(1, "TST01")
        check("1 collecting reply", r["state"] == "collecting" and r["count"] == 1)
        await settle()
        check("1 checked_in event", len(of_type("checked_in")) == 1 and of_type("checked_in")[0]["person_id"] == a)
        check("1 first check-in +1", await points(a) == 1, str(await points(a)))
        check("1 station shows checked_in", scans.current_state(1)["state"] == "checked_in")

        # 2. same badge twice within 3 s -> counted once
        await scans.on_tap(1, "TST05")
        r = await scans.on_tap(1, "TST05")
        check("2 counted once", r["count"] == 1 and scans.windows[1].person_ids == [e])
        await settle()

        # 3. two people, no group, station 2 -> group_formed, one link, +5 each
        events.clear()
        await scans.on_tap(2, "TST02")
        await scans.on_tap(2, "TST03")
        await settle()
        formed = of_type("group_formed")
        check("3 group_formed", len(formed) == 1 and formed[0]["station_id"] == 2 and set(formed[0]["member_ids"]) == {b, c})
        gid = formed[0]["group_id"] if formed else None
        check("3 +5 each", await points(b) == 5 and await points(c) == 5, f"{await points(b)},{await points(c)}")
        check("3 state joined", scans.current_state(2)["state"] == "joined")
        n3 = await db.pool.fetch("SELECT need, handled_by FROM needs WHERE group_id=$1", gid)
        check("3 need created from the first tapper's looking_for", [(r["need"], r["handled_by"]) for r in n3] == [("design", None)], str([tuple(r) for r in n3]))
        check("3 needs_updated emitted", len(of_type("needs_updated")) == 1)

        # 4. third person taps with one member -> group_joined, welcome bonus
        events.clear()
        await scans.on_tap(2, "TST04")
        await scans.on_tap(2, "TST02")
        await settle()
        joined = of_type("group_joined")
        check("4 group_joined", len(joined) == 1 and joined[0]["new_member_ids"] == [d] and joined[0]["group_id"] == gid)
        check("4 joiner +10 +5 link", await points(d) == 15, str(await points(d)))
        check("4 members +5 welcome (+5 link for Ben)", await points(b) == 15 and await points(c) == 10,
              f"{await points(b)},{await points(c)}")
        gp = await db.pool.fetchval("SELECT points FROM groups WHERE id=$1", gid)
        check("4 group welcome bonus doubled (5x2 members x2)", gp == 20, str(gp))

        # 5. same two again -> repeat, strength +1, no points
        events.clear()
        before = (await points(b), await points(c))
        await scans.on_tap(2, "TST02")
        await scans.on_tap(2, "TST03")
        await settle()
        check("5 repeat state", scans.current_state(2)["state"] == "repeat")
        check("5 link_strengthened", len(of_type("link_strengthened")) == 1 and of_type("link_strengthened")[0]["strength"] == 2)
        check("5 no points", (await points(b), await points(c)) == before)

        # 6. mentor with a group member -> help, need handled
        await db.pool.execute("INSERT INTO needs (group_id, need) VALUES ($1, 'firmware')", gid)
        events.clear()
        await scans.on_tap(2, "TST06")
        await scans.on_tap(2, "TST03")
        await settle()
        helps = of_type("help")
        check("6 help event", len(helps) == 1 and helps[0]["mentor_id"] == m and helps[0]["group_id"] == gid)
        handled = await db.pool.fetchval("SELECT handled_by FROM needs WHERE group_id=$1", gid)
        check("6 need handled by mentor", handled == m)
        check("6 mentor not a member", m not in [r["person_id"] for r in await db.pool.fetch(
            "SELECT person_id FROM group_members WHERE group_id=$1", gid)])

        # 7. both stations in the same second -> two correct outcomes
        f = await person("TST07", "Flo")
        g = await person("TST08", "Gus")
        h = await person("TST09", "Hal")
        events.clear()
        await asyncio.gather(scans.on_tap(1, "TST07"), scans.on_tap(1, "TST08"), scans.on_tap(2, "TST09"))
        await settle()
        formed = of_type("group_formed")
        checked = of_type("checked_in")
        check("7 station 1 formed a group of 2", len(formed) == 1 and formed[0]["station_id"] == 1 and set(formed[0]["member_ids"]) == {f, g})
        check("7 station 2 checked in", len(checked) == 1 and checked[0]["person_id"] == h and checked[0]["station_id"] == 2)

        # 8. unregistered badge -> unknown
        r = await scans.on_tap(1, "TSTFF")
        check("8 unknown", r["state"] == "unknown" and len(of_type("unknown_badge")) == 1)

        # extra: each tap extends the window. With a 1.0 s window, the third tap lands after the
        # ORIGINAL close time, so one scan of 3 proves the timer restarted on the second tap.
        i = await person("TST10", "Ivy")
        j = await person("TST11", "Jon")
        k = await person("TST12", "Kai")
        scans.WINDOW_SECONDS = 1.0
        events.clear()
        await scans.on_tap(1, "TST10")
        await asyncio.sleep(0.5)
        await scans.on_tap(1, "TST11")
        await asyncio.sleep(0.5)
        await scans.on_tap(1, "TST12")
        await settle()
        formed = of_type("group_formed")
        check("extra window extends on each tap", len(formed) == 1 and set(formed[0]["member_ids"]) == {i, j, k})
    finally:
        pids = [r["id"] for r in await db.pool.fetch("SELECT id FROM people WHERE uid LIKE 'TST%'")]
        gids = [r["group_id"] for r in await db.pool.fetch("SELECT DISTINCT group_id FROM group_members WHERE person_id = ANY($1::int[])", pids)]
        await db.pool.execute("DELETE FROM needs WHERE group_id = ANY($1::int[])", gids)
        await db.pool.execute("DELETE FROM group_members WHERE person_id = ANY($1::int[])", pids)
        await db.pool.execute("DELETE FROM groups WHERE id = ANY($1::int[])", gids)
        await db.pool.execute("DELETE FROM connections WHERE person_a = ANY($1::int[]) OR person_b = ANY($1::int[])", pids)
        await db.pool.execute("DELETE FROM people WHERE id = ANY($1::int[])", pids)
        await db.pool.execute("DELETE FROM taps WHERE uid LIKE 'TST%'")
        await db.pool.execute("DELETE FROM scan_events WHERE ts >= $1", started)
        await db.close()
    print(f"\n{len(failures)} failed" if failures else "\nall passed")
    return 1 if failures else 0


sys.exit(asyncio.run(main()))
