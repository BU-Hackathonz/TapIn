"""Optional contact on sign-up: stored, shown in /api/me only to people you're connected with, nowhere else.

Run on a test database only. Refuses if real people exist (ALLOW_LIVE=1 overrides); cleans up by id.

    uv run --no-project --with asyncpg --with fastapi --with httpx python tests/contact_checks.py
"""
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TAPIN_WINDOW", "0.3")
os.environ.setdefault("TAPIN_DEDUPE", "1.0")
os.environ.pop("GEMINI_API_KEY", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from server.hub import hub  # noqa: E402
from server.main import app  # noqa: E402

failures: list = []
sent: list = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


class FakeClient:
    async def send_text(self, msg: str) -> None:
        sent.append(msg)


def wait_state(c, station: int, state: str, timeout: float = 6.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if c.get(f"/api/station/{station}").json()["state"] == state:
            return True
        time.sleep(0.1)
    return False


def main() -> int:
    from server import db

    with TestClient(app) as c:
        run = c.portal.call
        real = run(db.pool.fetchval, "SELECT count(*) FROM people WHERE name NOT LIKE 'Test %'")
        if real and not os.environ.get("ALLOW_LIVE"):
            print(f"refusing to run: {real} real people in the database (set ALLOW_LIVE=1 to override)")
            return 1
        hub.clients.add(FakeClient())
        ids = []
        try:
            base = {"role": "student", "skills": ["design"], "looking_for": [], "working_on": "contact check"}
            people = [("Test Cora", "CONTACT1", "  @cora.makes  "), ("Test Dev", "CONTACT2", ""), ("Test Eli", "CONTACT3", "linkedin.com/in/eli")]
            for name, uid, contact in people:
                r = c.post("/api/signup", json={**base, "name": name, "contact": contact})
                check(f"signup {name} accepted", r.status_code == 200, r.text)
                ids.append(r.json()["person_id"])
                c.post("/api/tap", json={"station_id": 99, "uid": uid})
                time.sleep(0.2)
            cora, dev, eli = ids

            check("too long a contact is refused (422)",
                  c.post("/api/signup", json={**base, "name": "Test Long", "contact": "x" * 81}).status_code == 422)

            me = c.get(f"/api/me/{cora}").json()
            check("own contact is trimmed and shown in person", me["person"]["contact"] == "@cora.makes", str(me["person"]))
            check("no connections yet", me["connections"] == [], str(me["connections"]))
            check("empty contact is stored as none", c.get(f"/api/me/{dev}").json()["person"]["contact"] is None)

            time.sleep(3.2)  # let station 99's claim results clear
            c.post("/api/tap", json={"station_id": 2, "uid": "CONTACT1"})
            c.post("/api/tap", json={"station_id": 2, "uid": "CONTACT2"})
            check("Cora and Dev scan together", wait_state(c, 2, "joined"))

            conns = c.get(f"/api/me/{cora}").json()["connections"]
            check("Cora sees Dev in connections, with no contact", conns == [{"id": dev, "name": "Test Dev", "contact": None}], str(conns))
            conns = c.get(f"/api/me/{dev}").json()["connections"]
            check("Dev sees Cora's contact", conns == [{"id": cora, "name": "Test Cora", "contact": "@cora.makes"}], str(conns))
            check("Eli, not connected, sees no one", c.get(f"/api/me/{eli}").json()["connections"] == [])

            graph = json.dumps(c.get("/api/graph").json())
            check("contacts never appear in /api/graph", "cora.makes" not in graph and "linkedin" not in graph)
            check("contacts never go out on /ws", not any("cora.makes" in m or "linkedin.com/in/eli" in m for m in sent))

            # Last: it leaves a claim waiting, and while one waits owned badges are refused at the stations.
            r = c.post("/api/signup", json={**base, "name": "Test Old"})
            check("old body without contact still works", r.status_code == 200, r.text)
            if r.status_code == 200:
                ids.append(r.json()["person_id"])
                # Not claimed yet, so /api/me is 404 for them: read the row.
                check("and stores no contact", run(db.pool.fetchval, "SELECT contact FROM people WHERE id=$1", ids[-1]) is None)
        finally:
            for pid in ids:
                run(db.pool.execute, "DELETE FROM group_members WHERE person_id=$1", pid)
                run(db.pool.execute, "DELETE FROM connections WHERE person_a=$1 OR person_b=$1", pid)
                run(db.pool.execute, "DELETE FROM people WHERE id=$1", pid)
            run(db.pool.execute, "DELETE FROM taps WHERE uid LIKE 'CONTACT%'")
            run(db.pool.execute, "DELETE FROM groups g WHERE working_on='contact check' AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id=g.id)")

    print("all passed" if not failures else f"{len(failures)} failed")
    return 1 if failures else 0


sys.exit(main())
