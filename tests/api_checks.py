"""Endpoint checks against the real database with fake people (uid API...). Cleans up after itself.

    uv run --no-project --with asyncpg --with fastapi --with httpx python tests/api_checks.py
"""
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TAPIN_WINDOW", "0.3")
os.environ.setdefault("TAPIN_DEDUPE", "1.0")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402

failures: list = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def wait_for(client, station: int, state: str, timeout: float = 8.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if client.get(f"/api/station/{station}").json()["state"] == state:
            return True
        time.sleep(0.15)
    return False


def main() -> int:
    from server import db

    with TestClient(app) as c:
        try:
            pool_run = c.portal.call  # run coroutines on the app's loop
            for uid, name in (("API01", "Ann"), ("API02", "Ben")):
                pool_run(db.pool.execute, "INSERT INTO people (uid, name, role, skills) VALUES ($1,$2,'student',$3)", uid, name, ["backend"])
            c.post("/api/tap", json={"station_id": 2, "uid": "API01"})
            c.post("/api/tap", json={"station_id": 2, "uid": "API02"})
            check("scan resolves to joined", wait_for(c, 2, "joined"))

            g = c.get("/api/graph").json()
            mine = [p for p in g["people"] if p["name"] in ("Ann", "Ben")]
            check("graph has both people here, in one group",
                  len(mine) == 2 and all(p["here"] for p in mine) and len({p["group_id"] for p in mine}) == 1 and mine[0]["group_id"])
            check("graph person has contract keys",
                  set(mine[0]) == {"id", "name", "role", "group_id", "here", "focus", "points", "note"}, str(set(mine[0])))
            gid = mine[0]["group_id"]
            grp = next((x for x in g["groups"] if x["id"] == gid), None)
            check("graph group has contract keys",
                  grp is not None and set(grp) == {"id", "name", "station_id", "mode", "looking_for", "working_on", "points"})
            ids = sorted(p["id"] for p in mine)
            check("graph has the link", any(l["a"] == ids[0] and l["b"] == ids[1] and l["strength"] == 1 for l in g["links"]))

            pool_run(db.pool.execute, "INSERT INTO needs (group_id, need) VALUES ($1, 'design')", gid)
            n = [x for x in c.get("/api/needs").json() if x["group_id"] == gid]
            check("needs listed", len(n) == 1 and n[0]["need"] == "design" and n[0]["handled_by"] is None
                  and set(n[0]) == {"group_id", "table", "need", "since", "handled_by"})

            # signup and claim
            from server import claims
            body = {"name": "Zzcleo", "role": "student", "skills": ["design"], "looking_for": ["firmware"], "working_on": "a lamp"}
            check("signup rejects an unknown skill", c.post("/api/signup", json={**body, "skills": ["knitting"]}).status_code == 422)
            check("signup rejects 4 skills", c.post("/api/signup", json={**body, "skills": ["design", "ml", "data", "pitch"]}).status_code == 422)
            check("signup rejects 3 looking_for", c.post("/api/signup", json={**body, "looking_for": ["design", "ml", "data"]}).status_code == 422)
            time.sleep(2.2)  # let station 2's 2 s "joined" result expire so the claim state shows
            r = c.post("/api/signup", json=body)
            su = r.json()
            check("signup reply shape", r.status_code == 200 and set(su) == {"person_id", "claim_code", "expires_in"} and su["expires_in"] == 30, str(su))
            check("claim waiting", c.get(f"/api/claim/{su['claim_code']}").json() == {"status": "waiting"})
            check("stations show claim", c.get("/api/station/1").json()["state"] == "claim" and c.get("/api/station/2").json()["state"] == "claim")
            r2 = c.post("/api/signup", json={**body, "name": "Zzother"})
            check("second signup is refused while one waits", r2.status_code == 409 and r2.json()["detail"]["error"] == "claim_busy")
            c.post("/api/tap", json={"station_id": 1, "uid": "API01"})
            check("owned badge refused during a claim", c.get("/api/station/1").json()["state"] == "unknown"
                  and c.get(f"/api/claim/{su['claim_code']}").json()["status"] == "waiting")
            r = c.post("/api/tap", json={"station_id": 1, "uid": "api03"})
            check("blank badge claims", r.json()["state"] == "claimed", str(r.json()))
            check("claim status claimed", c.get(f"/api/claim/{su['claim_code']}").json() == {"status": "claimed"})
            uid = pool_run(db.pool.fetchval, "SELECT uid FROM people WHERE id=$1", su["person_id"])
            check("badge linked (uppercased)", uid == "API03", str(uid))
            check("claimed person is on the graph", any(p["id"] == su["person_id"] for p in c.get("/api/graph").json()["people"]))

            claims.CLAIM_SECONDS = 1.0
            r = c.post("/api/signup", json={**body, "name": "Zzdee"}).json()
            time.sleep(1.4)
            check("claim expires", c.get(f"/api/claim/{r['claim_code']}").json() == {"status": "expired"})
            c.post("/api/tap", json={"station_id": 1, "uid": "API04"})
            check("expired claim does not link a badge", c.get("/api/station/1").json()["state"] == "unknown")
            check("unknown claim code is expired", c.get("/api/claim/NOPE99").json() == {"status": "expired"})
        finally:
            pids = [r["id"] for r in pool_run(db.pool.fetch, "SELECT id FROM people WHERE uid LIKE 'API%' OR name LIKE 'Zz%'")]
            gids = [r["group_id"] for r in pool_run(db.pool.fetch, "SELECT DISTINCT group_id FROM group_members WHERE person_id = ANY($1::int[])", pids)]
            pool_run(db.pool.execute, "DELETE FROM needs WHERE group_id = ANY($1::int[])", gids)
            pool_run(db.pool.execute, "DELETE FROM group_members WHERE person_id = ANY($1::int[])", pids)
            pool_run(db.pool.execute, "DELETE FROM groups WHERE id = ANY($1::int[])", gids)
            pool_run(db.pool.execute, "DELETE FROM connections WHERE person_a = ANY($1::int[]) OR person_b = ANY($1::int[])", pids)
            pool_run(db.pool.execute, "DELETE FROM people WHERE id = ANY($1::int[])", pids)
            pool_run(db.pool.execute, "DELETE FROM taps WHERE uid LIKE 'API%'")
            pool_run(db.pool.execute, "DELETE FROM scan_events WHERE group_id = ANY($1::int[])", gids)
    print(f"\n{len(failures)} failed" if failures else "\nall passed")
    return 1 if failures else 0


sys.exit(main())
