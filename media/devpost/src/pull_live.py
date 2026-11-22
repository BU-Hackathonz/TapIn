"""Refresh data.json["live"] from the live Tiger Data database. Read-only, counts only: no names, no badge IDs.

    python pull_live.py C:/path/to/.env      # reads DATABASE_URL from that file; never prints it

Every tap and scan since Saturday 10 AM is counted, our own testing included (the stations can't tell a teammate's
badge from anyone else's); the people numbers use tools/count.py's rule (real people only).
"""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import asyncpg

START = datetime(2026, 11, 21, 15, 0, tzinfo=timezone.utc)   # Saturday 10:00 AM Boston time
DATA = Path(__file__).parent / "data.json"


def dsn(env_path):
    for line in Path(env_path).read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("no DATABASE_URL in that file")


async def main(env_path):
    conn = await asyncpg.connect(dsn(env_path))
    try:
        hourly = await conn.fetch(
            "SELECT time_bucket('1 hour', ts) AS h, station_id, count(*) AS n FROM taps WHERE ts > $1::timestamptz "
            "GROUP BY 1, 2 ORDER BY 1, 2", START)
        kinds = await conn.fetch("SELECT kind, count(*) AS n FROM scan_events WHERE ts > $1::timestamptz GROUP BY 1 ORDER BY 2 DESC", START)
        agg = await conn.fetch(
            "SELECT hour, sum(n) AS n FROM scans_per_hour WHERE hour > $1::timestamptz GROUP BY 1 ORDER BY 1", START)
    finally:
        await conn.close()
    d = json.loads(DATA.read_text())
    d["live"] = {
        "pulled_at": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "taps_by_hour": [{"hour": r["h"].isoformat(), "station": r["station_id"], "n": r["n"]} for r in hourly],
        "scans_by_kind": {r["kind"]: r["n"] for r in kinds},
        "scans_per_hour_aggregate": [{"hour": r["hour"].isoformat(), "n": int(r["n"])} for r in agg],
    }
    DATA.write_text(json.dumps(d, indent=1))
    t = sum(r["n"] for r in hourly)
    print(f"taps since Sat 10 AM: {t} | scans by kind: {d['live']['scans_by_kind']} | aggregate hours: {len(agg)}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
