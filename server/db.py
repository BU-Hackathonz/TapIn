"""Database access: one asyncpg pool from DATABASE_URL (.env), schema bootstrap, tap logging."""
import logging
import os
from pathlib import Path

import asyncpg

from .envfile import env_value

log = logging.getLogger("tapin.db")
ROOT = Path(__file__).resolve().parent.parent
pool: asyncpg.Pool | None = None


def load_env() -> None:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8-sig").splitlines():   # utf-8-sig: a BOM from Notepad doesn't end up in the first key
            line = line.strip()
            if line.startswith("export "):
                line = line[7:]
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), env_value(v))


async def connect() -> None:
    """Open the pool and run schema.sql. If there is no DATABASE_URL the server still runs without a database."""
    global pool
    load_env()
    url = os.environ.get("DATABASE_URL", "")
    if not url or "user:pass@host" in url:
        log.warning("DATABASE_URL not set; running without a database")
        return
    pool = await asyncpg.create_pool(url, min_size=1, max_size=5, command_timeout=10)
    async with pool.acquire() as conn:
        await conn.execute((Path(__file__).parent / "schema.sql").read_text())
    log.info("database ready")


async def close() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None


async def log_tap(station_id: int, uid: str, result: str) -> None:
    """Record one raw tap. Never raises: a database problem must not block the station."""
    if pool is None:
        return
    try:
        await pool.execute(
            "INSERT INTO taps (station_id, uid, result) VALUES ($1, $2, $3)", station_id, uid, result
        )
    except Exception:
        log.exception("could not log tap")
