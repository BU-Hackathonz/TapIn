"""Fake data for Tap In. Two modes.

--events  A fake server for the wall: no real server, no database. Serves /api/graph, /api/needs, /api/stats,
          /api/leaderboard and /ws on the same paths as the real server, plus /wall and /phone if those folders
          exist. A random but consistent room (40 people, 5 groups) changes every few seconds and every change is
          sent on /ws in the contract shape {type, ts, data}.

              python tools/fake_taps.py --events                 # http://localhost:8000/wall
              python tools/fake_taps.py --events --every 1.5 --port 8001

--taps    Runs the test scenarios (Playbook: Final stretch, 1 to 9) against a real server with real POST /api/tap
          calls. It registers its own test people through /api/signup + a blank-badge claim, so it needs no
          seed data and can be run again and again. Each run adds a few "Test ..." people to the database.

              python tools/fake_taps.py --taps --server http://localhost:8000
              python tools/fake_taps.py --cleanup     # afterwards: delete the Test people (needs DATABASE_URL)

Needs: fastapi + uvicorn for --events, httpx for --taps (all in server/requirements.txt).
"""
import argparse
import asyncio
import random
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ["hardware", "firmware", "frontend", "backend", "design", "ml", "data", "mobile", "pitch", "research"]
NAMES = """Maya Sam Priya Leo Ava Omar Zoe Ethan Lina Noah Chloe Ravi Mia Jonah Aisha Theo Nora Kai Elena Marcus
Iris Diego Hana Felix Sofia Ben Yara Luca Grace Amir Ruby Owen Tara Hugo Lily Malik Jade Arjun Nina Cole
Esme Raj Ivy Mateo June Tomas Willa Dev Ana Finn""".split()
WORKING_ON = ["a study-room finder", "a T delay predictor", "a dorm laundry bot", "an AR campus map",
              "a food-waste tracker", "a bike-lane heatmap", "a lab-bench scheduler", "a noise meter for libraries"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- --events: a fake room and a fake server

class Room:
    """In-memory room in the same shapes as /api/graph. Every change returns the events the real server would send."""

    def __init__(self, rnd: random.Random, people: int = 40, groups: int = 5) -> None:
        self.r = rnd
        self.people: dict = {}
        self.groups: dict = {}
        self.links: dict = {}   # (a, b) with a < b -> strength
        self.needs: list = []   # {group_id, need, since, handled_by}
        self.scans: list = []   # (time, station_id) for stats
        for i in range(people):
            self.add_person(role="mentor" if i % 13 == 12 else "student", here=i < 28)
        students = [p for p in self.people.values() if p["role"] == "student" and p["here"]]
        self.r.shuffle(students)
        for _ in range(groups):
            members = [students.pop()["id"] for _ in range(self.r.randint(3, 5))]
            self.form_group(members, quiet=True)
        for _ in range(6):  # a few cross-group links, so the room isn't five islands
            a, b = self.r.sample(list(self.people), 2)
            self.links.setdefault((min(a, b), max(a, b)), 1)

    # state helpers
    def add_person(self, role: str = "student", here: bool = False) -> dict:
        pid = len(self.people) + 1
        name = NAMES[(pid - 1) % len(NAMES)] + ("" if pid <= len(NAMES) else f" {pid}")
        skills = self.r.sample(SKILLS, self.r.randint(1, 3))
        p = {"id": pid, "name": name, "role": role, "group_id": None, "here": here,
             "focus": self.r.random() < 0.08, "points": self.r.randint(0, 20) if here else 0, "note": None,
             "skills": skills, "looking_for": self.r.sample([s for s in SKILLS if s not in skills], 2)}
        self.people[pid] = p
        return p

    def members(self, gid: int) -> list:
        return [p["id"] for p in self.people.values() if p["group_id"] == gid]

    def link(self, a: int, b: int) -> bool:
        key = (min(a, b), max(a, b))
        if key in self.links:
            self.links[key] += 1
            return False
        self.links[key] = 1
        return True

    def give(self, pts: dict, gpts: dict | None = None) -> tuple:
        for pid, n in pts.items():
            self.people[pid]["points"] += n
        for gid, n in (gpts or {}).items():
            self.groups[gid]["points"] += n
        return ("points_updated", {
            "people": [{"id": i, "points": self.people[i]["points"]} for i in pts],
            "groups": [{"id": g, "points": self.groups[g]["points"]} for g in (gpts or {})],
        })

    def needs_list(self) -> list:
        return [{"group_id": n["group_id"], "table": self.groups[n["group_id"]]["name"], "need": n["need"],
                 "since": n["since"], "handled_by": n["handled_by"]}
                for n in self.needs if self.groups[n["group_id"]]["mode"] == "open"]

    def form_group(self, member_ids: list, quiet: bool = False) -> list:
        gid = len(self.groups) + 1
        first = self.people[member_ids[0]]
        self.groups[gid] = {"id": gid, "name": f"Table {gid}", "station_id": 2 if gid % 2 else 1,
                            "mode": "heads_down" if gid % 5 == 0 else "open",
                            "looking_for": first["looking_for"], "working_on": self.r.choice(WORKING_ON),
                            "points": 0}
        since = (datetime.now(timezone.utc) - timedelta(minutes=self.r.randint(0, 50))).isoformat()
        self.needs += [{"group_id": gid, "need": t, "since": since, "handled_by": None} for t in first["looking_for"]]
        pts: dict = {}
        for m in member_ids:
            self.people[m]["group_id"] = gid
        for a, b in combinations(member_ids, 2):
            if self.link(a, b):
                pts[a] = pts.get(a, 0) + 5
                pts[b] = pts.get(b, 0) + 5
        if quiet:
            for pid, n in pts.items():
                self.people[pid]["points"] += n
            return []
        return [("group_formed", {"group_id": gid, "member_ids": member_ids, "station_id": self.groups[gid]["station_id"]}),
                ("needs_updated", {"needs": self.needs_list()}), self.give(pts)]

    def suggestions(self, pid: int) -> list:
        me = self.people[pid]
        out = []
        for g in self.groups.values():
            if g["mode"] != "open" or g["id"] == me["group_id"]:
                continue
            need = next((t for t in g["looking_for"] if t in me["skills"]), None)
            out.append((1 if need else 0, g["id"], f"needs {need}" if need else "new here"))
        out.sort(reverse=True)
        return [{"group_id": gid, "reason": why} for _, gid, why in out[:3]]

    # one random change
    def step(self) -> list:
        here_solo = [p["id"] for p in self.people.values()
                     if p["here"] and p["group_id"] is None and p["role"] == "student"]
        away = [p["id"] for p in self.people.values() if not p["here"]]
        mentors = [p["id"] for p in self.people.values() if p["here"] and p["role"] != "student"]
        open_needs = [n for n in self.needs if n["handled_by"] is None and self.groups[n["group_id"]]["mode"] == "open"]
        options = [("checkin", 4 if away else 0), ("form", 2 if len(here_solo) >= 2 else 0),
                   ("join", 3 if here_solo else 0), ("help", 1 if mentors and open_needs else 0),
                   ("strengthen", 1 if self.links else 0), ("new_person", 1 if len(self.people) < 60 else 0),
                   ("unknown", 0.3)]
        kind = self.r.choices([k for k, _ in options], [w for _, w in options])[0]
        station = self.r.choice([1, 2])
        self.scans.append((time.time(), station))

        if kind == "checkin":
            pid = self.r.choice(away)
            p = self.people[pid]
            p["here"] = True
            known = sorted(o for (a, b) in self.links for o in (a, b)
                           if pid in (a, b) and o != pid and self.people[o]["here"])
            sugg = self.suggestions(pid)
            events = [("checked_in", {"person_id": pid, "station_id": station, "known_here": known,
                                      "suggested_groups": sugg}), self.give({pid: 1})]
            if sugg:
                g = self.groups[sugg[0]["group_id"]]
                events.append(("icebreaker", {"person_id": pid, "group_id": g["id"],
                                              "text": f"{p['name']}, {g['name']} is building {g['working_on']} and could use your {p['skills'][0]}."}))
            return events
        if kind == "form":
            return self.form_group(self.r.sample(here_solo, self.r.randint(2, min(3, len(here_solo)))))
        if kind == "join":
            pid = self.r.choice(here_solo)
            gid = self.r.choice([g for g in self.groups if self.groups[g]["mode"] == "open"] or list(self.groups))
            mem = self.members(gid)
            self.people[pid]["group_id"] = gid
            new_links = [[min(pid, m), max(pid, m)] for m in mem if self.link(pid, m)]
            pts = {pid: 10 + 5 * len(new_links), **{m: 10 for m in mem}}  # +5 welcome, +5 new link each
            return [("group_joined", {"group_id": gid, "new_member_ids": [pid], "new_links": new_links}),
                    self.give(pts, {gid: 5 * len(mem)})]
        if kind == "help":
            need = self.r.choice(open_needs)
            mentor = self.r.choice(mentors)
            for n in self.needs:
                if n["group_id"] == need["group_id"] and n["handled_by"] is None:
                    n["handled_by"] = mentor
            for m in self.members(need["group_id"]):
                self.link(mentor, m)
            return [("help", {"group_id": need["group_id"], "mentor_id": mentor}),
                    ("needs_updated", {"needs": self.needs_list()})]
        if kind == "strengthen":
            (a, b) = self.r.choice(list(self.links))
            self.links[(a, b)] += 1
            return [("link_strengthened", {"a": a, "b": b, "strength": self.links[(a, b)]})]
        if kind == "new_person":
            p = self.add_person()
            return [("person_created", {"person_id": p["id"], "name": p["name"], "role": p["role"]})]
        return [("unknown_badge", {"station_id": station})]

    # snapshots, same shapes as the real endpoints
    def graph(self) -> dict:
        keys = ("id", "name", "role", "group_id", "here", "focus", "points", "note")
        return {"people": [{k: p[k] for k in keys} for p in self.people.values()],
                "groups": list(self.groups.values()),
                "links": [{"a": a, "b": b, "strength": s} for (a, b), s in self.links.items()]}

    def stats(self) -> dict:
        t = time.time()
        recent = [s for s in self.scans if s[0] > t - 3600]
        busiest = max((1, 2), key=lambda st: sum(1 for s in recent if s[1] == st)) if recent else None
        start = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        start -= timedelta(minutes=start.minute % 10)
        buckets = []
        for i in range(11, -1, -1):  # last 2 hours in 10-minute buckets, oldest first
            b = start - timedelta(minutes=10 * i)
            lo = b.timestamp()
            n = sum(1 for s in self.scans if lo <= s[0] < lo + 600) + (0 if i == 0 else self.r.randint(2, 14))
            buckets.append({"bucket": b.isoformat(), "count": n})
        return {"here": sum(p["here"] for p in self.people.values()), "groups": len(self.groups),
                "links_today": len(self.links), "busiest_station": busiest, "scans_10min": buckets}

    def leaderboard(self) -> dict:
        top = lambda xs: [{"id": x["id"], "name": x["name"], "points": x["points"]}
                          for x in sorted(xs, key=lambda x: -x["points"])[:5]]
        return {"groups": top(self.groups.values()), "people": top(self.people.values())}


def run_events(port: int, every: float, seed: int | None) -> None:
    import uvicorn
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    import json

    room = Room(random.Random(seed))
    clients: set = set()

    async def send(type_: str, data: dict) -> None:
        msg = json.dumps({"type": type_, "ts": now(), "data": data})
        for c in list(clients):
            try:
                await c.send_text(msg)
            except Exception:
                clients.discard(c)
        print(f"{type_:18} {json.dumps(data)[:110]}")

    async def loop() -> None:
        last_stats = time.time()
        while True:
            await asyncio.sleep(every)
            events = room.step()
            for i, (type_, data) in enumerate(events):
                if type_ == "icebreaker":
                    await asyncio.sleep(1.2)  # the real one lands a second or two after checked_in
                await send(type_, data)
            if time.time() - last_stats >= 30:
                last_stats = time.time()
                await send("stats_updated", room.stats())

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(_):
        task = asyncio.create_task(loop())
        yield
        task.cancel()

    app = FastAPI(title="Tap In fake server", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.get("/api/graph")(room.graph)
    app.get("/api/needs")(room.needs_list)
    app.get("/api/stats")(room.stats)
    app.get("/api/leaderboard")(room.leaderboard)

    @app.websocket("/ws")
    async def ws(socket: WebSocket):
        await socket.accept()
        clients.add(socket)
        try:
            while True:
                await socket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            clients.discard(socket)

    for name in ("wall", "phone"):
        if (ROOT / name).is_dir():
            app.mount(f"/{name}", StaticFiles(directory=ROOT / name, html=True), name=name)

    print(f"fake server on http://localhost:{port}  (wall: /wall, ws: /ws), one change every {every}s")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")


# ---------------------------------------------------------------- --taps: test scenarios against a real server

RESULTS = {"checked_in", "joined", "repeat", "claimed", "unknown", "idle"}


class Taps:
    def __init__(self, server: str) -> None:
        import httpx
        self.c = httpx.Client(base_url=server.rstrip("/"), timeout=10)
        self.fails: list = []

    def tap(self, station: int, uid: str) -> dict:
        return self.c.post("/api/tap", json={"station_id": station, "uid": uid}).json()

    def result(self, station: int, timeout: float = 12.0) -> str:
        """Wait for the scan window to close and return the result state."""
        end = time.time() + timeout
        while time.time() < end:
            s = self.c.get(f"/api/station/{station}").json()["state"]
            if s in RESULTS - {"idle"}:
                return s
            time.sleep(0.2)
        return "timeout"

    def settle(self, *stations: int) -> None:
        """Let result states (2 s) expire so the next check reads a fresh result."""
        end = time.time() + 6
        while time.time() < end and any(self.c.get(f"/api/station/{s}").json()["state"] not in ("idle", "claim")
                                        for s in stations):
            time.sleep(0.2)

    def check(self, name: str, ok: bool, got="") -> None:
        print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"   got: {got}"))
        if not ok:
            self.fails.append(name)

    def signup(self, name: str, **body) -> dict:
        for _ in range(40):
            r = self.c.post("/api/signup", json={"name": name, **body})
            if r.status_code != 409:
                r.raise_for_status()
                return r.json()
            time.sleep(1)  # another claim is waiting
        raise RuntimeError("signup stayed busy for 40 s")

    def person(self, name: str, role: str = "student", skills=("backend",), looking_for=()) -> str:
        """Sign up and claim a fresh badge. Returns the badge UID."""
        uid = "T" + secrets.token_hex(6).upper()
        su = self.signup(f"Test {name}", role=role, skills=list(skills), looking_for=list(looking_for))
        self.tap(1, uid)
        if self.c.get(f"/api/claim/{su['claim_code']}").json()["status"] != "claimed":
            raise RuntimeError(f"could not claim a badge for {name}")
        return uid


