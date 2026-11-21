"""Stress tests for the scan windows (Playbook: Avery, "Stress tests for David's scan windows").

Runs against a RUNNING server over HTTP, with real POST /api/tap calls and threads for simultaneous taps:

    uv run --no-project --with httpx --with asyncpg python tests/stress_scans.py --server http://localhost:8000

On the laptop: --server http://192.168.8.100:8000

    1  Two badges at station 1 and one at station 2 in the same second -> a group at 1, a check-in at 2.
    2  A at 0 s, B at 5.9 s, A again at 11 s, one station -> one scan of 2 (every tap extends the 6 s window).
    3  A badge held on the reader for 10 s (the same UID every 200 ms) -> counted once.
    4  Kill the router mid-scan -> amber, recovers, the next scan works. Hardware only: prints the checklist.
    5  Extra: concurrency soak, --taps random taps over --seconds across both stations. Every POST must answer
       200 in under 800 ms (the station's HTTP timeout) and both stations must settle back to idle.

Flags: --server URL, --only 1,3 (default: all), --seconds N (soak length, default 60), --taps N (soak taps,
default 20), --allow-live (run even while real people are checked in).

Test people sign up through /api/signup and claim a fresh random badge (UID "T...") with a tap at station 99,
which no real station uses, so a claim tap never debounces a scenario tap or lights a real station.
At the end every row they created is deleted by id (never by time): the people, their links, groups made only
of test people, those groups' needs and scan_events, and their taps. That needs DATABASE_URL here (.env) to be
the server's database; check-in scan_events rows have no group_id and stay (a few extra scans in the chart).
Without DATABASE_URL the "Test ..." people stay in the database, as with tools/fake_taps.py --taps.

While a test claim waits, the next blank badge tapped anywhere would be claimed by the test person, and the
scenarios drive the real stations' windows. So the script refuses to run while real people are checked in
(here now on /api/graph). Pass --allow-live only when nobody is tapping.

Exit code is 0 when every check passes, 1 otherwise.
"""
import argparse
import asyncio
import os
import random
import secrets
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
RESULT_STATES = {"checked_in", "joined", "repeat", "claimed", "unknown"}
HTTP_LIMIT_MS = 800    # the station's HTTP timeout: a slower answer would stall the reader
CLAIM_STATION = 99     # claim taps go to a station id no real station uses
fails: list = []
created_uids: list = []   # every badge this run claimed, for cleanup
created_pids: list = []   # every person this run signed up, for cleanup


def check(name: str, ok: bool, got="") -> None:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"   got: {got}"))
    if not ok:
        fails.append(name)


def get_state(cl: httpx.Client, station: int) -> dict:
    return cl.get(f"/api/station/{station}").json()


def tap(cl: httpx.Client, station: int, uid: str) -> dict:
    return cl.post("/api/tap", json={"station_id": station, "uid": uid}).json()


def wait_idle(cl: httpx.Client, stations=(1, 2), timeout: float = 20) -> None:
    """Wait until every station is back to idle (or claim), so the next scenario starts clean."""
    end = time.time() + timeout
    while time.time() < end:
        if all(get_state(cl, s)["state"] in ("idle", "claim") for s in stations):
            return
        time.sleep(0.2)
    print(f"  (stations still busy after {timeout} s)")


def poll_until(cl: httpx.Client, station: int, deadline: float) -> list:
    """States seen every 100 ms until the deadline (time.time())."""
    seen = []
    while time.time() < deadline:
        seen.append(get_state(cl, station)["state"])
        time.sleep(min(0.1, max(0.0, deadline - time.time())))
    return seen


def collect_results(cl: httpx.Client, stations, timeout: float = 15) -> dict:
    """Poll every 100 ms and keep the first result state each station shows (results last only 2 s)."""
    seen: dict = {}
    end = time.time() + timeout
    while time.time() < end and len(seen) < len(stations):
        for s in stations:
            if s not in seen:
                state = get_state(cl, s)["state"]
                if state in RESULT_STATES:
                    seen[s] = state
        time.sleep(0.1)
    return seen


def group_of(cl: httpx.Client, person_id: int):
    """group_id from /api/graph, or a string describing why it could not be read."""
    try:
        people = cl.get("/api/graph").json()["people"]
    except Exception as e:  # noqa: BLE001 - report, do not crash the run
        return f"graph error: {e!r}"
    for p in people:
        if p["id"] == person_id:
            return p["group_id"]
    return None


