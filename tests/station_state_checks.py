"""Station state while a closed scan window is being written: it must stay 'collecting', never flash 'idle'.

No database needed: the DB write is replaced by a 0.6 s sleep, the slow case on Tiger Data.

    uv run --no-project --with asyncpg --with fastapi --with httpx python tests/station_state_checks.py
"""
import asyncio
import os
import sys
from pathlib import Path

os.environ["TAPIN_WINDOW"] = "0.3"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import scans  # noqa: E402

failures: list = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


async def slow_resolve(station_id: int, person_ids: list) -> None:
    await asyncio.sleep(0.6)                      # the DB write
    scans.set_result(station_id, "joined" if len(person_ids) > 1 else "checked_in")


async def main() -> int:
    scans.resolve_scan = slow_resolve             # close_after looks it up at call time
    station = 7

    # A window of 2 badges closes, then the slow write runs. Sample the state every 20 ms throughout.
    scans.windows[station] = scans.Window(person_ids=[1, 2])
    task = asyncio.create_task(scans.close_after(station, 0.05))
    seen = []
    for _ in range(60):                          # about 1.2 s
        s = scans.current_state(station)
        seen.append((s["state"], s["count"]))
        await asyncio.sleep(0.02)
    await task

    states = [st for st, _ in seen]
    check("never idle between collecting and the result", "idle" not in states[: states.index("joined")]
          if "joined" in states else False, str(seen[:40]))
    during = [c for st, c in seen if st == "collecting"]
    check("collecting keeps the window's count while it is written", during and set(during) == {2}, str(set(during)))
    check("then the result shows", "joined" in states)
    check("resolving is cleared afterwards", station not in scans.resolving)

    # A tap during the write opens a fresh window; that window wins over the old one's count.
    scans.windows[station] = scans.Window(person_ids=[3])
    task = asyncio.create_task(scans.close_after(station, 0.0))
    await asyncio.sleep(0.1)                     # old window popped, write in progress
    scans.windows[station] = scans.Window(person_ids=[4])
    s = scans.current_state(station)
    check("a new window during the write shows its own count", s["state"] == "collecting" and s["count"] == 1, str(s))
    scans.windows.pop(station, None)
    await task

    # A failed write must not leave the station stuck in collecting.
    async def failing(station_id, person_ids):
        raise RuntimeError("db down")
    scans.resolve_scan = failing
    scans.windows[station] = scans.Window(person_ids=[5])
    try:
        await scans.close_after(station, 0.0)
    except RuntimeError:
        pass
    check("a failed write clears resolving", station not in scans.resolving)

    print("all passed" if not failures else f"{len(failures)} failed")
    return 1 if failures else 0


sys.exit(asyncio.run(main()))
