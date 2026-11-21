"""Read endpoints for the wall and phone (Playbook: Wall <-> server)."""
from fastapi import APIRouter, HTTPException

from . import db, groups
from . import points as P

router = APIRouter(prefix="/api")


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
            FROM people ORDER BY id"""
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