def new_person(cl: httpx.Client, name: str) -> tuple:
    """Sign up a 'Test ...' person and claim a fresh random badge at CLAIM_STATION. Returns (uid, person_id)."""
    uid = "T" + secrets.token_hex(6).upper()
    for _ in range(60):  # 409 claim_busy: another sign-up is waiting, retry
        r = cl.post("/api/signup", json={"name": f"Test {name}", "role": "student",
                                         "skills": ["backend"], "looking_for": []})
        if r.status_code != 409:
            r.raise_for_status()
            su = r.json()
            break
        time.sleep(1)
    else:
        raise RuntimeError("signup stayed busy for 60 s")
    created_pids.append(su["person_id"])
    created_uids.append(uid)
    for _ in range(3):  # the next blank badge tapped anywhere claims the sign-up
        if tap(cl, CLAIM_STATION, uid).get("state") == "claimed":
            return uid, su["person_id"]
        if cl.get(f"/api/claim/{su['claim_code']}").json()["status"] == "claimed":
            return uid, su["person_id"]
        time.sleep(3.2)  # the server ignores the same badge at the same station for 3 s
    raise RuntimeError(f"could not claim a badge for {name}")


# ---------------------------------------------------------------- scenarios

def scenario1(cl: httpx.Client) -> None:
    print("1. two badges at station 1 and one at station 2 in the same second")
    wait_idle(cl)
    (a, pa), (b, pb), (c, _) = (new_person(cl, "Ann"), new_person(cl, "Ben"), new_person(cl, "Cy"))
    wait_idle(cl)

    barrier = threading.Barrier(3)  # all three POSTs leave at the same moment

    def fire(station: int, uid: str) -> dict:
        barrier.wait()
        return tap(cl, station, uid)

    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = [ex.submit(fire, 1, a), ex.submit(fire, 1, b), ex.submit(fire, 2, c)]
        replies = [f.result() for f in futures]
    print(f"  replies: {replies}")
    check("1 every tap answered", all(r.get("state") for r in replies), replies)

    res = collect_results(cl, [1, 2])
    check("1 station 1 resolves to joined (a group)", res.get(1) == "joined", res)
    check("1 station 2 resolves to checked_in", res.get(2) == "checked_in", res)
    ga, gb = group_of(cl, pa), group_of(cl, pb)
    check("1 the two station-1 people share a group", ga is not None and ga == gb, (ga, gb))
    wait_idle(cl)


def scenario2(cl: httpx.Client) -> None:
    print("2. A at 0 s, B at 5.9 s, A again at 11 s at station 2: every tap extends the window")
    wait_idle(cl)
    (a, pa), (b, pb) = new_person(cl, "Dee"), new_person(cl, "Eve")
    wait_idle(cl)

    t0 = time.time()
    first = tap(cl, 2, a)
    check("2 A opens a window: collecting 1", first.get("state") == "collecting" and first.get("count") == 1, first)
    before_b = poll_until(cl, 2, t0 + 5.9)
    second = tap(cl, 2, b)
    check("2 B at 5.9 s joins it: collecting 2", second.get("state") == "collecting" and second.get("count") == 2,
          second)
    # A's own window would have closed at 6 s; a result before 11 s means B did not extend it.
    before_a = poll_until(cl, 2, t0 + 11.0)
    third = tap(cl, 2, a)
    check("2 A again at 11 s: same window, still collecting 2",
          third.get("state") == "collecting" and third.get("count") == 2, third)
    # B's extension ends at 11.9 s; a result before 16.5 s means A's second tap did not extend it.
    after_a = poll_until(cl, 2, t0 + 16.5)
    early = (set(before_b) | set(before_a) | set(after_a)) & RESULT_STATES
    check("2 no result while taps keep coming (each tap restarted the 6 s timer)", not early, sorted(early))
    res = collect_results(cl, [2], timeout=10)
    check("2 one scan of 2 resolves to joined", res.get(2) == "joined", res)
    ga, gb = group_of(cl, pa), group_of(cl, pb)
    check("2 A and B share a group", ga is not None and ga == gb, (ga, gb))
    wait_idle(cl)


