"""Group scans end to end through groups.resolve with an in-memory stand-in database: no real database needed.
Covers: new table, joining with ONE member, rescanning at another table's station moves you there (and out of your old
table), members re-tapping is a repeat, a mentor scan is help, and points.
Run: uv run --no-project --with asyncpg --with fastapi --with httpx python tests/group_flow_checks.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import groups  # noqa: E402

fails = 0


def check(name, ok, got=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f"  got {got}"))
    fails += 0 if ok else 1


class FakeDB:
    """Just enough of the tables for resolve(): people, groups (with station), group_members, connections, needs."""
    def __init__(self):
        self.people = {i: {"id": i, "role": "student", "looking_for": ["design"], "working_on": "", "points": 0, "here": True}
                       for i in range(1, 9)}
        self.people[8]["role"] = "mentor"
        for i in (11, 12, 13):
            self.people[i] = {"id": i, "role": "student", "looking_for": [], "working_on": "", "points": 0, "here": True}
        self.groups, self.members, self.links, self.next_gid, self.t = {}, [], {}, 100, 0

    def active(self, pid):
        mine = [(t, g) for (g, p, t) in self.members if p == pid]
        for t, g in sorted(mine, reverse=True):
            if any(self.people[p]["here"] for (gg, p, _) in self.members if gg == g):
                return g
        return None

    def table_of(self, pid):
        mine = [(t, g) for (g, p, t) in self.members if p == pid]
        return max(mine)[1] if mine else None

    async def fetch(self, sql, *a):
        if sql.startswith("SELECT * FROM people"):
            return [self.people[i] for i in a[0] if i in self.people]
        if "JOIN people p ON p.id = m.person_id" in sql:
            return [{"person_id": p} for (g, p, _) in self.members if g == a[0] and self.people[p]["here"]]
        if sql.startswith("SELECT person_id FROM group_members"):
            return [{"person_id": p} for (g, p, _) in self.members if g == a[0]]
        if "FROM needs n JOIN groups" in sql or sql.startswith("SELECT need FROM needs"):
            return []
        if sql.startswith("SELECT id, points FROM people"):
            return [{"id": i, "points": self.people[i]["points"]} for i in a[0]]
        if sql.startswith("SELECT id, points FROM groups"):
            return [{"id": g, "points": self.groups[g]["points"]} for g in a[0]]
        return []

    async def fetchval(self, sql, *a):
        if "gm.group_id FROM group_members gm" in sql:
            return self.active(a[0])
        if sql.startswith("SELECT g.id FROM groups g WHERE g.station_id"):
            live = [g for g, v in self.groups.items() if v["station"] == a[0]
                    and any(self.people[p]["here"] for (gg, p, _) in self.members if gg == g)]
            return max(live) if live else None
        if sql.startswith("SELECT station_id FROM groups"):
            return self.groups[a[0]]["station"]
        if sql.startswith("SELECT count(*) FROM connections"):
            return sum(1 for k in self.links if a[0] in k)
        if sql.startswith("INSERT INTO groups"):
            gid = self.next_gid; self.next_gid += 1
            self.groups[gid] = {"station": a[0], "points": 0}
            return gid
        return None

    async def fetchrow(self, sql, *a):
        if sql.lstrip().startswith("INSERT INTO connections"):
            k = (a[0], a[1])
            if k in self.links:
                self.links[k] += 1
                return {"strength": self.links[k], "inserted": False}
            self.links[k] = 1
            return {"strength": 1, "inserted": True}
        return None

    async def execute(self, sql, *a):
        self.t += 1
        if sql.startswith("INSERT INTO group_members"):
            self.members.append((a[0], a[1], self.t))
        elif sql.startswith("DELETE FROM group_members WHERE person_id=$1 AND group_id<>$2"):
            self.members = [m for m in self.members if not (m[1] == a[0] and m[0] != a[1])]
        elif sql.startswith("UPDATE people SET points"):
            self.people[a[0]]["points"] += a[1]
        elif sql.startswith("UPDATE groups SET station_id"):
            self.groups[a[0]]["station"] = a[1]
        elif sql.startswith("UPDATE groups SET points"):
            self.groups[a[0]]["points"] += a[1]


async def scan(db, station, ids):
    kind, state, events = await groups.resolve(db, station, ids)
    return kind, state, [e[0] for e in events], {e[0]: e[1] for e in events}


async def main():
    db = FakeDB()
    k, s, ev, d = await scan(db, 2, [1, 2])
    check("two people, no tables: new table at station 2", k == "new_group" and s == "joined" and "group_formed" in ev, (k, s, ev))
    A = d["group_formed"]["group_id"]
    check("both are at that table", db.table_of(1) == A and db.table_of(2) == A)

    k, s, ev, d = await scan(db, 2, [3, 1])
    check("a newcomer tapping with ONE member joins (no need for the whole table)", k == "join" and "group_joined" in ev and db.table_of(3) == A, (k, ev))
    check("the joiner gets +10 and +5 for the new link", db.people[3]["points"] == 15, db.people[3]["points"])

    k, s, ev, d = await scan(db, 2, [1, 2])
    check("members re-tapping together is a repeat", k == "repeat" and s == "repeat", (k, s))

    k, s, ev, d = await scan(db, 1, [4, 5])
    B = d["group_formed"]["group_id"]
    check("a second table forms at station 1", k == "new_group" and db.groups[B]["station"] == 1)

    # person 3 (table A at station 2) rescans at station 1 with person 4 (table B): 3 moves to B and leaves A
    k, s, ev, d = await scan(db, 1, [3, 4])
    check("rescanning at another table's station with its member: you join THAT table", k == "join" and db.table_of(3) == B, (k, db.table_of(3)))
    check("...and you leave your old table", all(not (g == A and p == 3) for (g, p, _) in db.members))
    check("...even though you tapped first", d["group_joined"]["new_member_ids"] == [3], d.get("group_joined"))

    # tables belong to their station: tapping where no table of theirs is pinned forms a new table there
    k, s, ev, d = await scan(db, 3, [6, 1, 2])
    C = d.get("group_formed", {}).get("group_id")
    check("no table at this station: a new table forms here", k == "new_group" and db.groups[C]["station"] == 3, (k, ev))
    check("...and its people leave their old table", db.table_of(1) == C and db.table_of(2) == C)
    check("tables never move station", db.groups[B]["station"] == 1 and db.groups[A]["station"] == 2)
    k, s, ev, d = await scan(db, 2, [7, 4])
    check("a member of a station-1 table tapping at station 2 doesn't bring anyone into it", db.table_of(7) != B, db.table_of(7))

    k, s, ev, d = await scan(db, 2, [8, 1])
    check("a mentor tapping with a member is help, not a join", k == "help" and "help" in ev and db.table_of(8) is None, (k, ev))
    tables_of_1 = {g for (g, p, _) in db.members if p == 1}
    check("help never leaves a student in two tables", len(tables_of_1) == 1, tables_of_1)


async def solo():
    async def no_matching(conn):
        return None
    groups.matching.load = no_matching                     # suggestions aren't what these checks are about
    groups.matching.suggested_groups = lambda ms, pid: []
    db = FakeDB()
    k, s, ev, d = await scan(db, 5, [11])
    S = d.get("group_formed", {}).get("group_id")
    check("a solo tap at a station with no table starts a table with just them", S and db.table_of(11) == S and s == "checked_in", (k, s, ev))
    k, s, ev, d = await scan(db, 5, [12])
    check("a second solo tap at that station joins that table on their own", db.table_of(12) == S and "group_joined" in ev, (ev, db.table_of(12)))
    check("...and gets the +10 join points", db.people[12]["points"] == 10, db.people[12]["points"])
    k, s, ev, d = await scan(db, 6, [11])
    T = d.get("group_formed", {}).get("group_id")
    check("a solo tap at another station moves you to a table there", T and db.table_of(11) == T and all(not (g == S and p == 11) for (g, p, _) in db.members), (ev,))
    k, s, ev, d = await scan(db, 5, [12])
    check("tapping again at your own table is just a check-in", not any(e in ev for e in ("group_joined", "group_formed")), ev)
    db.people[13]["role"] = "mentor"
    k, s, ev, d = await scan(db, 5, [13])
    check("a mentor tapping solo stays floating (no table)", db.table_of(13) is None, db.table_of(13))


asyncio.run(main())
asyncio.run(solo())
print("\n%d failed" % fails if fails else "\nall passed")
sys.exit(1 if fails else 0)
