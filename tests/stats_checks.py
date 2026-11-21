"""Stats and leaderboard checks: /api/stats, /api/leaderboard and the stats_updated broadcast, against the real database with fake people (uid STA...). Cleans up after itself.

    uv run --no-project --with asyncpg --with fastapi --with httpx --with websockets python tests/stats_checks.py

Skips (exit 0) when DATABASE_URL is not set. Refuses to run if real people exist (cleanup deletes scan_events by time); set ALLOW_LIVE=1 to override.
The stats_updated check needs broadcast_loop started in the app lifespan (marked [lifespan] below); it FAILs if the loop is not running.
"""
import json
import os
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

os.environ.setdefault("TAPIN_WINDOW", "0.3")
os.environ.setdefault("TAPIN_DEDUPE", "1.0")
os.environ.setdefault("TAPIN_STATS_EVERY", "0.5")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from server import db  # noqa: E402
from server.main import app  # noqa: E402

failures: list = []
STATS_KEYS = {"here", "groups", "links_today", "busiest_station", "scans_10min"}
LEADER_KEYS = {"groups", "people"}
ROW_KEYS = {"id", "name", "points"}


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


def is_iso(text: str) -> bool:
    try:
        datetime.fromisoformat(text.replace("Z", "+00:00"))
        return True
    except (TypeError, ValueError):
        return False


def receive_stats_event(ws, timeout: float = 6.0) -> dict | None:
    """Read WebSocket messages until a stats_updated arrives. receive_text blocks, so it runs in a daemon thread."""
    box: dict = {}

    def reader() -> None:
        try:
            while "msg" not in box:
                msg = json.loads(ws.receive_text())
                if msg.get("type") == "stats_updated":
                    box["msg"] = msg
        except Exception as exc:  # the socket closed or the test ended
            box["error"] = repr(exc)

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    t.join(timeout)
    return box.get("msg")


