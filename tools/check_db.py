"""Check DATABASE_URL from .env: connects, prints server version and whether TimescaleDB is installed."""
import asyncio
import os
import sys
from pathlib import Path

import asyncpg

for line in (Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


async def main() -> int:
    url = os.environ.get("DATABASE_URL", "")
    if not url or "user:pass@host" in url:
        print("DATABASE_URL is not set in .env")
        return 1
    conn = await asyncpg.connect(url, timeout=10)
    print("connected:", (await conn.fetchval("select version()")).split(",")[0])
    ext = await conn.fetchval("select extversion from pg_extension where extname='timescaledb'")
    print("timescaledb:", ext or "NOT installed")
    await conn.close()
    return 0 if ext else 2


sys.exit(asyncio.run(main()))