def run_taps(server: str) -> int:
    t = Taps(server)
    print(f"registering test people on {server} ...")
    ann = t.person("Ann", skills=["design"], looking_for=["firmware"])
    ben = t.person("Ben", skills=["backend"], looking_for=["design"])
    cy = t.person("Cy", skills=["frontend"])
    dee = t.person("Dee", skills=["firmware"])
    eve = t.person("Eve")
    fay = t.person("Fay")
    mo = t.person("Mo", role="mentor", skills=["hardware"])
    t.settle(1, 2)

    print("1. one badge at station 1")
    t.tap(1, ann)
    t.check("1 check-in", (s := t.result(1)) == "checked_in", s)
    t.settle(1)

    print("2. same badge twice within 3 s")
    t.tap(1, eve)
    second = t.tap(1, eve)
    t.check("2 counted once", second.get("count") == 1, second)
    t.check("2 then check-in", (s := t.result(1)) == "checked_in", s)
    t.settle(1)

    print("3. two people with no group at station 2")
    t.tap(2, ben)
    t.tap(2, cy)
    t.check("3 new group", (s := t.result(2)) == "joined", s)
    t.settle(2)

    print("4. a third person taps with one member")
    t.tap(2, dee)
    t.tap(2, ben)
    t.check("4 join", (s := t.result(2)) == "joined", s)
    t.settle(2)

    print("5. the same two tap together again")
    t.tap(2, ben)
    t.tap(2, cy)
    t.check("5 repeat", (s := t.result(2)) == "repeat", s)
    t.settle(2)

    print("6. a mentor taps with a group member")
    t.tap(2, mo)
    t.tap(2, ben)
    t.check("6 help shows joined", (s := t.result(2)) == "joined", s)
    t.settle(2)

    print("7. taps at both stations in the same second")
    t.tap(1, fay)
    t.tap(2, ann)
    s1, s2 = t.result(1), t.result(2)
    t.check("7 station 1 check-in", s1 == "checked_in", s1)
    t.check("7 station 2 check-in", s2 == "checked_in", s2)
    t.settle(1, 2)

    print("8. an unregistered badge")
    r = t.tap(1, "F" + secrets.token_hex(6).upper())
    t.check("8 unknown", r.get("state") == "unknown", r)
    t.settle(1)

    print("9. claim a blank badge, then an owned badge is refused during a claim")
    su = t.signup("Test Gil", role="student", skills=["data"], looking_for=[])
    r = t.tap(1, ann)
    t.check("9 owned badge refused", r.get("state") == "unknown"
            and t.c.get(f"/api/claim/{su['claim_code']}").json()["status"] == "waiting", r)
    r = t.tap(2, "T" + secrets.token_hex(6).upper())
    t.check("9 blank badge claimed", r.get("state") == "claimed"
            and t.c.get(f"/api/claim/{su['claim_code']}").json()["status"] == "claimed", r)

    print("\n10 (restart mid-demo) is manual.")
    print(f"{len(t.fails)} failed" if t.fails else "all passed")
    return 1 if t.fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--events", action="store_true", help="fake server for the wall")
    mode.add_argument("--taps", action="store_true", help="test scenarios against a real server")
    mode.add_argument("--cleanup", action="store_true",
                      help="delete the 'Test ...' people --taps made, with their groups, needs, links and taps (uses DATABASE_URL)")
    ap.add_argument("--port", type=int, default=8000, help="--events: port (default 8000)")
    ap.add_argument("--every", type=float, default=3.0, help="--events: seconds between changes (default 3)")
    ap.add_argument("--seed", type=int, default=None, help="--events: random seed for the same room every time")
    ap.add_argument("--server", default="http://localhost:8000", help="--taps: server URL")
    a = ap.parse_args()
    if a.events:
        run_events(a.port, a.every, a.seed)
        return 0
    if a.cleanup:
        return asyncio.run(cleanup())
    code = run_taps(a.server)
    print("These Test people now show on the wall. Remove them with: python tools/fake_taps.py --cleanup")
    return code


async def cleanup() -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from seed import connect, delete_people
    conn, host = await connect()
    try:
        n = await delete_people(conn, "name LIKE 'Test %'")
        print(f"removed {n} Test people from {host}")
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
