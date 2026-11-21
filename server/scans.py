"""Scan windows (Playbook: Scan windows, the hard part).

One event loop means two taps never run on_tap at the same instant. The window is popped from `windows`
before it is resolved, so a tap that lands mid-resolve opens a fresh window instead of corrupting the old one.
Two stations never share a window.
"""
import asyncio
import logging
import os
import time
from dataclasses import dataclass, field

from . import claims, db, gemini, groups
from .hub import hub

log = logging.getLogger("tapin.scans")

WINDOW_SECONDS = float(os.environ.get("TAPIN_WINDOW", "6"))
DEDUPE_SECONDS = float(os.environ.get("TAPIN_DEDUPE", "3"))
RESULT_SECONDS = 2.0  # result states last this long, then back to idle

STATION_COLORS = {1: "#C85C84", 2: "#5CC8A0"}  # Entrance raspberry, Table 2 green
DEFAULT_COLOR = "#5CC8A0"


@dataclass
class Window:
    person_ids: list = field(default_factory=list)
    timer: "asyncio.Task | None" = None


windows: dict = {}      # station_id -> open Window
last_seen: dict = {}    # (station_id, uid) -> monotonic time of the last tap
results: dict = {}      # station_id -> (state, expires_at)
resolving: dict = {}    # station_id -> badge count of a closed window still being written to the DB
_background: set = set()  # claim check-in tasks, kept referenced until they finish
resolve_lock = asyncio.Lock()  # scan database writes happen one at a time


def station_state(station_id: int, state: str = "idle", count: int = 0) -> dict:
    return {"state": state, "count": count, "color": STATION_COLORS.get(station_id, DEFAULT_COLOR)}


def current_state(station_id: int) -> dict:
    w = windows.get(station_id)
    if w:
        return station_state(station_id, "collecting", len(w.person_ids))
    if station_id in resolving:  # window closed, result not set yet: keep showing collecting, not idle
        return station_state(station_id, "collecting", resolving[station_id])
    r = results.get(station_id)
    if r and r[1] > time.monotonic():
        return station_state(station_id, r[0])
    if claims.waiting():
        return station_state(station_id, "claim")  # every station pulses white while a sign-up waits
    return station_state(station_id)


def set_result(station_id: int, state: str) -> dict:
    results[station_id] = (state, time.monotonic() + RESULT_SECONDS)
    return station_state(station_id, state)


async def on_tap(station_id: int, uid: str) -> dict:
    now = time.monotonic()
    prev = last_seen.get((station_id, uid))
    last_seen[(station_id, uid)] = now  # every tap refreshes it, so a card held on the reader counts once
    if prev is not None and now - prev < DEDUPE_SECONDS:
        await db.log_tap(station_id, uid, "ignored")
        return current_state(station_id)

    if db.pool is None:
        log.warning("tap station=%s uid=%s outcome=no_database", station_id, uid)
        return current_state(station_id)

    person = await db.pool.fetchrow("SELECT id FROM people WHERE uid=$1", uid)

    claim = claims.waiting()
    if claim:
        if person is not None:  # already-owned badge is refused; the claim keeps waiting
            log.info("tap station=%s uid=%s outcome=claim_refused_owned", station_id, uid)
            await db.log_tap(station_id, uid, "unknown")
            return set_result(station_id, "unknown")
        return await finish_claim(station_id, uid, claim)

    if person is None:
        log.info("tap station=%s uid=%s outcome=unknown", station_id, uid)
        await db.log_tap(station_id, uid, "unknown")
        await hub.broadcast("unknown_badge", {"station_id": station_id})
        return set_result(station_id, "unknown")

    w = windows.setdefault(station_id, Window())
    if person["id"] not in w.person_ids:
        w.person_ids.append(person["id"])
    if w.timer:
        w.timer.cancel()
    w.timer = asyncio.create_task(close_after(station_id, WINDOW_SECONDS))
    log.info("tap station=%s uid=%s outcome=collecting count=%d", station_id, uid, len(w.person_ids))
    await db.log_tap(station_id, uid, "collecting")
    return station_state(station_id, "collecting", len(w.person_ids))


async def finish_claim(station_id: int, uid: str, claim: claims.Claim) -> dict:
    try:
        row = await db.pool.fetchrow(
            "UPDATE people SET uid=$1 WHERE id=$2 AND uid IS NULL RETURNING id, name, role", uid, claim.person_id
        )
    except Exception:  # unique violation: someone linked this badge a moment ago
        row = None
    if row is None:
        log.warning("tap station=%s uid=%s outcome=claim_failed person=%s", station_id, uid, claim.person_id)
        await db.log_tap(station_id, uid, "unknown")
        return set_result(station_id, "unknown")
    claims.finish(claim)
    log.info("tap station=%s uid=%s outcome=claimed person=%s", station_id, uid, row["id"])
    await db.log_tap(station_id, uid, "claimed")
    await hub.broadcast("person_created", {"person_id": row["id"], "name": row["name"], "role": row["role"]})
    # The claim tap also counts as their first check-in (here now, the first check-in point, suggestions on the
    # wall), like a solo tap: most people walk away after "Got it". It runs in the background so the station's
    # reply is not held up by the database, and the station keeps showing "claimed", not "checked_in".
    task = asyncio.create_task(resolve_scan(station_id, [row["id"]], show_result=False))
    _background.add(task)
    task.add_done_callback(_background.discard)
    return set_result(station_id, "claimed")


async def close_after(station_id: int, delay: float) -> None:
    await asyncio.sleep(delay)
    w = windows.pop(station_id, None)  # pop FIRST: a tap during resolve opens a fresh window
    if w:
        resolving[station_id] = len(w.person_ids)
        try:
            await resolve_scan(station_id, w.person_ids)
        finally:
            resolving.pop(station_id, None)


async def resolve_scan(station_id: int, person_ids: list, show_result: bool = True) -> None:
    """Write one scan and broadcast its events. show_result=False leaves the station's light alone (claim check-in)."""
    try:
        async with resolve_lock:
            async with db.pool.acquire() as conn:
                async with conn.transaction():
                    kind, state, events = await groups.resolve(conn, station_id, person_ids)
    except Exception:
        log.exception("scan failed station=%s people=%s", station_id, person_ids)
        if show_result:
            set_result(station_id, "idle")
        return
    if show_result:
        set_result(station_id, state)
    log.info("scan station=%s people=%s kind=%s state=%s", station_id, person_ids, kind, state)
    for type_, data in events:
        await hub.broadcast(type_, data)
        if type_ == "checked_in" and data["suggested_groups"]:
            gemini.spawn(data["person_id"], data["suggested_groups"][0]["group_id"])  # background, never blocks
