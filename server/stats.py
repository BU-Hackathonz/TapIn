"""Stats and leaderboard reads, plus the 30 s stats_updated broadcast (Playbook: Wall <-> server, Avery's backend support)."""
import asyncio
import logging
import os

from fastapi import APIRouter

from . import db
from . import points as P
from .api import pool
from .hub import hub

log = logging.getLogger("tapin.stats")
router = APIRouter(prefix="/api")

HERE = f"{P.HERE_HOURS} hours"

# 12 ten-minute buckets ending with the current one, oldest first. The view has one row per bucket, station
# and kind, so it is summed per bucket; a bucket with no scans comes back as 0. materialized_only = false on
# the view means the newest minutes are included before the policy materializes them.
SCANS_10MIN = """
    WITH b AS (
      SELECT generate_series(time_bucket(INTERVAL '10 minutes', now()) - INTERVAL '110 minutes',
                             time_bucket(INTERVAL '10 minutes', now()),
                             INTERVAL '10 minutes') AS bucket)
    SELECT b.bucket, COALESCE(v.n, 0)::int AS count
    FROM b LEFT JOIN (
      SELECT bucket, sum(n) AS n FROM scans_per_10min
      WHERE bucket >= time_bucket(INTERVAL '10 minutes', now()) - INTERVAL '110 minutes'
      GROUP BY bucket
    ) v ON v.bucket = b.bucket
    ORDER BY b.bucket"""


async def compute_stats() -> dict:
    """Same shape as GET /api/stats and the stats_updated event. Needs db.pool to be set."""
    async with db.pool.acquire() as conn:
        here = await conn.fetchval(
            f"SELECT count(*) FROM people WHERE last_checkin > now() - interval '{HERE}'"
        )
        # Active groups: at least one member checked in during the last HERE_HOURS.
        groups = await conn.fetchval(
            f"""SELECT count(DISTINCT gm.group_id) FROM group_members gm
                JOIN people pe ON pe.id = gm.person_id
                WHERE pe.last_checkin > now() - interval '{HERE}'"""
        )
        # "Today" starts at midnight in P.TIMEZONE, the same rule as the first check-in point. The database
        # session runs in UTC, so date_trunc('day', now()) alone would reset at 7 PM in Boston.
        links_today = await conn.fetchval(
            "SELECT count(*) FROM connections WHERE created_at >= date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1",
            P.TIMEZONE,
        )
        busiest = await conn.fetchval(
            """SELECT station_id FROM scan_events
               WHERE ts > now() - interval '1 hour' AND station_id IS NOT NULL
               GROUP BY station_id ORDER BY count(*) DESC, station_id LIMIT 1"""
        )
        rows = await conn.fetch(SCANS_10MIN)
    return {
        "here": int(here),
        "groups": int(groups),
        "links_today": int(links_today),
        "busiest_station": busiest,
        "scans_10min": [{"bucket": r["bucket"].isoformat(), "count": int(r["count"])} for r in rows],
    }


@router.get("/stats")
async def stats():
    pool()  # 503 when there is no database
    return await compute_stats()


@router.get("/leaderboard")
async def leaderboard():
    p = pool()
    grps = await p.fetch("SELECT id, name, points FROM groups ORDER BY points DESC, id LIMIT 5")
    people = await p.fetch(
        "SELECT id, name, points FROM people WHERE uid IS NOT NULL ORDER BY points DESC, id LIMIT 5"
    )
    return {"groups": [dict(r) for r in grps], "people": [dict(r) for r in people]}


async def broadcast_loop() -> None:
    """Every TAPIN_STATS_EVERY seconds (default 30) send stats_updated to the wall.

    Started as a task in main.py's lifespan and cancelled on shutdown. Skips quietly when there is no database or
    no open WebSocket, and never exits on an error."""
    try:
        every = max(float(os.environ.get("TAPIN_STATS_EVERY", "30")), 0.1)
    except ValueError:
        every = 30.0
    while True:
        await asyncio.sleep(every)
        try:
            if db.pool is None or not hub.clients:
                continue
            await hub.broadcast("stats_updated", await compute_stats())
        except Exception:
            log.exception("stats broadcast failed")
