"""Read endpoints for the wall and phone (Playbook: Wall <-> server)."""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import claims, db, groups, matching
from .hub import hub
from . import points as P

router = APIRouter(prefix="/api")

# Fixed tags: free text breaks matching ("front end" / "frontend" / "FE").
Skill = Literal["hardware", "firmware", "frontend", "backend", "design", "ml", "data", "mobile", "pitch", "research"]


class Signup(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    role: Literal["student", "mentor", "staff"] = "student"
    skills: list[Skill] = Field(default_factory=list, max_length=3)
    looking_for: list[Skill] = Field(default_factory=list, max_length=2)
    working_on: str = Field(default="", max_length=80)
    # Optional Instagram or LinkedIn. Stored only: no API response includes it during the event. Afterwards it is
    # exported to the people each person connected with.
    contact: str = Field(default="", max_length=80)
    # Try again on the claim page: re-arm the claim for the profile just made (only while it has no badge), instead of a new profile
    retry_person_id: int | None = None


def pool():
    if db.pool is None:
        raise HTTPException(503, "database not configured")
    return db.pool


@router.get("/graph")
async def graph():
    p = pool()
    people = await p.fetch(
        f"""SELECT id, name, role, focus, points, note,
                   (last_checkin IS NOT NULL AND last_checkin > now() - interval '{P.HERE_HOURS} hours') AS here,
                   (SELECT group_id FROM group_members WHERE person_id = people.id
                    ORDER BY joined_at DESC LIMIT 1) AS group_id
            FROM people WHERE uid IS NOT NULL ORDER BY id"""
    )
    grps = await p.fetch(
        "SELECT id, name, station_id, mode, looking_for, working_on, points FROM groups ORDER BY id"
    )
    links = await p.fetch("SELECT person_a AS a, person_b AS b, strength FROM connections ORDER BY id")
    return {
        "people": [dict(r) for r in people],
        "groups": [{**dict(r), "looking_for": r["looking_for"] or []} for r in grps],
        "links": [dict(r) for r in links],
    }


@router.get("/needs")
async def needs():
    async with pool().acquire() as conn:
        return await groups.list_needs(conn)


@router.post("/signup")
async def signup(body: Signup):
    p = pool()
    if claims.waiting():
        # One claim at a time: another sign-up is waiting for its badge.
        raise HTTPException(409, detail={"error": "claim_busy", "retry_in": 5})
    person_id = None
    if body.retry_person_id is not None:
        person_id = await p.fetchval(
            "UPDATE people SET name=$2, role=$3, skills=$4, looking_for=$5, working_on=$6, contact=$7 "
            "WHERE id=$1 AND uid IS NULL AND created_at > now() - interval '30 minutes' RETURNING id",
            body.retry_person_id, body.name.strip(), body.role, list(body.skills), list(body.looking_for),
            body.working_on.strip(), body.contact.strip() or None,
        )
    if person_id is None:
        person_id = await p.fetchval(
            "INSERT INTO people (name, role, skills, looking_for, working_on, contact) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
            body.name.strip(), body.role, list(body.skills), list(body.looking_for), body.working_on.strip(),
            body.contact.strip() or None,
        )
    claim = claims.start(person_id)
    return {"person_id": person_id, "claim_code": claim.code, "expires_in": int(claims.CLAIM_SECONDS)}


@router.get("/claim/{claim_code}")
async def claim_status(claim_code: str):
    code = claim_code.strip().upper()
    s, n = claims.status(code), claims.note(code)
    return {"status": s, "note": n} if s == "waiting" and n else {"status": s}


def _brief(s, gid: int, pid: int) -> dict:
    g = s.groups[gid]
    mem = s.members.get(gid, [])
    return {
        "id": gid, "name": g["name"], "station_id": g["station_id"], "mode": g["mode"],
        "working_on": g["working_on"], "looking_for": list(g["looking_for"] or []),
        "size": len(mem), "known_count": len([m for m in mem if m in s.nbrs[pid]]),
    }


@router.get("/me/{person_id}")
async def me(person_id: int):
    async with pool().acquire() as conn:
        s = await matching.load(conn)
        if person_id not in s.people:
            raise HTTPException(404, "unknown person")
        p = s.people[person_id]
        gid = await conn.fetchval(
            "SELECT group_id FROM group_members WHERE person_id=$1 ORDER BY joined_at DESC LIMIT 1", person_id
        )
    mine = None
    if gid:
        mine = {**_brief(s, gid, person_id), "points": s.groups[gid]["points"],
                "members": [{"id": m, "name": s.people[m]["name"]} for m in s.members.get(gid, []) if m in s.people]}
    return {
        "person": {
            "id": person_id, "name": p["name"], "role": p["role"], "skills": list(p["skills"] or []),
            "looking_for": list(p["looking_for"] or []), "working_on": p["working_on"], "focus": p["focus"],
        },
        "here": person_id in s.here,
        "group": mine,
        "known_here": [{"id": i, "name": s.people[i]["name"]} for i in matching.known_here(s, person_id)],
        "suggested_groups": [
            {"group": _brief(s, x["group_id"], person_id), "score": x["score"], "reason": x["reason"]}
            for x in matching.suggested_groups(s, person_id)
        ],
        "suggested_people": [
            {"person": {"id": x["person_id"], "name": x["name"], "skills": list(s.people[x["person_id"]]["skills"] or [])},
             "score": x["score"], "reason": x["reason"]}
            for x in matching.suggested_people(s, person_id)
        ],
        "points": p["points"],
    }


class Focus(BaseModel):
    focus: bool


@router.post("/me/{person_id}/focus")
async def set_focus(person_id: int, body: Focus):
    row = await pool().fetchrow("UPDATE people SET focus=$2 WHERE id=$1 RETURNING id", person_id, body.focus)
    if row is None:
        raise HTTPException(404, "unknown person")
    return {"ok": True}


class Mode(BaseModel):
    mode: Literal["open", "heads_down"]
    looking_for: list[Skill] = Field(default_factory=list, max_length=2)


@router.post("/groups/{group_id}/mode")
async def set_mode(group_id: int, body: Mode):
    async with pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "UPDATE groups SET mode=$2, looking_for=$3 WHERE id=$1 RETURNING id",
                group_id, body.mode, list(body.looking_for),
            )
            if row is None:
                raise HTTPException(404, "unknown group")
            await groups.sync_needs(conn, group_id, body.looking_for)
        needs_now = await groups.list_needs(conn)
    await hub.broadcast("needs_updated", {"needs": needs_now})
    return {"ok": True}