def scenario3(cl: httpx.Client) -> None:
    print("3. badge held on the reader for 10 s (same UID every 200 ms)")
    wait_idle(cl)
    uid, _ = new_person(cl, "Fay")
    wait_idle(cl)

    replies: list = []
    stop = threading.Event()

    def hold() -> None:
        end = time.time() + 10
        while time.time() < end:
            replies.append(tap(cl, 1, uid))
            time.sleep(0.2)
        stop.set()

    holder = threading.Thread(target=hold)
    holder.start()
    seen: list = []  # (state, count) every 100 ms while the badge is held
    while not stop.is_set():
        s = get_state(cl, 1)
        seen.append((s["state"], s["count"]))
        time.sleep(0.1)
    holder.join()

    check("3 never a collecting count above 1",
          all(cnt <= 1 for st, cnt in seen if st == "collecting"),
          [x for x in seen if x[0] == "collecting" and x[1] > 1][:5])
    check("3 no reply counts above 1",
          all(r.get("count", 0) <= 1 for r in replies), [r for r in replies if r.get("count", 0) > 1][:3])
    entries = sum(1 for prev, (st, _) in zip([("idle", 0)] + seen, seen) if st == "checked_in" and prev[0] != "checked_in")
    check("3 counted once: exactly one checked_in", entries == 1, f"{entries} check-ins seen")
    check("3 never joined", all(st != "joined" for st, _ in seen), seen[:5])
    wait_idle(cl)


def checklist() -> None:
    print("4. MANUAL: kill the router mid-scan (hardware only, no script can do this)")
    print("   [ ] Tap a badge at station 1 so a scan window is open, then unplug the router at once.")
    print("   [ ] Station 1 goes amber within a few seconds (3 failed requests or 3 failed Wi-Fi checks).")
    print("   [ ] Leave it unplugged 10 s, plug it back in. Station 1 returns to its idle breathe by itself,")
    print("       with no reset button and no BOOT line in the serial log.")
    print("   [ ] The next badge tap at station 1 gives a normal check-in (or joined).")
    print("   [ ] Run firmware/serial_monitor.py on the station's port during this: one OFFLINE, one ONLINE.")


def scenario5(cl: httpx.Client, taps: int, seconds: float) -> None:
    print(f"5. concurrency soak: {taps} random taps over {seconds:g} s across both stations")
    wait_idle(cl)
    pool = [new_person(cl, f"Soak{i}")[0] for i in range(6)]
    wait_idle(cl)

    rnd = random.Random()
    plan = sorted((rnd.uniform(0, seconds), rnd.choice([1, 2]), rnd.choice(pool)) for _ in range(taps))
    t0 = time.time()

    def fire(item: tuple) -> tuple:
        offset, station, uid = item
        delay = t0 + offset - time.time()
        if delay > 0:
            time.sleep(delay)
        start = time.perf_counter()
        try:
            status = cl.post("/api/tap", json={"station_id": station, "uid": uid}).status_code
        except httpx.HTTPError as e:
            status = repr(e)
        return (time.perf_counter() - start) * 1000, status

    with ThreadPoolExecutor(max_workers=taps) as ex:
        results = list(ex.map(fire, plan))

    ms = sorted(r[0] for r in results)
    n = len(ms)
    pct = lambda p: ms[min(n - 1, int(p * (n - 1)))]  # noqa: E731 - nearest-rank style index
    print(f"  latency over {n} taps: p50 {pct(0.5):.0f} ms, p95 {pct(0.95):.0f} ms, max {ms[-1]:.0f} ms")
    bad = [r for r in results if r[1] != 200]
    check("5 every POST answers 200", not bad, bad[:3])
    slow = [r for r in results if r[0] >= HTTP_LIMIT_MS]
    check(f"5 every POST under {HTTP_LIMIT_MS} ms", not slow, [f"{r[0]:.0f} ms" for r in slow[:5]])
    wait_idle(cl, timeout=max(20, seconds))
    states = [get_state(cl, s)["state"] for s in (1, 2)]
    check("5 both stations settle back to idle", all(s in ("idle", "claim") for s in states), states)


# ---------------------------------------------------------------- safety and cleanup

def live_people(cl: httpx.Client) -> list:
    """Names of real (non-test) people checked in right now."""
    r = cl.get("/api/graph")
    if r.status_code == 503:
        raise SystemExit("the server has no database (GET /api/graph is 503); the scan scenarios need one")
    r.raise_for_status()
    return [p["name"] for p in r.json()["people"] if p.get("here") and not str(p.get("name", "")).startswith("Test ")]


