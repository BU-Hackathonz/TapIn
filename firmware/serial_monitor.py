#!/usr/bin/env python3
"""Tap In station serial monitor: live log, parsing and soak-test summary.

  uv run --no-project --with pyserial python firmware/serial_monitor.py COM5 [COM6 ...] \
      [--minutes 30] [--baud 115200] [--log FILE]
  uv run --no-project --with pyserial python firmware/serial_monitor.py --list

Every line from each port is printed with a local timestamp and the port name.
Ctrl+C or --minutes ends the run and prints a PASS/FAIL summary per port.
"""
import argparse
import math
import os
import re
import sys
import threading
import time
from datetime import datetime

import serial
import serial.tools.list_ports

SLOW_MS = 300        # Playbook check: tap -> reply in under 300 ms
RECONNECT_S = 1.0    # wait before reopening a port that dropped (ESP32 resets on upload)
MAX_LINE = 4096      # bytes; a "line" longer than this without a newline is flushed as is

# One regex per line prefix of the serial log format (the header of firmware/station/station.ino).
PATTERNS = [
    ("boot", re.compile(r"BOOT station=(\S+)")),
    ("wifi_up", re.compile(r"WIFI up ip=(\S+)")),
    ("wifi_down", re.compile(r"WIFI down")),
    ("tap", re.compile(r"TAP uid=(\S+)")),
    ("post_ok", re.compile(r"POST ok ms=(\d+(?:\.\d+)?) state=(\S+) count=(-?\d+)")),
    ("post_fail", re.compile(r"POST fail ms=(\d+(?:\.\d+)?)")),
    ("state", re.compile(r"STATE (\S+) count=(-?\d+)")),
    ("offline", re.compile(r"OFFLINE\s*$")),
    ("online", re.compile(r"ONLINE\s*$")),
    ("reader_reinit", re.compile(r"READER reinit")),
    ("link", re.compile(r"LINK rssi=(-?\d+) polls=(\d+) fails=(\d+) avg_ms=(\d+) max_ms=(\d+)")),
]
# ESP32 crash output (not from the sketch). Any of these means the station is about to reboot.
CRASH = re.compile(r"Guru Meditation Error|Brownout detector|abort\(\) was called|Task watchdog got triggered")

print_lock = threading.Lock()
log_file = None


def emit(port, text):
    """Print one line with timestamp and port, and tee it to --log if set."""
    stamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    line = f"[{stamp} {port}] {text}"
    with print_lock:
        print(line, flush=True)
        if log_file:
            log_file.write(line + "\n")
            log_file.flush()


def parse(line):
    for kind, pattern in PATTERNS:
        m = pattern.match(line)
        if m:
            return kind, m
    m = CRASH.search(line)
    if m:
        return "crash", m
    return None, None


def percentile(sorted_vals, p):
    """Nearest-rank percentile of an already sorted list."""
    if not sorted_vals:
        return None
    idx = max(0, math.ceil(p / 100 * len(sorted_vals)) - 1)
    return sorted_vals[idx]


