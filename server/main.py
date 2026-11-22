"""Tap In server: tap endpoint, station state, WebSocket, static mounts."""
import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import api, db, scans, stats
from .hub import hub

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("tapin")

ROOT = Path(__file__).resolve().parent.parent


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.connect()
    stats_task = asyncio.create_task(stats.broadcast_loop())
    yield
    stats_task.cancel()
    with suppress(asyncio.CancelledError):
        await stats_task
    await db.close()


app = FastAPI(title="Tap In", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(api.router)
app.include_router(stats.router)


class Tap(BaseModel):
    station_id: int
    uid: str


@app.post("/api/tap")
async def tap(body: Tap):
    return await scans.on_tap(body.station_id, body.uid.strip().upper())


@app.get("/api/station/{station_id}")
async def station(station_id: int):
    return scans.current_state(station_id)


@app.websocket("/ws")
async def ws(socket: WebSocket):
    await socket.accept()
    hub.clients.add(socket)
    log.info("ws connected (%d open)", len(hub.clients))
    try:
        while True:
            await socket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(socket)
        log.info("ws closed (%d open)", len(hub.clients))


# Wall, phone and intro are owned by other teammates; mount them once their folders exist.
for name in ("wall", "phone", "intro", "landing"):
    folder = ROOT / name
    if folder.is_dir():
        app.mount(f"/{name}", StaticFiles(directory=folder, html=True), name=name)
