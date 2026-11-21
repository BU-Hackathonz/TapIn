"""Open WebSockets and event broadcast. Every message is {"type", "ts", "data"} (Playbook: Wall <-> server)."""
import json
import logging
from datetime import datetime, timezone

log = logging.getLogger("tapin.hub")


class Hub:
    def __init__(self) -> None:
        self.clients: set = set()

    async def broadcast(self, type_: str, data: dict) -> None:
        msg = json.dumps({"type": type_, "ts": datetime.now(timezone.utc).isoformat(), "data": data})
        for client in list(self.clients):
            try:
                await client.send_text(msg)
            except Exception:
                self.clients.discard(client)
        log.info("event %s -> %d clients", type_, len(self.clients))


hub = Hub()
