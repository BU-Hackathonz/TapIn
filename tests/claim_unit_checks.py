"""The badge claim without a database: a stand-in pool answers the two queries the claim path makes.
Run: uv run --no-project --with asyncpg --with fastapi --with httpx python tests/claim_unit_checks.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import claims, db, logins, scans  # noqa: E402

fails = 0


def check(name, ok, got=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f"  got {got}"))
    fails += 0 if ok else 1


OWNED = {"OWNED1": 7}          # uid -> person id
linked = {}
last_update = []


class Pool:
    async def fetchrow(self, sql, *args):
        if sql.startswith("SELECT id FROM people WHERE uid"):
            pid = OWNED.get(args[0])
            return {"id": pid} if pid else None
        if sql.startswith("UPDATE people SET uid"):
            uid, pid, replace = args
            last_update.append(replace)
            linked[pid] = uid
            return {"id": pid, "name": "Maya", "role": "student"}
        raise AssertionError(sql)


async def no_log(*a, **k):
    return None


async def no_scan(*a, **k):
    return None


async def main():
    db.pool = Pool()
    db.log_tap = no_log
    scans.resolve_scan = no_scan
    scans.hub.broadcast = no_log

    check("a claim waits 60 s by default", claims.CLAIM_SECONDS == 60, claims.CLAIM_SECONDS)
    c = claims.start(42)
    check("new claim is waiting", claims.status(c.code) == "waiting")
    check("no note yet", claims.note(c.code) == "")

    r = await scans.on_tap(2, "OWNED1")
    check("owned badge during a claim goes on as a normal scan (collecting), so sign-ups never block the room", r["state"] == "collecting", r)
    check("the claim keeps waiting", claims.status(c.code) == "waiting")
    check("and notes the owned badge for the phone", claims.note(c.code) == "owned")
    check("and who owns it (for the admin panel)", claims.get(c.code).owner == 7, claims.get(c.code).owner)

    r = await scans.on_tap(2, "BLANK01")
    check("a blank badge is claimed", r["state"] == "claimed", r)
    check("linked to the waiting profile", linked.get(42) == "BLANK01", linked)
    check("a sign-up claim only takes a blank badge (replace off)", last_update[-1] is False, last_update)
    check("claim status is claimed", claims.status(c.code) == "claimed")
    check("no claim waiting after", claims.waiting() is None)

    r = await scans.on_tap(1, "BLANK02")
    check("a blank badge with no claim is unknown", r["state"] == "unknown", r)

    # admin New badge: the claim swaps the person's badge (replace on), and a claim can be cancelled
    c2 = claims.start(9, replace=True)
    scans.last_seen.clear()
    r = await scans.on_tap(1, "BLANK04")
    check("New badge claim links the tapped badge", r["state"] == "claimed" and linked.get(9) == "BLANK04", r)
    check("with replace on, so the old badge is swapped, not required blank", last_update[-1] is True, last_update)
    c3 = claims.start(10)
    check("cancel ends a waiting claim", claims.cancel(c3.code) and claims.waiting() is None)
    check("cancelled code reads expired", claims.status(c3.code) == "expired")

    # badge log-in (the join page): the next owned badge tells the waiting browser who it is, and still scans normally
    w = logins.start()
    check("badge log-in waits", logins.status(w.code) == ("waiting", None))
    r = await scans.on_tap(1, "BLANK03")
    check("a blank badge does not answer a log-in", logins.status(w.code)[0] == "waiting")
    scans.last_seen.clear()
    r = await scans.on_tap(1, "OWNED1")
    check("an owned badge answers the log-in with its person", logins.status(w.code) == ("done", 7), logins.status(w.code))
    check("and the tap still scans (collecting)", r["state"] == "collecting", r)
    check("only one log-in waits at a time", logins.waiting() is None)

    # two people tapping together with nothing waiting: one scan window holds both (the group scan)
    OWNED["OWNED2"] = 8
    scans.windows.clear(); scans.last_seen.clear()
    await scans.on_tap(2, "OWNED1")
    r = await scans.on_tap(2, "OWNED2")
    check("two owned badges at one station inside the window share it", r["state"] == "collecting" and r["count"] == 2, r)
    check("the window holds both people", scans.windows[2].person_ids == [7, 8], scans.windows[2].person_ids)
    for w2 in scans.windows.values():
        w2.timer.cancel()


asyncio.run(main())
print("\n%d failed" % fails if fails else "\nall passed")
sys.exit(1 if fails else 0)
