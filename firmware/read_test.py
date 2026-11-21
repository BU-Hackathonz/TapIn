"""Lid read test (Playbook: "20/20 reads through the lid"): count badge reads per station, live.

Tap a badge on the closed lid, lift it clear, and repeat. Every read the station accepts is counted
(the station ignores the same badge within 3 s, so wait about 3 s between taps, or alternate two badges).
Stops when every port reaches the target, or on Ctrl+C, and prints PASS/FAIL per station.

    uv run --no-project --with pyserial python firmware/read_test.py COM5 COM7 [--target 20]

Count your own taps out loud: reads = taps means the lid passes. A read that the server answers
"unknown" still counts, since it is the reader we are testing, not the badge.
"""
import argparse
import re
import sys
import threading
import time

import serial

TAP = re.compile(r"TAP uid=(\S+)")
BOOT = re.compile(r"BOOT station=(\d+)")


class Counter:
    def __init__(self, port: str):
        self.port = port
        self.station = "?"
        self.reads = 0
        self.uids: dict = {}
        self.error = ""


def watch(c: Counter, target: int, stop: threading.Event, lock: threading.Lock) -> None:
    try:
        s = serial.Serial(c.port, 115200, timeout=0.3)
        s.dtr = False          # reset the board so its BOOT line tells us the station number (about 5 s to rejoin)
        s.rts = True
        time.sleep(0.1)
        s.rts = False
    except Exception as e:  # port busy (e.g. the Arduino IDE) or unplugged
        c.error = f"{type(e).__name__}: {e}"
        return
    buf = b""
    while not stop.is_set():
        try:
            buf += s.read(256)
        except Exception as e:
            c.error = f"port dropped: {type(e).__name__}"
            return
        while b"\n" in buf:
            raw, buf = buf.split(b"\n", 1)
            line = raw.decode("utf-8", "replace").strip()
            m = BOOT.search(line)
            if m:
                c.station = m.group(1)
            m = TAP.search(line)
            if m:
                with lock:
                    c.reads += 1
                    c.uids[m.group(1)] = c.uids.get(m.group(1), 0) + 1
                    print(f"{time.strftime('%H:%M:%S')}  {c.port} (station {c.station})  read {c.reads}/{target}"
                          f"  badge ...{m.group(1)[-4:]}", flush=True)
    s.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ports", nargs="+", help="serial ports, e.g. COM5 COM7")
    ap.add_argument("--target", type=int, default=20, help="reads needed per station (default 20)")
    ap.add_argument("--minutes", type=float, default=10, help="give up after this long (default 10)")
    a = ap.parse_args()

    counters = [Counter(p) for p in a.ports]
    stop, lock = threading.Event(), threading.Lock()
    threads = [threading.Thread(target=watch, args=(c, a.target, stop, lock), daemon=True) for c in counters]
    for t in threads:
        t.start()
    print(f"Resetting the stations; start tapping in about 5 s. Tap each lid {a.target} times, about 3 s apart."
          " Ctrl+C to stop early.", flush=True)
    end = time.time() + a.minutes * 60
    try:
        while time.time() < end and not all(c.reads >= a.target or c.error for c in counters):
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass
    stop.set()
    time.sleep(0.4)

    print("\n=== LID READ TEST ===")
    ok = True
    for c in counters:
        if c.error:
            print(f"{c.port}: ERROR {c.error}")
            ok = False
            continue
        passed = c.reads >= a.target
        ok &= passed
        badges = ", ".join(f"...{u[-4:]} x{n}" for u, n in c.uids.items()) or "none"
        print(f"{c.port} (station {c.station}): {c.reads}/{a.target} reads  {'PASS' if passed else 'FAIL'}  [{badges}]")
    print("Compare with the taps you counted: every tap should be a read.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
