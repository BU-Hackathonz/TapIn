"""Matching, group fit, /api/me, focus and heads-down against the real database (uid MAT...). Cleans up.

    uv run --no-project --with asyncpg --with fastapi --with httpx python tests/matching_checks.py

Refuses to run if real people exist (cleanup deletes scan_events by time); set ALLOW_LIVE=1 to override.
"""
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TAPIN_WINDOW", "0.3")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

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


def main() -> int:
    from server import db

    with TestClient(app) as c:
        run = c.portal.call
        real = run(db.pool.fetchval, "SELECT count(*) FROM people WHERE uid NOT LIKE 'MAT%'")
        if real and not os.environ.get("ALLOW_LIVE"):
            print(f"refusing to run: {real} real people in the database (set ALLOW_LIVE=1 to override)")
            return 1
        started = run(db.pool.fetchval, "SELECT now()")
        hub.clients.add(FakeClient())
        try:
            def person(uid, name, skills, looking=(), here=True, focus=False):
                return run(
                    db.pool.fetchval,
                    "INSERT INTO people (uid, name, role, skills, looking_for, working_on, focus, last_checkin)"
                    " VALUES ($1,$2,'student',$3,$4,'x',$5, CASE WHEN $6 THEN now() END) RETURNING id",
                    uid, name, list(skills), list(looking), focus, here,
                )

            def group(name, members, looking, mode="open"):
                gid = run(db.pool.fetchval, "INSERT INTO groups (name, station_id, mode, looking_for, working_on)"
                          " VALUES ($1,2,$2,$3,'a thing') RETURNING id", name, mode, list(looking))
                for m in members:
                    run(db.pool.execute, "INSERT INTO group_members (group_id, person_id) VALUES ($1,$2)", gid, m)
                return gid

            sam = person("MAT01", "Sam", ["backend"], ["design"])
            tess = person("MAT02", "Tess", ["hardware"])
            uma = person("MAT03", "Uma", ["design"])
            vic = person("MAT04", "Vic", ["design"])
            wes = person("MAT05", "Wes", ["firmware"])
            xia = person("MAT06", "Xia", ["firmware"])
            ned = person("MAT07", "Ned", ["firmware"], focus=True)
            oz = person("MAT08", "Oz", ["firmware"], here=False)
            g2 = group("Table 2", [sam, tess], ["firmware"])
            g3 = group("Table 3", [uma, vic], ["backend"])
            g4 = group("Table 4", [wes, xia], ["firmware"], mode="heads_down")
            maya = person("MAT09", "Maya", ["firmware"], here=False)

            # check in Maya by a real tap so the checked_in event carries suggestions
            events.clear()
            c.post("/api/tap", json={"station_id": 1, "uid": "MAT09"})
            end = time.time() + 8
            while time.time() < end and not [e for e in events if e["type"] == "checked_in"]:
                time.sleep(0.15)
            ci = [e["data"] for e in events if e["type"] == "checked_in"]
            check("checked_in event arrives", len(ci) == 1 and ci[0]["person_id"] == maya)
            sg = ci[0]["suggested_groups"] if ci else []
            check("event: Table 2 first with reason 'needs firmware'",
                  bool(sg) and sg[0]["group_id"] == g2 and sg[0]["reason"] == "needs firmware", str(sg))
            check("event: heads-down group never suggested", all(x["group_id"] != g4 for x in sg))
            check("event: suggestions are {group_id, reason} only", all(set(x) == {"group_id", "reason"} for x in sg))

            me = c.get(f"/api/me/{maya}").json()
            check("me: contract keys", set(me) == {"person", "here", "group", "known_here", "suggested_groups", "suggested_people", "points"}, str(set(me)))
            check("me: here, no group yet", me["here"] is True and me["group"] is None)
            check("me: top group is Table 2", me["suggested_groups"][0]["group"]["id"] == g2 and me["suggested_groups"][0]["reason"] == "needs firmware")
            check("me: group card has size and known_count", me["suggested_groups"][0]["group"]["size"] == 2 and me["suggested_groups"][0]["group"]["known_count"] == 0)
            names = [x["person"]["name"] for x in me["suggested_people"]]
            check("me: people exclude focus, not-here and self", "Ned" not in names and "Oz" not in names and "Maya" not in names, str(names))
            check("me: people include here-now strangers", {"Sam", "Tess", "Uma"} <= set(names), str(names))
            check("me: every suggestion has a reason", all(x["reason"] for x in me["suggested_people"] + me["suggested_groups"]))
            check("me: unknown person is 404", c.get("/api/me/999999").status_code == 404)

            # focus mode hides a person from everyone's suggestions
            from server import matching

            async def everyone_for(pid):  # uncapped, so ranking ties can't hide anyone
                async with db.pool.acquire() as conn:
                    s = await matching.load(conn)
                    return [s.people[x["person_id"]]["name"] for x in matching.suggested_people(s, pid, limit=50)]

            check("before focus: Maya is a candidate for Sam", "Maya" in run(everyone_for, sam))
            check("focus on ok", c.post(f"/api/me/{maya}/focus", json={"focus": True}).json() == {"ok": True})
            check("focus hides Maya from others", "Maya" not in run(everyone_for, sam))
            c.post(f"/api/me/{maya}/focus", json={"focus": False})
            check("focus off brings her back", "Maya" in run(everyone_for, sam))

            # heads-down hides a group; opening it restores it
            check("mode: heads_down ok", c.post(f"/api/groups/{g2}/mode", json={"mode": "heads_down", "looking_for": ["firmware"]}).json() == {"ok": True})
            ids = [x["group"]["id"] for x in c.get(f"/api/me/{maya}").json()["suggested_groups"]]
            check("mode: heads-down group not suggested", g2 not in ids, str(ids))
            c.post(f"/api/groups/{g2}/mode", json={"mode": "open", "looking_for": ["firmware"]})
            ids = [x["group"]["id"] for x in c.get(f"/api/me/{maya}").json()["suggested_groups"]]
            check("mode: open again is suggested", g2 in ids)
            check("mode: bad mode rejected", c.post(f"/api/groups/{g2}/mode", json={"mode": "loud"}).status_code == 422)
            check("mode: unknown group 404", c.post("/api/groups/999999/mode", json={"mode": "open"}).status_code == 404)

            # needs follow the group's looking_for tags, and only open groups are on the board
            def needs_of(gid):
                return sorted(n["need"] for n in c.get("/api/needs").json() if n["group_id"] == gid)

            c.post(f"/api/groups/{g3}/mode", json={"mode": "open", "looking_for": ["design"]})
            check("needs: one row per tag", needs_of(g3) == ["design"], str(needs_of(g3)))
            c.post(f"/api/groups/{g3}/mode", json={"mode": "open", "looking_for": ["data", "ml"]})
            check("needs: changed tags replace open needs", needs_of(g3) == ["data", "ml"], str(needs_of(g3)))
            c.post(f"/api/groups/{g3}/mode", json={"mode": "heads_down", "looking_for": ["data", "ml"]})
            check("needs: heads-down group is off the board", needs_of(g3) == [])
            c.post(f"/api/groups/{g3}/mode", json={"mode": "open", "looking_for": []})
            check("needs: no tags, no needs", needs_of(g3) == [])
            events.clear()
            c.post(f"/api/groups/{g3}/mode", json={"mode": "open", "looking_for": ["pitch"]})
            ne = [e["data"] for e in events if e["type"] == "needs_updated"]
            check("needs: mode change broadcasts needs_updated", len(ne) == 1 and any(n["need"] == "pitch" for n in ne[0]["needs"]))

            # after meeting Sam, the reason on his table changes to "you know Sam" only if no need matches
            run(db.pool.execute, "UPDATE groups SET looking_for='{}' WHERE id=$1", g2)
            run(db.pool.execute, "INSERT INTO connections (person_a, person_b) VALUES ($1,$2)", min(maya, sam), max(maya, sam))
            top = c.get(f"/api/me/{maya}").json()["suggested_groups"]
            t2 = next((x for x in top if x["group"]["id"] == g2), None)
            check("known member counts and explains", t2 is not None and t2["reason"] == "you know Sam" and t2["group"]["known_count"] == 1, str(t2))
        finally:
            pids = [r["id"] for r in run(db.pool.fetch, "SELECT id FROM people WHERE uid LIKE 'MAT%'")]
            gids = [r["group_id"] for r in run(db.pool.fetch, "SELECT DISTINCT group_id FROM group_members WHERE person_id = ANY($1::int[])", pids)]
            run(db.pool.execute, "DELETE FROM needs WHERE group_id = ANY($1::int[])", gids)
            run(db.pool.execute, "DELETE FROM group_members WHERE person_id = ANY($1::int[])", pids)
            run(db.pool.execute, "DELETE FROM groups WHERE id = ANY($1::int[])", gids)
            run(db.pool.execute, "DELETE FROM connections WHERE person_a = ANY($1::int[]) OR person_b = ANY($1::int[])", pids)
            run(db.pool.execute, "DELETE FROM people WHERE id = ANY($1::int[])", pids)
            run(db.pool.execute, "DELETE FROM taps WHERE uid LIKE 'MAT%'")
            run(db.pool.execute, "DELETE FROM scan_events WHERE ts >= $1", started)
    print(f"\n{len(failures)} failed" if failures else "\nall passed")
    return 1 if failures else 0


sys.exit(main())
