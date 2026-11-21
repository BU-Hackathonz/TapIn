"""Matching and group fit (Playbook: Matching). Every suggestion carries a plain-words reason.

Person to person, for two people who haven't met: +3 for each of A's "looking for" tags in B's skills and
the same the other way; +1 per shared skill; +1 if no mutual connections; +2 if either has fewer than 2 connections.

Group fit for a person and an open group: the best person score against any member who is here now;
+3 for each of the group's own "looking for" tags the person has (so "Table 2 needs firmware" ranks first for
someone with firmware); +2 if they bring a skill nobody in the group has; +1 for each member they already know.

Never suggested: heads-down groups, people on focus mode, anyone not here now, groups the person is already in.
"""
from collections import defaultdict
from dataclasses import dataclass

from . import points as P


@dataclass
class State:
    people: dict   # id -> row
    here: set      # ids checked in during the last HERE_HOURS
    nbrs: dict     # id -> set of ids they have met
    groups: dict   # id -> row
    members: dict  # group_id -> [person ids]


async def load(conn) -> State:
    people = {r["id"]: r for r in await conn.fetch("SELECT * FROM people WHERE uid IS NOT NULL")}
    here = {
        r["id"]
        for r in await conn.fetch(
            f"SELECT id FROM people WHERE uid IS NOT NULL AND last_checkin > now() - interval '{P.HERE_HOURS} hours'"
        )
    }
    nbrs: dict = defaultdict(set)
    for r in await conn.fetch("SELECT person_a, person_b FROM connections"):
        nbrs[r["person_a"]].add(r["person_b"])
        nbrs[r["person_b"]].add(r["person_a"])
    groups = {r["id"]: r for r in await conn.fetch("SELECT * FROM groups")}
    members: dict = defaultdict(list)
    for r in await conn.fetch("SELECT group_id, person_id FROM group_members"):
        members[r["group_id"]].append(r["person_id"])
    return State(people, here, nbrs, groups, members)


def _tags(row, key) -> list:
    return list(row[key] or [])


def person_score(s: State, a: int, b: int):
    pa, pb = s.people[a], s.people[b]
    wants = [t for t in _tags(pa, "looking_for") if t in _tags(pb, "skills")]   # B has what A wants
    offers = [t for t in _tags(pb, "looking_for") if t in _tags(pa, "skills")]  # A has what B wants
    shared = [t for t in _tags(pa, "skills") if t in _tags(pb, "skills")]
    mutual = s.nbrs[a] & s.nbrs[b]
    newbie = len(s.nbrs[a]) < 2 or len(s.nbrs[b]) < 2
    score = 3 * len(wants) + 3 * len(offers) + len(shared) + (0 if mutual else 1) + (2 if newbie else 0)
    if wants:
        reason = f"does {wants[0]}, which you want"
    elif offers:
        reason = f"wants {offers[0]}, which you do"
    elif mutual:
        reason = f"you both know {s.people[sorted(mutual)[0]]['name']}"
    elif shared:
        reason = f"also does {shared[0]}"
    else:
        reason = "new here"
    return score, reason


def suggested_people(s: State, pid: int, limit: int = 5) -> list:
    if pid not in s.people:
        return []
    out = []
    for other in s.here:
        if other == pid or other in s.nbrs[pid] or s.people[other]["focus"]:
            continue
        score, reason = person_score(s, pid, other)
        out.append({"person_id": other, "name": s.people[other]["name"], "score": score, "reason": reason})
    # Ties go to the person with fewer connections (newcomers first), then the lower id.
    out.sort(key=lambda x: (-x["score"], len(s.nbrs[x["person_id"]]), x["person_id"]))
    return out[:limit]


def suggested_groups(s: State, pid: int, limit: int = 3) -> list:
    if pid not in s.people:
        return []
    me = s.people[pid]
    out = []
    for gid, g in s.groups.items():
        mem = s.members.get(gid, [])
        if g["mode"] != "open" or pid in mem:
            continue
        mem_here = [m for m in mem if m in s.here and m != pid]
        if not mem_here:
            continue  # nobody from this group is here right now
        scored = [(person_score(s, pid, m), m) for m in mem_here]
        (best, best_reason), _ = max(scored, key=lambda x: x[0][0])
        needs = [t for t in _tags(g, "looking_for") if t in _tags(me, "skills")]
        group_skills = {t for m in mem for t in _tags(s.people[m], "skills") if m in s.people}
        lacking = [t for t in _tags(me, "skills") if t not in group_skills]
        known = [m for m in mem if m in s.nbrs[pid]]
        score = best + 3 * len(needs) + (2 if lacking else 0) + len(known)
        if needs:
            reason = f"needs {needs[0]}"
        elif known:
            reason = f"you know {s.people[known[0]]['name']}"
        elif lacking:
            reason = f"could use your {lacking[0]}"
        else:
            reason = best_reason
        out.append({"group_id": gid, "score": score, "reason": reason})
    out.sort(key=lambda x: (-x["score"], x["group_id"]))
    return [x for x in out if x["score"] > 0][:limit]


def known_here(s: State, pid: int) -> list:
    return sorted(i for i in s.nbrs[pid] if i in s.here)
