"""A badge claim also counts as the person's first check-in. Run on a test database only.

Refuses to run if real people exist (set ALLOW_LIVE=1 to override). Cleans up its own rows by id.

    uv run --no-project --with asyncpg --with fastapi --with httpx python tests/claim_checkin_checks.py
"""
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TAPIN_WINDOW", "0.3")
os.environ.setdefault("TAPIN_DEDUPE", "1.0")
os.environ.pop("GEMINI_API_KEY", None)  # no network calls from a test
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from server import points as P  # noqa: E402
from server.hub import hub  # noqa: E402
from server.main import app  # noqa: E402

failures: list = []
events: list = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


class FakeClient:
    async def send_text(self, msg: str) -> None:
        import json
        events.append(json.loads(msg))


def wait(pred, timeout: float = 5.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.05)
    return False


def main() -> int:
    from server import db
    tools = Path(__file__).resolve().parent.parent / "tools"
    sys.path.insert(0, str(tools))

    with TestClient(app) as c:
        run = c.portal.call
        real = run(db.pool.fetchval, "SELECT count(*) FROM people WHERE name NOT LIKE 'Test %'")
        if real and not os.environ.get("ALLOW_LIVE"):
            print(f"refusing to run: {real} real people in the database (set ALLOW_LIVE=1 to override)")
            return 1
        hub.clients.add(FakeClient())
        pid = None
        try:
            su = c.post("/api/signup", json={"name": "Test Claim", "role": "student", "skills": ["firmware"],
                                             "looking_for": [], "working_on": "claim check"}).json()
            pid = su["person_id"]
            r = c.post("/api/tap", json={"station_id": 1, "uid": "CLAIMCHK1"}).json()
            check("the claim tap replies claimed", r["state"] == "claimed", str(r))
            check("claim status is claimed", c.get(f"/api/claim/{su['claim_code']}").json()["status"] == "claimed")

            got = wait(lambda: any(e["type"] == "checked_in" and e["data"]["person_id"] == pid for e in events))
            check("checked_in is broadcast after the claim", got)
            types = [e["type"] for e in events]
            check("person_created comes before checked_in",
                  "person_created" in types and types.index("person_created") < types.index("checked_in"), str(types))
            check("the station keeps showing claimed, not checked_in",
                  c.get("/api/station/1").json()["state"] == "claimed")

            me = c.get(f"/api/me/{pid}").json()
            check("they are here now right after the claim", me["here"] is True, str(me.get("here")))
            check("they got the first check-in point", me["points"] == P.FIRST_CHECKIN, str(me["points"]))
            g = c.get("/api/graph").json()
            check("the wall graph shows them here", any(p["id"] == pid and p["here"] for p in g["people"]))
            kinds = run(db.pool.fetch, "SELECT kind FROM scan_events WHERE station_id=1 AND ts > now() - interval '1 minute'")
            check("a checkin scan_event is logged", any(k["kind"] == "checkin" for k in kinds))

            # Tapping again the same day is a normal check-in with no second first-check-in point.
            time.sleep(1.2)  # past the dedupe
            c.post("/api/tap", json={"station_id": 1, "uid": "CLAIMCHK1"})
            wait(lambda: c.get("/api/station/1").json()["state"] == "checked_in")
            check("a second tap is a normal check-in, no extra point",
                  c.get(f"/api/me/{pid}").json()["points"] == P.FIRST_CHECKIN)
        finally:
            if pid is not None:
                run(db.pool.execute, "DELETE FROM scan_events WHERE station_id=1 AND group_id IS NULL AND ts > now() - interval '5 minutes' AND kind='checkin'")
                run(db.pool.execute, "DELETE FROM taps WHERE uid='CLAIMCHK1'")
                run(db.pool.execute, "DELETE FROM people WHERE id=$1", pid)

    print("all passed" if not failures else f"{len(failures)} failed")
    return 1 if failures else 0


sys.exit(main())
