"""Optional contact on sign-up: stored, and returned by no API during the event (exported afterwards).

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
                check(f"signup {name} accepted, contact not echoed", r.status_code == 200 and "contact" not in r.json(), r.text)
                ids.append(r.json()["person_id"])
                c.post("/api/tap", json={"station_id": 99, "uid": uid})
                time.sleep(0.2)
            cora, dev, eli = ids

            check("too long a contact is refused (422)",
                  c.post("/api/signup", json={**base, "name": "Test Long", "contact": "x" * 81}).status_code == 422)

            def stored(pid):
                return run(db.pool.fetchval, "SELECT contact FROM people WHERE id=$1", pid)
            check("contact is stored, trimmed", stored(cora) == "@cora.makes", str(stored(cora)))
            check("an empty contact is stored as none", stored(dev) is None)
            check("a LinkedIn contact is stored", stored(eli) == "linkedin.com/in/eli")

            time.sleep(3.2)  # let station 99's claim results clear
            c.post("/api/tap", json={"station_id": 2, "uid": "CONTACT1"})
            c.post("/api/tap", json={"station_id": 2, "uid": "CONTACT2"})
            check("Cora and Dev scan together", wait_state(c, 2, "joined"))

            leaks = []
            for pid in (cora, dev, eli):
                body = c.get(f"/api/me/{pid}").text
                if "cora.makes" in body or "linkedin.com/in/eli" in body or '"contact"' in body:
                    leaks.append(pid)
            check("no /api/me response includes any contact", not leaks, str(leaks))
            me = c.get(f"/api/me/{dev}").json()
            check("/api/me keeps its old keys", set(me) == {"person", "here", "group", "known_here", "suggested_groups",
                                                            "suggested_people", "points"}, str(set(me)))
            check("contacts never appear in /api/graph or /api/needs",
                  not any(x in c.get(u).text for u in ("/api/graph", "/api/needs") for x in ("cora.makes", "linkedin")))
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
