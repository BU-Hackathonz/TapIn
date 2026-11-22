"""Host sign-in and room settings, without a database: only the host router is mounted.
Run: uv run --no-project --with fastapi --with httpx python tests/host_checks.py
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import host  # noqa: E402

host.SETTINGS_FILE = Path(tempfile.mkdtemp()) / "settings.json"
app = FastAPI()
app.include_router(host.router)
c = TestClient(app)
fails = 0


def check(name, ok, got=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f"  got {got}"))
    fails += 0 if ok else 1


os.environ.pop("HOST_PIN", None)
check("no PIN set: sign-in is off (503)", c.post("/api/host/login", json={"pin": "1234"}).status_code == 503)
check("me says disabled", c.get("/api/host/me").json() == {"signed_in": False, "enabled": False})

os.environ["HOST_PIN"] = "4821"
check("public settings give the defaults", c.get("/api/room-settings").json() == host.DEFAULTS)
check("settings need sign-in (401)", c.put("/api/host/settings", json=host.DEFAULTS).status_code == 401)
check("wrong PIN (401)", c.post("/api/host/login", json={"pin": "0000"}).status_code == 401)
r = c.post("/api/host/login", json={"pin": "4821"})
check("right PIN (200) sets an HttpOnly cookie", r.status_code == 200 and "httponly" in r.headers.get("set-cookie", "").lower(), r.headers)
check("me says signed in", c.get("/api/host/me").json()["signed_in"] is True)
body = {"venue": "  Kilachand  ", "tables": 8, "marker": "numbers", "sound": False}
r = c.put("/api/host/settings", json=body)
check("save settings (trimmed)", r.status_code == 200 and r.json()["venue"] == "Kilachand", r.text)
check("public settings now show them", c.get("/api/room-settings").json() == {"venue": "Kilachand", "tables": 8, "marker": "numbers", "sound": False})
check("bad table count rejected (422)", c.put("/api/host/settings", json={**body, "tables": 99}).status_code == 422)
check("26 tables (A to Z) allowed", c.put("/api/host/settings", json={**body, "tables": 26}).status_code == 200)
check("bad marker rejected (422)", c.put("/api/host/settings", json={**body, "marker": "x"}).status_code == 422)
check("empty place name rejected (422)", c.put("/api/host/settings", json={**body, "venue": ""}).status_code == 422)
c.post("/api/host/logout")
check("after sign-out settings need sign-in again", c.put("/api/host/settings", json=body).status_code == 401)

host._fails.clear()
codes = [c.post("/api/host/login", json={"pin": "bad"}).status_code for _ in range(7)]
check("five wrong PINs, then 429", codes[:5] == [401] * 5 and codes[5] == 429, codes)
check("even the right PIN waits during the lockout (429)", c.post("/api/host/login", json={"pin": "4821"}).status_code == 429)
print("\n%d failed" % fails if fails else "\nall passed")
sys.exit(1 if fails else 0)
