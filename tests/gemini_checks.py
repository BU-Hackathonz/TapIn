"""Gemini icebreaker behavior with the network call mocked (uid GEM...). Real DB for people and groups; cleans up.

    uv run --no-project --with asyncpg --with fastapi --with httpx python tests/gemini_checks.py

Refuses to run if real people exist (cleanup deletes scan_events by time); set ALLOW_LIVE=1 to override.
"""
import asyncio
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TAPIN_WINDOW", "0.3")
os.environ.pop("GEMINI_API_KEY", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from server import gemini  # noqa: E402
from server.hub import hub  # noqa: E402
from server.main import app  # noqa: E402

failures: list = []
events: list = []


class FakeClient:
    async def send_text(self, text: str) -> None:
        events.append(json.loads(text))


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def ice() -> list:
    return [e["data"] for e in events if e["type"] == "icebreaker"]


def main() -> int:
    from server import db

    with TestClient(app) as c:
        run = c.portal.call
        real = run(db.pool.fetchval, "SELECT count(*) FROM people WHERE uid NOT LIKE 'GEM%'")
        if real and not os.environ.get("ALLOW_LIVE"):
            print(f"refusing to run: {real} real people in the database (set ALLOW_LIVE=1 to override)")
            return 1
        started = run(db.pool.fetchval, "SELECT now()")
        hub.clients.add(FakeClient())
        real_generate, real_spawn = gemini.generate, gemini.spawn
        os.environ.pop("GEMINI_API_KEY", None)
        gemini.cache.clear()
        try:
            def person(uid, name, skills, looking=(), here=True):
                return run(db.pool.fetchval,
                           "INSERT INTO people (uid, name, role, skills, looking_for, working_on, last_checkin)"
                           " VALUES ($1,$2,'student',$3,$4,'x', CASE WHEN $5 THEN now() END) RETURNING id",
                           uid, name, list(skills), list(looking), here)

            def group(name, members, looking):
                gid = run(db.pool.fetchval, "INSERT INTO groups (name, station_id, mode, looking_for, working_on)"
                          " VALUES ($1,2,'open',$2,'a robot arm') RETURNING id", name, list(looking))
                for m in members:
                    run(db.pool.execute, "INSERT INTO group_members (group_id, person_id) VALUES ($1,$2)", gid, m)
                return gid

            sam = person("GEM01", "Sam", ["backend"])
            maya = person("GEM02", "Maya", ["firmware", "hardware"], here=False)
            g1 = group("Table 1", [sam], ["firmware"])
            g2 = group("Table 2", [sam], ["design"])
            g3 = group("Table 3", [sam], ["data"])
            g4 = group("Table 4", [sam], ["ml"])

            prompt = gemini.build_prompt({"name": "Maya", "skills": ["firmware", "hardware"]},
                                         {"working_on": "a robot arm", "looking_for": ["firmware"]})
            check("prompt has name, skills, work, needs and the style rules",
                  all(s in prompt for s in ("Maya", "firmware, hardware", "a robot arm", "looking for firmware",
                                            "under 20 words", "No emojis, no exclamation marks")), prompt)

            # no key: nothing happens, nothing breaks
            events.clear()
            run(gemini.icebreaker, maya, g1)
            check("no key: no event", ice() == [])

            os.environ["GEMINI_API_KEY"] = "test-key-not-real"
            calls = []

            async def fake_ok(p):
                calls.append(p)
                return '"Hi Maya! Ask them about the arm! \U0001F600"\nsecond line'
            gemini.generate = fake_ok
            events.clear()
            run(gemini.icebreaker, maya, g1)
            t = ice()
            check("event shape {person_id, group_id, text}", len(t) == 1 and set(t[0]) == {"person_id", "group_id", "text"}
                  and t[0]["person_id"] == maya and t[0]["group_id"] == g1, str(t))
            check("text is one clean line: no '!', no emoji, no quotes",
                  bool(t) and "!" not in t[0]["text"] and "\U0001F600" not in t[0]["text"] and not t[0]["text"].startswith('"')
                  and "\n" not in t[0]["text"] and t[0]["text"].startswith("Hi Maya"), str(t))
            events.clear()
            run(gemini.icebreaker, maya, g1)
            check("cached by (person, group): one Gemini call, event re-sent", len(calls) == 1 and len(ice()) == 1)

            async def fake_slow(p):
                await asyncio.sleep(10)
                return "too late"
            gemini.generate = fake_slow
            events.clear()
            t0 = time.time()
            run(gemini.icebreaker, maya, g2)
            check("timeout: no event, gives up near 2 s", ice() == [] and 1.8 < time.time() - t0 < 3.5, f"{time.time() - t0:.1f}s")

            async def fake_boom(p):
                raise RuntimeError("500")
            gemini.generate = fake_boom
            events.clear()
            run(gemini.icebreaker, maya, g3)
            check("error: no event, no crash", ice() == [])

            async def fake_empty(p):
                return "   "
            gemini.generate = fake_empty
            events.clear()
            run(gemini.icebreaker, maya, g4)
            check("empty answer: no event", ice() == [])

            # a real check-in spawns the icebreaker for the TOP suggested group without delaying the tap reply
            spawned = []
            gemini.spawn = lambda p, g: spawned.append((p, g))
            run(db.pool.execute, "UPDATE groups SET mode='heads_down' WHERE id = ANY($1::int[])", [g2, g3, g4])
            events.clear()
            reply_t0 = time.time()
            c.post("/api/tap", json={"station_id": 1, "uid": "GEM02"})
            reply_s = time.time() - reply_t0
            end = time.time() + 8
            while time.time() < end and not spawned:
                time.sleep(0.15)
            check("check-in spawns the icebreaker for the top suggested group", spawned == [(maya, g1)], str(spawned))
            check("tap reply was not delayed by Gemini", reply_s < 1.5, f"{reply_s:.2f}s")
        finally:
            gemini.generate, gemini.spawn = real_generate, real_spawn
            os.environ.pop("GEMINI_API_KEY", None)
            pids = [r["id"] for r in run(db.pool.fetch, "SELECT id FROM people WHERE uid LIKE 'GEM%'")]
            gids = [r["group_id"] for r in run(db.pool.fetch, "SELECT DISTINCT group_id FROM group_members WHERE person_id = ANY($1::int[])", pids)]
            run(db.pool.execute, "DELETE FROM needs WHERE group_id = ANY($1::int[])", gids)
            run(db.pool.execute, "DELETE FROM group_members WHERE person_id = ANY($1::int[])", pids)
            run(db.pool.execute, "DELETE FROM groups WHERE id = ANY($1::int[])", gids)
            run(db.pool.execute, "DELETE FROM connections WHERE person_a = ANY($1::int[]) OR person_b = ANY($1::int[])", pids)
            run(db.pool.execute, "DELETE FROM people WHERE id = ANY($1::int[])", pids)
            run(db.pool.execute, "DELETE FROM taps WHERE uid LIKE 'GEM%'")
            run(db.pool.execute, "DELETE FROM scan_events WHERE ts >= $1", started)
    print(f"\n{len(failures)} failed" if failures else "\nall passed")
    return 1 if failures else 0


sys.exit(main())
