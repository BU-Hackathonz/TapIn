"""Tap In server skeleton: tap endpoint, station state, WebSocket, static mounts."""
import logging
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("tapin")

ROOT = Path(__file__).resolve().parent.parent
STATION_COLORS = {1: "#C85C84", 2: "#5CC8A0"}  # Entrance raspberry, Table 2 green
DEFAULT_COLOR = "#5CC8A0"

app = FastAPI(title="Tap In")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Tap(BaseModel):
    station_id: int
    uid: str


def station_state(station_id: int, state: str = "idle", count: int = 0) -> dict:
    return {"state": state, "count": count, "color": STATION_COLORS.get(station_id, DEFAULT_COLOR)}


@app.post("/api/tap")
async def tap(body: Tap):
    uid = body.uid.strip().upper()
    log.info("tap station=%s uid=%s outcome=logged", body.station_id, uid)
    return station_state(body.station_id)


@app.get("/api/station/{station_id}")
async def station(station_id: int):
    return station_state(station_id)


class Hub:
    """Holds open WebSockets. Broadcasting is added with the event hub step."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()


hub = Hub()


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


# Wall and phone are owned by other teammates; mount them once their folders exist.
for name in ("wall", "phone"):
    folder = ROOT / name
    if folder.is_dir():
        app.mount(f"/{name}", StaticFiles(directory=folder, html=True), name=name)
