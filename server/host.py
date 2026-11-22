"""Host sign-in and room settings.

A host signs in with one PIN (HOST_PIN in .env). With no PIN set, host sign-in is switched off (nothing is guessable by default).
A good PIN sets an HttpOnly cookie; the token lives in memory, so a server restart signs everyone out.
Settings are the things the room display reads: venue name, how many tables to show, table naming, sound.
GET /api/room-settings is public (the wall reads it); everything under /api/host needs the cookie.
"""
import hmac
import json
import os
import secrets
import time
from pathlib import Path

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .envfile import env_value   # same reading as .env: quotes and a trailing # note are not part of the PIN

router = APIRouter()

COOKIE = "tapin_host"
SESSION_SECONDS = 12 * 3600
FAIL_LIMIT, FAIL_WINDOW = 5, 60            # five wrong PINs per minute per address, then wait
SETTINGS_FILE = Path(__file__).resolve().parent.parent / ".host_settings.json"

_sessions: dict[str, float] = {}           # token -> expiry
_fails: dict[str, list[float]] = {}        # address -> times of recent wrong PINs

DEFAULTS = {"venue": "spark!", "tables": 8, "marker": "letters", "sound": True}   # the host wall shows the top 8 tables


def _pin() -> str:
    return env_value(os.environ.get("HOST_PIN", ""))


def _load() -> dict:
    try:
        stored = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        stored = {}
    return {**DEFAULTS, **{k: v for k, v in stored.items() if k in DEFAULTS}}


class Settings(BaseModel):
    venue: str = Field(DEFAULTS["venue"], min_length=1, max_length=40)
    tables: int = Field(DEFAULTS["tables"], ge=0, le=26)       # 0 shows every table; letters run A to Z
    marker: str = Field(DEFAULTS["marker"], pattern="^(letters|numbers)$")
    sound: bool = DEFAULTS["sound"]


class Login(BaseModel):
    pin: str = Field(..., max_length=64)


def _signed_in(token: str | None) -> bool:
    exp = _sessions.get(token or "")
    if exp is None:
        return False
    if exp < time.time():
        _sessions.pop(token, None)
        return False
    return True


def require_host(tapin_host: str | None = Cookie(default=None)) -> None:
    if not _signed_in(tapin_host):
        raise HTTPException(401, "Host sign-in needed")


def _check_pin(body: Login, request: Request) -> None:
    """The host PIN, with the lockout: five wrong tries a minute per address, then wait."""
    pin = _pin()
    if not pin:
        raise HTTPException(503, "Host sign-in is off: set HOST_PIN on the server")
    who = request.client.host if request.client else "?"
    now = time.time()
    recent = [t for t in _fails.get(who, []) if now - t < FAIL_WINDOW]
    if len(recent) >= FAIL_LIMIT:
        raise HTTPException(429, "Too many tries. Wait a minute.")
    if not hmac.compare_digest(body.pin.strip().encode(), pin.encode()):   # a space typed before or after doesn't count
        _fails[who] = recent + [now]
        raise HTTPException(401, "That PIN is not right")
    _fails.pop(who, None)


@router.post("/api/host/login")
async def login(body: Login, request: Request, response: Response):
    _check_pin(body, request)
    now = time.time()
    token = secrets.token_urlsafe(32)
    _sessions[token] = now + SESSION_SECONDS
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, samesite="lax", path="/")
    return {"ok": True}


@router.get("/api/host/me")
async def me(tapin_host: str | None = Cookie(default=None)):
    return {"signed_in": _signed_in(tapin_host), "enabled": bool(_pin())}


@router.post("/api/host/logout")
async def logout(response: Response, tapin_host: str | None = Cookie(default=None)):
    _sessions.pop(tapin_host or "", None)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/api/room-settings")
async def room_settings():
    return _load()


@router.put("/api/host/settings")
async def save_settings(body: Settings, tapin_host: str | None = Cookie(default=None)):
    require_host(tapin_host)
    data = body.model_dump()
    data["venue"] = data["venue"].strip() or DEFAULTS["venue"]
    SETTINGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


# ---------------------------------------------------------------- admin: people and their badges (host PIN, venue only)
# Unlinking frees a badge for someone new while the person keeps their profile, points and connections. "Link a badge" starts
# a claim for an existing person, so the next blank badge tapped becomes theirs. Remove deletes a profile (test sign-ups).

ADMIN_COOKIE = "tapin_admin"
ADMIN_SECONDS = 15 * 60                      # the admin panel asks again after 15 minutes, and on every visit
_admin: dict[str, float] = {}


def require_admin(tapin_admin: str | None = Cookie(default=None)) -> None:
    exp = _admin.get(tapin_admin or "")
    if exp is None or exp < time.time():
        _admin.pop(tapin_admin or "", None)
        raise HTTPException(401, "Admin PIN needed")