class PortStats:
    def __init__(self, port):
        self.port = port
        self.lines = 0
        self.boots = 0
        self.reboots = 0               # BOOT lines after the station had already been running
        self.seen_app = False          # any sketch line seen yet (the monitor may start mid-run)
        self.crashes = 0
        self.reader_reinits = 0
        self.wifi_down = 0
        self.offline_events = 0
        self.offline_since = None      # monotonic time when the current OFFLINE started
        self.offline_total = 0.0       # seconds spent offline (closed intervals)
        self.taps = 0
        self.post_ok_ms = []
        self.post_fail = 0
        self.slow_taps = 0
        self.disconnects = 0
        self.last_state = None
        self.rssi = []                 # dBm, one per LINK line (every 30 s)
        self.polls = 0
        self.poll_fails = 0
        self.poll_ms_sum = 0           # sum of per-report averages x polls, for an overall average
        self.poll_ms_max = 0

    def handle(self, kind, m):
        now = time.monotonic()
        if kind == "crash":
            self.crashes += 1
            emit(self.port, "!!! CRASH output from the ESP32")
            return  # not a sketch line
        if kind == "boot":
            self.boots += 1
            # The first BOOT counts as a reboot unless it is the first sketch line we see: the monitor is
            # usually started while the station is already running, so it never saw the original boot.
            if self.seen_app:
                self.reboots += 1
                emit(self.port, f"!!! REBOOT detected (reboot #{self.reboots})")
        elif kind == "reader_reinit":
            self.reader_reinits += 1
            emit(self.port, "!!! READER re-initialized (it stopped answering on SPI)")
        elif kind == "wifi_down":
            self.wifi_down += 1
        elif kind == "tap":
            self.taps += 1
        elif kind == "post_ok":
            ms = float(m.group(1))
            self.post_ok_ms.append(ms)
            self.last_state = m.group(2)
            if ms > SLOW_MS:
                self.slow_taps += 1
                emit(self.port, f"!!! SLOW TAP POST {ms:.0f} ms (> {SLOW_MS} ms)")
        elif kind == "post_fail":
            self.post_fail += 1
            ms = float(m.group(1))
            if ms > SLOW_MS:
                self.slow_taps += 1
                emit(self.port, f"!!! SLOW TAP POST FAIL {ms:.0f} ms (> {SLOW_MS} ms)")
        elif kind == "state":
            self.last_state = m.group(1)
        elif kind == "link":
            rssi, polls, fails, avg, mx = (int(g) for g in m.groups())
            self.rssi.append(rssi)
            self.polls += polls
            self.poll_fails += fails
            self.poll_ms_sum += avg * polls
            self.poll_ms_max = max(self.poll_ms_max, mx)
        elif kind == "offline":
            if self.offline_since is None:
                self.offline_events += 1
                self.offline_since = now
                emit(self.port, "!!! DEVICE OFFLINE")
        elif kind == "online":
            if self.offline_since is not None:
                self.offline_total += now - self.offline_since
                self.offline_since = None
        self.seen_app = True

    def offline_seconds(self):
        extra = time.monotonic() - self.offline_since if self.offline_since is not None else 0.0
        return self.offline_total + extra

    def passed(self):
        return (self.lines > 0 and self.reboots == 0 and self.crashes == 0 and self.offline_events == 0
                and self.post_fail == 0 and self.offline_since is None)


def reader(port, stats, baud, stop):
    """Keep one port open; reconnect whenever it drops."""
    while not stop.is_set():
        try:
            ser = serial.Serial()
            ser.port = port
            ser.baudrate = baud
            ser.timeout = 0.5
            ser.dtr = False   # stop the USB-serial auto-reset on open
            ser.rts = False
            ser.open()
        except (serial.SerialException, OSError):
            stop.wait(RECONNECT_S)
            continue
        emit(port, "--- port open")
        buf = b""
        try:
            while not stop.is_set():
                chunk = ser.readline()
                if not chunk:
                    continue
                buf += chunk
                # readline() returns a partial line when its timeout hits mid-line; keep it for the next read.
                if not buf.endswith(b"\n") and len(buf) < MAX_LINE:
                    continue
                raw, buf = buf, b""
                line = raw.decode("utf-8", "replace").strip()
                if not line:
                    continue
                stats.lines += 1
                emit(port, line)
                kind, m = parse(line)
                if kind:
                    stats.handle(kind, m)
        except (serial.SerialException, OSError) as e:
            stats.disconnects += 1
            emit(port, f"--- port lost ({e}); reconnecting")
        finally:
            try:
                ser.close()
            except Exception:
                pass
        stop.wait(RECONNECT_S)