def main() -> int:
    db.load_env()
    url = os.environ.get("DATABASE_URL", "")
    if not url or "user:pass@host" in url:
        print("SKIP stats checks: DATABASE_URL is not set (put it in .env)")
        return 0

    with TestClient(app) as c:
        run = c.portal.call  # run coroutines on the app's loop
        real = run(db.pool.fetchval, "SELECT count(*) FROM people WHERE uid NOT LIKE 'STA%'")
        if real and not os.environ.get("ALLOW_LIVE"):
            print(f"refusing to run: {real} real people in the database (set ALLOW_LIVE=1 to override)")
            return 1
        started = run(db.pool.fetchval, "SELECT now()")
        try:
            pids = {}
            for uid, name in (("STA01", "Sta Ann"), ("STA02", "Sta Ben")):
                pids[uid] = run(
                    db.pool.fetchval,
                    "INSERT INTO people (uid, name, role, skills, looking_for, working_on) "
                    "VALUES ($1,$2,'student',$3,$4,'stats test') RETURNING id",
                    uid, name, ["backend"], ["design"],
                )

            before = c.get("/api/stats").json()
            before_buckets = {b["bucket"]: b["count"] for b in before.get("scans_10min", [])}

            c.post("/api/tap", json={"station_id": 2, "uid": "STA01"})
            c.post("/api/tap", json={"station_id": 2, "uid": "STA02"})
            check("scan resolves to joined", wait_for(c, 2, "joined"))

            # /api/stats shape
            s = c.get("/api/stats")
            check("stats status 200", s.status_code == 200, str(s.status_code))
            stats = s.json()
            check("stats has exact keys", set(stats) == STATS_KEYS, str(set(stats)))
            check("stats types",
                  isinstance(stats.get("here"), int) and isinstance(stats.get("groups"), int)
                  and isinstance(stats.get("links_today"), int)
                  and (stats.get("busiest_station") is None or isinstance(stats.get("busiest_station"), int)),
                  str(stats))

            # counters go up after the scan
            check("here goes up after a 2-person scan", stats["here"] > before["here"],
                  f"before {before['here']}, after {stats['here']}")
            check("groups goes up after a group forms", stats["groups"] > before["groups"],
                  f"before {before['groups']}, after {stats['groups']}")
            check("links_today goes up after a group forms", stats["links_today"] > before["links_today"],
                  f"before {before['links_today']}, after {stats['links_today']}")
            # Compare with the DB rather than assume station 2: other suites (e.g. a claim, which is also a
            # check-in) can leave scans at other stations, and a tie would make a fixed answer flaky.
            counts = {r["station_id"]: r["n"] for r in run(db.pool.fetch,
                      "SELECT station_id, count(*) AS n FROM scan_events WHERE ts > now() - interval '1 hour' GROUP BY 1")}
            top = max(counts.values()) if counts else 0
            check("busiest_station is a station with the most scans in the last hour",
                  stats["busiest_station"] in {s for s, n in counts.items() if n == top}, f"{stats['busiest_station']} vs {counts}")
            check("station 2 counts the scan just made", counts.get(2, 0) >= 1, str(counts))

            # scans_10min: 12 buckets, oldest first, 10 minutes apart; the new scan shows at once (real-time
            # aggregate, not materialized only). Compared per bucket, so a 10-minute boundary in between is fine.
            buckets = stats["scans_10min"]
            check("scans_10min has 12 entries", isinstance(buckets, list) and len(buckets) == 12, str(len(buckets)))
            check("scans_10min entries have exact keys",
                  all(set(b) == {"bucket", "count"} for b in buckets), str(buckets[:1]))
            check("scans_10min bucket is an ISO string", all(is_iso(b["bucket"]) for b in buckets),
                  str(buckets[:1]))
            check("scans_10min counts are ints", all(isinstance(b["count"], int) for b in buckets), str(buckets[:1]))
            times = [datetime.fromisoformat(b["bucket"]) for b in buckets if is_iso(b["bucket"])]
            check("scans_10min is oldest first, 10 minutes apart",
                  len(times) == 12 and all((y - x).total_seconds() == 600 for x, y in zip(times, times[1:])),
                  str([b["bucket"] for b in buckets[:2]]))

            def went_up(rows) -> bool:
                return any(r["count"] > before_buckets.get(r["bucket"], 0) for r in rows)

            end = time.time() + 5
            while not went_up(buckets) and time.time() < end:
                time.sleep(0.3)
                buckets = c.get("/api/stats").json()["scans_10min"]
            check("the new scan shows in scans_10min right away", went_up(buckets),
                  f"before {before_buckets}, after {buckets}")

            # leaderboard shape and order
            lb = c.get("/api/leaderboard")
            check("leaderboard status 200", lb.status_code == 200, str(lb.status_code))
            board = lb.json()
            check("leaderboard has exact keys", set(board) == LEADER_KEYS, str(set(board)))
            for part in ("groups", "people"):
                rows = board.get(part, [])
                check(f"leaderboard {part} has at most 5", len(rows) <= 5, str(len(rows)))
                check(f"leaderboard {part} rows have exact keys",
                      all(set(r) == ROW_KEYS for r in rows), str(rows[:1]))
                pts = [r["points"] for r in rows]
                check(f"leaderboard {part} sorted by points desc", pts == sorted(pts, reverse=True), str(pts))

            # a high-points person and group must appear in the top 5
            run(db.pool.execute, "UPDATE people SET points = 99999 WHERE uid = 'STA01'")
            gid = run(db.pool.fetchval, "SELECT group_id FROM group_members WHERE person_id = $1 LIMIT 1", pids["STA01"])
            if gid:
                run(db.pool.execute, "UPDATE groups SET points = 99999 WHERE id = $1", gid)
            board = c.get("/api/leaderboard").json()
            check("high-points person is on the people leaderboard",
                  any(r["id"] == pids["STA01"] and r["points"] == 99999 for r in board["people"]),
                  str(board["people"]))
            check("high-points group is on the groups leaderboard",
                  gid is not None and any(r["id"] == gid and r["points"] == 99999 for r in board["groups"]),
                  str(board["groups"]))

            # [lifespan] stats_updated over /ws every TAPIN_STATS_EVERY seconds
            with c.websocket_connect("/ws") as ws:
                msg = receive_stats_event(ws)
            check("[lifespan] stats_updated arrives on /ws (needs broadcast_loop in lifespan)", msg is not None)
            if msg:
                check("[lifespan] stats_updated has the stats keys",
                      set(msg.get("data", {})) == STATS_KEYS, str(set(msg.get("data", {}))))
                check("[lifespan] stats_updated envelope has type, ts, data",
                      set(msg) == {"type", "ts", "data"} and is_iso(msg["ts"]), str(set(msg)))
        finally:
            ids = [r["id"] for r in run(db.pool.fetch, "SELECT id FROM people WHERE uid LIKE 'STA%'")]
            gids = [r["group_id"] for r in run(db.pool.fetch, "SELECT DISTINCT group_id FROM group_members WHERE person_id = ANY($1::int[])", ids)]
            run(db.pool.execute, "DELETE FROM needs WHERE group_id = ANY($1::int[])", gids)
            run(db.pool.execute, "DELETE FROM group_members WHERE person_id = ANY($1::int[])", ids)
            run(db.pool.execute, "DELETE FROM groups WHERE id = ANY($1::int[])", gids)
            run(db.pool.execute, "DELETE FROM connections WHERE person_a = ANY($1::int[]) OR person_b = ANY($1::int[])", ids)
            run(db.pool.execute, "DELETE FROM people WHERE id = ANY($1::int[])", ids)
            run(db.pool.execute, "DELETE FROM taps WHERE uid LIKE 'STA%'")
            run(db.pool.execute, "DELETE FROM scan_events WHERE ts >= $1", started)
    print(f"\n{len(failures)} failed" if failures else "\nall passed")
    return 1 if failures else 0


sys.exit(main())
