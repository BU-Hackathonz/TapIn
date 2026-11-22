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

router = APIRouter()

COOKIE = "tapin_host"
SESSION_SECONDS = 12 * 3600
FAIL_LIMIT, FAIL_WINDOW = 5, 60            # five wrong PINs per minute per address, then wait
SETTINGS_FILE = Path(__file__).resolve().parent.parent / ".host_settings.json"

_sessions: dict[str, float] = {}           # token -> expiry
_fails: dict[str, list[float]] = {}        # address -> times of recent wrong PINs

DEFAULTS = {"venue": "spark!", "tables": 5, "marker": "letters", "sound": True}


def _pin() -> str:
    return os.environ.get("HOST_PIN", "").strip()


def _load() -> dict:
    try:
        stored = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        stored = {}
    return {**DEFAULTS, **{k: v for k, v in stored.items() if k in DEFAULTS}}


class Settings(BaseModel):
    venue: str = Field(DEFAULTS["venue"], min_length=1, max_length=40)
    tables: int = Field(DEFAULTS["tables"], ge=0, le=12)       # 0 shows every table
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


@router.post("/api/host/login")
async def login(body: Login, request: Request, response: Response):
    pin = _pin()
    if not pin:
        raise HTTPException(503, "Host sign-in is off: set HOST_PIN on the server")
    who = request.client.host if request.client else "?"
    now = time.time()
    recent = [t for t in _fails.get(who, []) if now - t < FAIL_WINDOW]
    if len(recent) >= FAIL_LIMIT:
        raise HTTPException(429, "Too many tries. Wait a minute.")
    if not hmac.compare_digest(body.pin.encode(), pin.encode()):
        _fails[who] = recent + [now]
        raise HTTPException(401, "That PIN is not right")
    _fails.pop(who, None)
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