def print_summary(all_stats):
    cols = ("port", "reboots", "crashes", "offline", "off_s", "wifi_dn", "rdr_reinit", "taps", "post_ok",
            "post_fail", "p50", "p95", "max", "slow", "drops", "rssi", "poll_avg", "poll_max", "result")
    rows = []
    for s in all_stats:
        ok_ms = sorted(s.post_ok_ms)
        fmt = lambda v: "-" if v is None else f"{v:.0f}"
        rows.append((
            s.port, str(s.reboots), str(s.crashes), str(s.offline_events), f"{s.offline_seconds():.0f}",
            str(s.wifi_down), str(s.reader_reinits), str(s.taps), str(len(ok_ms)), str(s.post_fail),
            fmt(percentile(ok_ms, 50)), fmt(percentile(ok_ms, 95)), fmt(percentile(ok_ms, 100)),
            str(s.slow_taps), str(s.disconnects),
            f"{min(s.rssi)}..{max(s.rssi)}" if s.rssi else "-",
            f"{s.poll_ms_sum / s.polls:.0f}" if s.polls else "-", str(s.poll_ms_max) if s.polls else "-",
            "PASS" if s.passed() else "FAIL",
        ))
    widths = [max(len(c), *(len(r[i]) for r in rows)) for i, c in enumerate(cols)] if rows else []
    print("\n=== SUMMARY ===")
    print("  ".join(c.ljust(w) for c, w in zip(cols, widths)))
    for r in rows:
        print("  ".join(v.ljust(w) for v, w in zip(r, widths)))
    print()
    for s in all_stats:
        reasons = []
        if s.lines == 0:
            reasons.append("no data received")
        if s.reboots:
            reasons.append(f"rebooted {s.reboots}x")
        if s.crashes:
            reasons.append(f"{s.crashes} crash line(s)")
        if s.offline_events:
            reasons.append(f"{s.offline_events} offline event(s)")
        if s.post_fail:
            reasons.append(f"{s.post_fail} failed POST(s)")
        verdict = "PASS" if s.passed() else "FAIL"
        detail = "" if verdict == "PASS" else " - " + ", ".join(reasons)
        print(f"{s.port}: {verdict}{detail}")
        print(f"  soak criteria: no reboot={'yes' if not (s.reboots or s.crashes) else 'NO'}, "
              f"no offline={'yes' if s.offline_events == 0 else 'NO'}, "
              f"all POSTs ok={'yes' if s.post_fail == 0 else 'NO'}")
    return all(s.passed() for s in all_stats)


def list_ports():
    found = list(serial.tools.list_ports.comports())
    if not found:
        print("No serial ports found.")
    for p in found:
        print(f"{p.device}\t{p.description}")


def main():
    global log_file
    ap = argparse.ArgumentParser(description="Tap In station serial monitor and soak summary.")
    ap.add_argument("ports", nargs="*", help="serial ports, e.g. COM5 COM6")
    ap.add_argument("--list", action="store_true", help="list serial ports and exit")
    ap.add_argument("--minutes", type=float, default=None,
                    help="stop after this many minutes (default: run until Ctrl+C)")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--log", metavar="FILE", help="also append every line to FILE")
    args = ap.parse_args()

    if args.list:
        list_ports()
        return 0
    if not args.ports:
        ap.error("give at least one port (or --list)")

    if args.log:
        os.makedirs(os.path.dirname(os.path.abspath(args.log)), exist_ok=True)
        log_file = open(args.log, "a", encoding="utf-8")

    stop = threading.Event()
    all_stats = [PortStats(p) for p in args.ports]
    threads = [threading.Thread(target=reader, args=(s.port, s, args.baud, stop), daemon=True)
               for s in all_stats]
    for t in threads:
        t.start()

    deadline = time.monotonic() + args.minutes * 60 if args.minutes else None
    print(f"Monitoring {', '.join(args.ports)} at {args.baud} baud. Ctrl+C to stop.", flush=True)
    try:
        while not stop.is_set():
            if deadline and time.monotonic() >= deadline:
                print("\n--minutes elapsed, stopping.", flush=True)
                break
            time.sleep(0.2)
    except KeyboardInterrupt:
        print("\nStopping (Ctrl+C).", flush=True)
    finally:
        stop.set()
        for t in threads:
            t.join(timeout=2)

    ok = print_summary(all_stats)
    if log_file:
        log_file.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
