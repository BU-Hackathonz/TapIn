"""GET /api/analytics and the scans_per_hour continuous aggregate (built on scans_per_10min).

Run on a test database only: refuses if real people exist (ALLOW_LIVE=1 overrides). Writes scan_events at
fake stations 91 and 92 only, and deletes them afterwards.

    uv run --no-project --with asyncpg --with fastapi --with httpx python tests/analytics_checks.py
"""
import os
import sys
from datetime import timedelta
from pathlib import Path

os.environ.pop("GEMINI_API_KEY", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402

failures: list = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def main() -> int:
    from server import db

    # Start twice: schema.sql runs on every start, so the new view and policy must be idempotent.
    with TestClient(app):
        pass
    with TestClient(app) as c:
        run = c.portal.call
        real = run(db.pool.fetchval, "SELECT count(*) FROM people WHERE name NOT LIKE 'Test %'")
        if real and not os.environ.get("ALLOW_LIVE"):
            print(f"refusing to run: {real} real people in the database (set ALLOW_LIVE=1 to override)")
            return 1
        views = run(db.pool.fetchval, "SELECT count(*) FROM timescaledb_information.continuous_aggregates WHERE view_name='scans_per_hour'")
        check("scans_per_hour exists once after two starts", views == 1, str(views))
        jobs = run(db.pool.fetchval, """SELECT count(*) FROM timescaledb_information.jobs
                                      WHERE proc_name = 'policy_refresh_continuous_aggregate'
                                        AND hypertable_name = 'scans_per_hour'""")
        check("scans_per_hour has exactly one refresh policy", jobs == 1, str(jobs))
        try:
            ins = "INSERT INTO scan_events (ts, station_id, kind, size) VALUES (now() - $1::interval, $2, $3, 1)"
            two_h, one_m = timedelta(hours=2), timedelta(minutes=1)
            for _ in range(3):
                run(db.pool.execute, ins, two_h, 91, "checkin")
            run(db.pool.execute, ins, two_h, 92, "join")
            run(db.pool.execute, ins, one_m, 92, "new_group")
            run(db.pool.execute, ins, one_m, 92, "checkin")

            r = c.get("/api/analytics")
            check("analytics status 200", r.status_code == 200, r.text[:200])
            a = r.json()
            check("analytics keys", set(a) == {"hours", "by_kind_today", "needs"}, str(set(a)))
            check("24 hours, oldest first", len(a["hours"]) == 24 and a["hours"][0]["hour"] < a["hours"][-1]["hour"])
            check("hour keys", all(set(h) == {"hour", "by_station", "total", "busiest_station"} for h in a["hours"]))
            two_ago, now_h = a["hours"][-3], a["hours"][-1]
            check("two hours ago: station 91 busiest (3 vs 1)",
                  two_ago["by_station"].get("91") == 3 and two_ago["by_station"].get("92") == 1
                  and two_ago["busiest_station"] == 91, str(two_ago))
            check("this hour shows up live, before any refresh (real-time)",
                  now_h["by_station"].get("92") == 2 and now_h["busiest_station"] == 92, str(now_h))
            check("an empty hour is zero with no busiest station",
                  a["hours"][-2]["total"] == 0 and a["hours"][-2]["busiest_station"] is None, str(a["hours"][-2]))
            k = a["by_kind_today"]
            check("by_kind_today has all five kinds", set(k) == {"checkin", "join", "new_group", "repeat", "help"}, str(k))
            check("needs has open and met", set(a["needs"]) == {"open", "met"}, str(a["needs"]))
            check("/api/stats still works next to it", c.get("/api/stats").status_code == 200)
        finally:
            run(db.pool.execute, "DELETE FROM scan_events WHERE station_id IN (91, 92)")

    print("all passed" if not failures else f"{len(failures)} failed")
    return 1 if failures else 0


sys.exit(main())
