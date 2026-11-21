"""Read endpoints for the wall and phone (Playbook: Wall <-> server)."""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import claims, db, groups
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
    person_id = await p.fetchval(
        "INSERT INTO people (name, role, skills, looking_for, working_on) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        body.name.strip(), body.role, list(body.skills), list(body.looking_for), body.working_on.strip(),
    )
    claim = claims.start(person_id)
    return {"person_id": person_id, "claim_code": claim.code, "expires_in": int(claims.CLAIM_SECONDS)}


@router.get("/claim/{claim_code}")
async def claim_status(claim_code: str):
    return {"status": claims.status(claim_code.strip().upper())}