async def _delete_test_rows(url: str) -> tuple:
    import asyncpg
    conn = await asyncpg.connect(url)
    try:
        async with conn.transaction():
            # By uid, plus sign-ups that never got a badge. Ids alone are not trusted: if DATABASE_URL here is not
            # the server's database, the random "T..." UIDs match nothing and nothing is deleted.
            ids = [r["id"] for r in await conn.fetch(
                "SELECT id FROM people WHERE uid = ANY($1::text[])"
                " OR (id = ANY($2::int[]) AND uid IS NULL AND name LIKE 'Test %')",
                created_uids, created_pids)]
            # Only groups made entirely of test people go; a group with a real member keeps existing.
            gids = [r["id"] for r in await conn.fetch(
                """SELECT g.id FROM groups g
                   WHERE EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.person_id = ANY($1::int[]))
                     AND NOT EXISTS (SELECT 1 FROM group_members m
                                     WHERE m.group_id = g.id AND NOT (m.person_id = ANY($1::int[])))""",
                ids)]
            await conn.execute("DELETE FROM needs WHERE group_id = ANY($1::int[])", gids)
            await conn.execute("DELETE FROM scan_events WHERE group_id = ANY($1::int[])", gids)
            await conn.execute("DELETE FROM group_members WHERE person_id = ANY($1::int[])", ids)
            await conn.execute("DELETE FROM groups WHERE id = ANY($1::int[])", gids)
            await conn.execute(
                "DELETE FROM connections WHERE person_a = ANY($1::int[]) OR person_b = ANY($1::int[])", ids)
            await conn.execute("DELETE FROM people WHERE id = ANY($1::int[])", ids)
            await conn.execute("DELETE FROM taps WHERE uid = ANY($1::text[])", created_uids)
    finally:
        await conn.close()
    return len(ids), len(gids)


def cleanup() -> None:
    """Delete every row the test people created, by id. Never deletes by time."""
    if not created_uids and not created_pids:
        return
    sys.path.insert(0, str(ROOT))
    try:
        from server import db  # reads .env the same way the server does
    except ImportError:
        print("note: asyncpg is not installed, so the 'Test ...' people stay in the database")
        return
    db.load_env()
    url = os.environ.get("DATABASE_URL", "")
    if not url or "user:pass@host" in url:
        print("note: DATABASE_URL is not set here, so the 'Test ...' people stay in the database")
        return
    try:
        people, groups = asyncio.run(_delete_test_rows(url))
        print(f"cleanup: deleted {people} test people and {groups} test groups (check-in scan_events stay)")
    except Exception as e:  # noqa: BLE001 - report, the checks already ran
        print(f"cleanup FAILED, 'Test ...' rows may remain: {e!r}")


def run(fn, *args) -> None:
    """Run one scenario; an exception is a FAIL for that scenario, and the run goes on."""
    try:
        fn(*args)
    except Exception as e:  # noqa: BLE001
        check(f"{fn.__name__} ran to the end", False, repr(e))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--server", default="http://localhost:8000", help="server URL")
    ap.add_argument("--only", default="1,2,3,4,5", help="scenarios to run, e.g. 1,3")
    ap.add_argument("--seconds", type=float, default=60, help="soak length for scenario 5 (default 60)")
    ap.add_argument("--taps", type=int, default=20, help="random taps in the soak (default 20)")
    ap.add_argument("--allow-live", action="store_true", help="run even while real people are checked in")
    a = ap.parse_args()
    only = {int(x) for x in a.only.split(",") if x.strip()}
    a.taps = max(1, a.taps)

    cl = httpx.Client(base_url=a.server.rstrip("/"), timeout=5)
    try:
        get_state(cl, 1)
    except httpx.HTTPError as e:
        print(f"cannot reach {a.server}: {e!r}")
        return 1

    if only & {1, 2, 3, 5}:
        live = live_people(cl)
        if live and not a.allow_live:
            print(f"refusing to run: {len(live)} real people are checked in ({', '.join(live[:5])}). The scenarios"
                  " drive the real stations and claim badges. Run when nobody is tapping, with --allow-live.")
            return 1

    try:
        if 1 in only:
            run(scenario1, cl)
        if 2 in only:
            run(scenario2, cl)
        if 3 in only:
            run(scenario3, cl)
        if 4 in only:
            checklist()
        if 5 in only:
            run(scenario5, cl, a.taps, a.seconds)
    finally:
        cleanup()

    print(f"{len(fails)} failed" if fails else "all automated checks passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
