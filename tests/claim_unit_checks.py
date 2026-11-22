"""The badge claim without a database: a stand-in pool answers the two queries the claim path makes.
Run: uv run --no-project --with asyncpg --with fastapi --with httpx python tests/claim_unit_checks.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import claims, db, scans  # noqa: E402

fails = 0


def check(name, ok, got=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f"  got {got}"))
    fails += 0 if ok else 1


OWNED = {"OWNED1": 7}          # uid -> person id
linked = {}


class Pool:
    async def fetchrow(self, sql, *args):
        if sql.startswith("SELECT id FROM people WHERE uid"):
            pid = OWNED.get(args[0])
            return {"id": pid} if pid else None
        if sql.startswith("UPDATE people SET uid"):
            uid, pid = args
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
    check("owned badge during a claim is refused (unknown)", r["state"] == "unknown", r)
    check("the claim keeps waiting", claims.status(c.code) == "waiting")
    check("and notes the owned badge for the phone", claims.note(c.code) == "owned")

    r = await scans.on_tap(2, "BLANK01")
    check("a blank badge is claimed", r["state"] == "claimed", r)
    check("linked to the waiting profile", linked.get(42) == "BLANK01", linked)
    check("claim status is claimed", claims.status(c.code) == "claimed")
    check("no claim waiting after", claims.waiting() is None)

    r = await scans.on_tap(1, "BLANK02")
    check("a blank badge with no claim is unknown", r["state"] == "unknown", r)


asyncio.run(main())
print("\n%d failed" % fails if fails else "\nall passed")
sys.exit(1 if fails else 0)
