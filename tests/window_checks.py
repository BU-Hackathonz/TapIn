"""Scan window timing without a database: re-taps don't extend it, a new person does, and it always closes at the cap.
Run: uv run --no-project --with asyncpg --with fastapi --with httpx python tests/window_checks.py
"""
import asyncio
import os
import sys
import time
from pathlib import Path

os.environ["TAPIN_WINDOW"] = "0.6"
os.environ["TAPIN_WINDOW_MAX"] = "1.0"
os.environ["TAPIN_DEDUPE"] = "0.05"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import db, scans  # noqa: E402

fails = 0


def check(name, ok, got=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f"  got {got}"))
    fails += 0 if ok else 1


class Pool:
    async def fetchrow(self, sql, *a):
        return {"id": {"A": 1, "B": 2, "C": 3}[a[0]]} if sql.startswith("SELECT id FROM people WHERE uid") else None


resolved, sent = [], []


async def fake_resolve(station, ids, show_result=True):
    resolved.append((round(time.monotonic() - T0, 2), station, list(ids)))


async def fake_broadcast(type_, data):
    sent.append((type_, data))


async def no_log(*a, **k):
    return None


async def main():
    global T0
    db.pool = Pool(); db.log_tap = no_log
    scans.resolve_scan = fake_resolve; scans.hub.broadcast = fake_broadcast
    T0 = time.monotonic()
    await scans.on_tap(1, "A")
    await asyncio.sleep(0.3); await scans.on_tap(1, "A")      # re-tap: must NOT extend
    await asyncio.sleep(0.2); await scans.on_tap(1, "A")
    await asyncio.sleep(0.3)
    check("re-taps by someone already in the window don't keep it open", resolved and resolved[0][2] == [1] and resolved[0][0] < 0.75, resolved)
    check("each tap tells the walls the window is collecting", any(t == "collecting" and d["station_id"] == 1 for t, d in sent), sent)

    resolved.clear(); T0 = time.monotonic()
    await scans.on_tap(2, "A")
    await asyncio.sleep(0.4); await scans.on_tap(2, "B")      # a new person extends it
    await asyncio.sleep(0.4); await scans.on_tap(2, "C")      # ...but never past the 1.0 s cap
    await asyncio.sleep(0.9)
    check("new people extend the window and land in one scan", resolved and resolved[0][2] == [1, 2, 3], resolved)
    check("the window closes at the cap after its first tap", resolved and resolved[0][0] <= 1.15, resolved)


T0 = 0.0
asyncio.run(main())
print("\n%d failed" % fails if fails else "\nall passed")
sys.exit(1 if fails else 0)
