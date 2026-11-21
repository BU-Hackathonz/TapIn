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
        finally:
            pids = [r["id"] for r in pool_run(db.pool.fetch, "SELECT id FROM people WHERE uid LIKE 'API%'")]
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
