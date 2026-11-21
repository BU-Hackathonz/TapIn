"""Mock Tap In server for station hardware tests (no database, no David's server).

Run: uv run --no-project --with fastapi --with uvicorn python firmware/mock_server.py [--port 8000] [--cycle SECONDS]

Point a station at it with `#define SERVER_URL "http://<this laptop's IP>:8000"` in firmware/station/secrets.h.
Like the real server, a window counts distinct badges, closes 6 s after the last tap, then shows checked_in
(1 badge) or joined (2+) for 2 s. POST /mock/state forces any state; --cycle walks through all of them.
"""
import argparse
import threading
import time

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

WINDOW = 6.0       # seconds a scan window stays open after the last tap
RESULT_TIME = 2.0  # seconds checked_in / joined stays on screen
COLORS = {1: "#C85C84", 2: "#5CC8A0"}
STATIONS = [1, 2]
# The 8 server states, in the order --cycle walks through them: (state, count)
SEQUENCE = [("idle", 0)] + [("collecting", n) for n in range(1, 6)] + [
    ("checked_in", 1), ("joined", 2), ("repeat", 2), ("claim", 0), ("claimed", 0), ("unknown", 0)]

WIN = {}       # station_id -> {"uids": [uid, ...], "end": t}   open scan window
RESULT = {}    # station_id -> (state, count, until)            checked_in / joined hold
OVERRIDE = {}  # station_id -> (state, count)                   forced by POST /mock/state or --cycle

app = FastAPI()


class Tap(BaseModel):
    station_id: int
    uid: str


class Force(BaseModel):
    station_id: int
    state: str
    count: int = 0


def reply(sid, state, count):
    return {"state": state, "count": count, "color": COLORS.get(sid, COLORS[1])}


def current(sid):
    forced = OVERRIDE.get(sid)
    if forced:
        return reply(sid, *forced)
    w = WIN.get(sid)
    if w and time.time() >= w["end"]:  # window closed: resolve it into a result
        WIN.pop(sid, None)
        n = len(w["uids"])
        RESULT[sid] = ("checked_in" if n == 1 else "joined", n, w["end"] + RESULT_TIME)
        w = None
    r = RESULT.get(sid)
    if w is None and r and time.time() < r[2]:
        return reply(sid, r[0], r[1])
    if w:
        return reply(sid, "collecting", len(w["uids"]))
    return reply(sid, "idle", 0)


# async endpoints run on the event loop one at a time, so two stations never race on WIN / RESULT.
@app.post("/api/tap")
async def tap(t: Tap):
    print(f"{time.strftime('%H:%M:%S')} station={t.station_id} uid={t.uid}", flush=True)
    if t.station_id not in OVERRIDE:
        current(t.station_id)  # resolve an expired window first
        w = WIN.setdefault(t.station_id, {"uids": [], "end": 0.0})
        if t.uid not in w["uids"]:
            w["uids"].append(t.uid)
        w["end"] = time.time() + WINDOW
    return current(t.station_id)


@app.get("/api/station/{sid}")
async def station(sid: int):
    return current(sid)


@app.post("/mock/state")
async def force(f: Force):
    if f.state == "auto":
        OVERRIDE.pop(f.station_id, None)
    else:
        OVERRIDE[f.station_id] = (f.state, f.count)
    return current(f.station_id)


@app.get("/")
async def index():
    return {"endpoints": {
        "POST /api/tap": "{station_id, uid} -> {state, count, color}",
        "GET /api/station/{id}": "current state of a station",
        "POST /mock/state": "{station_id, state, count}; state 'auto' clears the override",
    }}


def cycle(secs):
    while True:
        for state, count in SEQUENCE:
            for sid in STATIONS:
                OVERRIDE[sid] = (state, count)
            print(f"cycle -> {state} count={count}", flush=True)
            time.sleep(secs)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--cycle", type=float, default=0, help="rotate all stations through the 8 states every N seconds")
    args = ap.parse_args()
    if args.cycle > 0:
        threading.Thread(target=cycle, args=(args.cycle,), daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=args.port)