@router.post("/api/admin/login")
async def admin_login(body: Login, request: Request, response: Response):
    _check_pin(body, request)
    token = secrets.token_urlsafe(32)
    _admin[token] = time.time() + ADMIN_SECONDS
    # no max_age: the cookie ends with the browser session; the server ends it after 15 minutes anyway
    response.set_cookie(ADMIN_COOKIE, token, httponly=True, samesite="strict", path="/api/admin")
    return {"ok": True}


@router.post("/api/admin/logout")
async def admin_logout(response: Response, tapin_admin: str | None = Cookie(default=None)):
    _admin.pop(tapin_admin or "", None)
    response.delete_cookie(ADMIN_COOKIE, path="/api/admin")
    return {"ok": True}


async def _badges_changed(person_id: int) -> None:
    """Tell the walls at once that a badge was unlinked or a profile removed, so they redraw now, not at their next resync."""
    from .hub import hub
    await hub.broadcast("badges_changed", {"person_id": person_id})


def _pool():
    from . import db   # imported here so the host checks run without a database driver
    if db.pool is None:
        raise HTTPException(503, "database not configured")
    return db.pool


@router.get("/api/admin/people")
async def admin_people(tapin_admin: str | None = Cookie(default=None)):
    require_admin(tapin_admin)
    rows = await _pool().fetch(
        """SELECT p.id, p.name, p.role, p.uid, p.points, p.created_at, p.last_checkin,
                  (SELECT count(*) FROM connections c WHERE c.person_a = p.id OR c.person_b = p.id) AS links,
                  (SELECT g.name FROM group_members m JOIN groups g ON g.id = m.group_id
                    WHERE m.person_id = p.id ORDER BY m.joined_at DESC LIMIT 1) AS table_name
           FROM people p ORDER BY p.id DESC LIMIT 500""")
    return [{**dict(r), "created_at": r["created_at"].isoformat() if r["created_at"] else None,
             "last_checkin": r["last_checkin"].isoformat() if r["last_checkin"] else None} for r in rows]


@router.post("/api/admin/people/{person_id}/unlink")
async def admin_unlink(person_id: int, tapin_admin: str | None = Cookie(default=None)):
    require_admin(tapin_admin)
    row = await _pool().fetchrow("UPDATE people SET uid=NULL WHERE id=$1 RETURNING id", person_id)
    if row is None:
        raise HTTPException(404, "No such person")
    await _badges_changed(person_id)
    return {"ok": True}


@router.post("/api/admin/people/{person_id}/link")
async def admin_link(person_id: int, tapin_admin: str | None = Cookie(default=None)):
    require_admin(tapin_admin)
    from . import claims
    if claims.waiting():
        raise HTTPException(409, detail={"error": "claim_busy", "retry_in": 5})
    row = await _pool().fetchrow("SELECT id FROM people WHERE id=$1", person_id)
    if row is None:
        raise HTTPException(404, "No such person")
    c = claims.start(person_id, replace=True)   # their old badge stays theirs until the new one is tapped
    return {"claim_code": c.code, "expires_in": int(claims.CLAIM_SECONDS)}


@router.get("/api/admin/claim/{code}")
async def admin_claim_status(code: str, tapin_admin: str | None = Cookie(default=None)):
    """Live status of a link started here: waiting (and whose badge was tapped by mistake), claimed, or expired."""
    require_admin(tapin_admin)
    from . import claims
    c, s = claims.get(code), claims.status(code)
    out = {"status": s}
    if c and c.note == "owned" and c.owner is not None:
        owner = await _pool().fetchrow("SELECT id, name FROM people WHERE id=$1", c.owner)
        if owner:
            out["owned_by"] = dict(owner)
    return out


@router.post("/api/admin/claim/{code}/cancel")
async def admin_claim_cancel(code: str, tapin_admin: str | None = Cookie(default=None)):
    require_admin(tapin_admin)
    from . import claims
    return {"ok": claims.cancel(code)}


@router.post("/api/admin/people/{person_id}/delete")
async def admin_delete(person_id: int, tapin_admin: str | None = Cookie(default=None)):
    require_admin(tapin_admin)
    async with _pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM group_members WHERE person_id=$1", person_id)
            await conn.execute("DELETE FROM connections WHERE person_a=$1 OR person_b=$1", person_id)
            await conn.execute("UPDATE needs SET handled_by=NULL WHERE handled_by=$1", person_id)
            row = await conn.fetchrow("DELETE FROM people WHERE id=$1 RETURNING id", person_id)
    if row is None:
        raise HTTPException(404, "No such person")
    await _badges_changed(person_id)
    return {"ok": True}
