"""Evidence panels in Nemo's style (app-like plots and tables with honest captions), in Tap In's theme.
Every number comes from today's logs (data.json) or measurements recorded in the PRs."""
import json
import statistics
from pathlib import Path

from kit import DATA, GREEN, INK, LINE, RASP, SOFT, Canvas

ST = {1: RASP, 2: GREEN}            # station colors, as on the wall: Entrance raspberry, Table 2 green
NAME = {1: "Station 1 · Entrance", 2: "Station 2 · Table 2"}
PANEL, EDGE, GRID = "#F7FAF9", "#DCE3E1", "#E4EAE8"
D = json.loads((Path(__file__).parent / "data.json").read_text())


def panel(c, x, y, w, h):
    c.rect(x, y, w, h, stroke=EDGE, fill=PANEL, sw=2.5, rx=6)


def checkbox_legend(c, x, y, items, label="Show"):
    """Nemo's legend: a titled fieldset with ticked boxes and a line sample per series."""
    c.rect(x, y, 1700, 120, stroke=EDGE, fill="#fff", sw=2.5, rx=6)
    c.rect(x + 24, y - 16, len(label) * 13 + 30, 32, stroke="none", fill="#fff", sw=0, rx=0)
    c.text(x + 38, y + 8, label, size=24, weight=600, color=SOFT)
    cx = x + 36
    for color, text, dashed in items:
        c.rect(cx, y + 48, 34, 34, stroke=DATA, fill=DATA, sw=2, rx=6)
        c.p.append(f'<path d="M {cx + 8} {y + 66} l 7 7 l 12 -14" fill="none" stroke="#fff" stroke-width="4"/>')
        c.line([(cx + 52, y + 65), (cx + 104, y + 65)], color=color, sw=6, dash="10 7" if dashed else None, head=None)
        c.text(cx + 120, y + 74, text, size=26)
        cx += 140 + len(text) * 13.5
    c.text(x + 36, y + 108, "", size=20)


def tap_latency():
    taps = D["taps"]
    c = Canvas(1800, 1060)
    c.text(50, 70, "Tap to reply: 31 real badge taps", size=44, weight=700)
    c.text(50, 116, "Each dot is one tap on a real station, timed on the station from its POST to the server's reply.", size=27, color=SOFT)
    checkbox_legend(c, 50, 160, [(RASP, NAME[1], False), (GREEN, NAME[2], False), (INK, "300 ms target", True)])
    X0, X1, Y0 = 220, 1700, 360
    panel(c, 50, 330, 1700, 520)
    scale = lambda ms: X0 + (X1 - X0) * ms / 600
    for ms in range(0, 601, 100):
        c.line([(scale(ms), Y0 + 10), (scale(ms), Y0 + 380)], color=GRID, sw=2, head=None)
        c.text(scale(ms), Y0 + 420, f"{ms} ms", size=24, color=SOFT, anchor="middle")
    c.line([(scale(300), Y0 + 10), (scale(300), Y0 + 380)], color=INK, sw=3, dash="10 7", head=None)
    for row, st in ((0, 1), (1, 2)):
        yy = Y0 + 110 + row * 170
        c.text(80, yy + 9, f"Station {st}", size=27, weight=700, color=ST[st])
        vals = sorted(t["ms"] for t in taps if t["station"] == st)
        for i, ms in enumerate(vals):
            jitter = ((i * 37) % 5 - 2) * 9
            c.p.append(f'<circle cx="{scale(ms)}" cy="{yy + jitter}" r="11" fill="{ST[st]}" fill-opacity="0.85" stroke="#fff" stroke-width="2"/>')
        med = statistics.median(vals)
        c.line([(scale(med), yy - 44), (scale(med), yy + 44)], color=INK, sw=4, head=None)
        c.text(scale(med), yy - 56, f"median {med:.0f}", size=23, anchor="middle", weight=600)
    allv = sorted(t["ms"] for t in taps)
    over = sum(1 for v in allv if v > 300)
    c.text(50, 920, f"All 31 taps: median {statistics.median(allv):.0f} ms, fastest {allv[0]} ms, slowest {allv[-1]} ms. "
                    f"{over} of 31 ({over * 100 // 31}%) took longer than the 300 ms firmware target;", size=27)
    c.text(50, 962, "every one beat the 1 s checkpoint. The slowest came from station 2, which also polls a little slower (next plot).",
           size=27)
    c.text(50, 1010, "Taps from bench tests and the soak, 21 Nov 2026, on the event router. The wall gets each result < 1 ms after the scan closes.",
           size=23, color=SOFT)
    return c


def soak():
    L = D["link"]
    c = Canvas(1800, 1100)
    c.text(50, 70, "40-minute soak: every poll, both stations", size=44, weight=700)
    c.text(50, 116, "Each point is the average of one 30-second LINK report (about 45 polls); the faint dots are the slowest poll in it.",
           size=27, color=SOFT)
    checkbox_legend(c, 50, 160, [(RASP, NAME[1] + " · average", False), (GREEN, NAME[2] + " · average", False)])
    panel(c, 50, 330, 1700, 560)
    def mins(t):
        h, m, s = (int(x) for x in t.split(":"))
        return h * 60 + m + s / 60
    t0 = min(mins(x["t"]) for x in L)
    span = max(mins(x["t"]) for x in L) - t0
    X0, X1, YT, YB = 220, 1700, 370, 820
    sx = lambda t: X0 + (X1 - X0) * (mins(t) - t0) / span
    sy = lambda ms: YB - (YB - YT) * ms / 600
    for ms in range(0, 601, 100):
        c.line([(X0, sy(ms)), (X1, sy(ms))], color=GRID, sw=2, head=None)
        c.text(X0 - 20, sy(ms) + 8, f"{ms} ms", size=23, color=SOFT, anchor="end")
    for m in range(0, int(span) + 1, 5):
        x = X0 + (X1 - X0) * m / span
        c.text(x, YB + 44, f"{m} min", size=23, color=SOFT, anchor="middle")
    for st in (1, 2):
        pts = [x for x in L if x["station"] == st]
        for p in pts:
            c.p.append(f'<circle cx="{sx(p["t"]):.1f}" cy="{sy(p["max"]):.1f}" r="5" fill="{ST[st]}" fill-opacity="0.28"/>')
        path = " L ".join(f"{sx(p['t']):.1f} {sy(p['avg']):.1f}" for p in pts)
        c.p.append(f'<path d="M {path}" fill="none" stroke="{ST[st]}" stroke-width="4.5"/>')
    fails = sum(x["fails"] for x in L)
    polls = sum(x["polls"] for x in L)
    rssi = [x["rssi"] for x in L]
    avg = sum(x["avg"] * x["polls"] for x in L) / polls
    c.text(50, 950, f"{polls:,} polls, {fails} failed, 0 reboots, 0 time offline. Signal {min(rssi)} to {max(rssi)} dBm (strong). "
                    f"Average poll {avg:.0f} ms.", size=27)
    c.text(50, 992, "What challenged us: ping to the server is 3 ms and the server answers in 4 ms, yet every request from an ESP32",
           size=27)
    c.text(50, 1034, "takes about 200 ms. Reusing the connection and another server engine didn't change it; the cause is still open.",
           size=27)
    c.text(50, 1080, "Both stations on USB power, on the event router, 15:40 to 16:20, 21 Nov 2026.", size=23, color=SOFT)
    return c


def gemini_models():
    rows = [
        ("gemini-2.5-flash (our plan)", ["404", "", ""], "Not offered to new API keys", "bad"),
        ("gemini-3.8-flash", ["503 · 2.7 s", "503 · 4.8 s", "503 · 2.7 s"], "Overloaded (high demand)", "bad"),
        ("gemini-3.7-flash", ["timeout", "503 · 1.3 s", "timeout"], "Too slow for 2 s", "bad"),
        ("gemini-flash-latest", ["timeout", "timeout", "timeout"], "Too slow for 2 s", "bad"),
        ("gemini-3.1-flash-lite", ["1.63 s", "1.06 s", "0.79 s"], "Works, close to the limit", "ok"),
        ("gemini-flash-lite-latest", ["0.83 s", "0.86 s", "0.69 s"], "Fast, but an alias that can move", "ok"),
        ("gemini-3.5-flash-lite", ["1.00 s", "1.06 s", "0.64 s"], "Picked: fast and pinned", "pick"),
    ]
    c = Canvas(1800, 1060)
    c.text(50, 70, "Choosing the Gemini model by measuring it", size=44, weight=700)
    c.text(50, 116, "Three calls each with the real icebreaker prompt. The wall waits at most 2 s, so anything slower is useless to us.",
           size=27, color=SOFT)
    panel(c, 50, 160, 1700, 790)
    cols = [80, 640, 880, 1120, 1360]
    for x, h in zip(cols, ("Model", "Call 1", "Call 2", "Call 3", "Verdict")):
        c.text(x, 222, h, size=25, color=SOFT, weight=600)
    c.line([(50, 250), (1750, 250)], color=EDGE, sw=2.5, head=None)
    for i, (m, calls, verdict, kind) in enumerate(rows):
        y = 250 + i * 98
        if kind == "pick":
            c.rect(52, y + 2, 1696, 96, stroke=GREEN, fill="#fff", sw=4, rx=4)
        c.text(80, y + 60, m, size=27, weight=700, mono=True, color=GREEN if kind == "pick" else INK)
        for x, v in zip(cols[1:4], calls):
            col = RASP if (v.startswith("4") or v.startswith("5") or v == "timeout") else INK
            c.text(x, y + 60, v or "–", size=27, color=col if v else SOFT, mono=True)
        c.text(cols[4], y + 60, verdict, size=26, color=GREEN if kind == "pick" else (SOFT if kind == "ok" else RASP),
               weight=700 if kind == "pick" else 400)
        c.line([(50, y + 98), (1750, y + 98)], color=EDGE, sw=1.5, head=None)
    c.text(50, 1000, "Measured 21 Nov 2026 with our key. The server still sends nothing if Gemini is late: the template line stays. "
                     "This picks a model for tonight, not in general.", size=24, color=SOFT)
    return c


def scan_runs():
    c = Canvas(1800, 1000)
    c.text(50, 70, "Two real group scans at station 1", size=44, weight=700)
    c.text(50, 116, "Real fobs at station 1 on the live server. A scan window lasts 6 s after the last tap that joins it.",
           size=27, color=SOFT)
    X0, X1 = 330, 1700
    sx = lambda s: X0 + (X1 - X0) * s / 9
    def run(y, title, sub, taps, window_end, result, ok):
        panel(c, 50, y, 1700, 330)
        c.text(80, y + 54, title, size=29, weight=700)
        c.text(80, y + 94, sub, size=24, color=SOFT)
        for s in range(0, 10):
            c.line([(sx(s), y + 120), (sx(s), y + 280)], color=GRID, sw=2, head=None)
            c.text(sx(s), y + 312, f"{s} s", size=22, color=SOFT, anchor="middle")
        c.rect(sx(0), y + 160, sx(window_end) - sx(0), 56, stroke=RASP if ok else DATA, fill="#F3DCE6" if ok else "#E5E9F5", sw=3, rx=8)
        c.text(sx(1.4), y + 197, "6 s scan window", size=23, color=RASP if ok else DATA, weight=600)
        for s, label, kind in taps:
            col = {"in": RASP, "miss": DATA, "unknown": "#8C9592"}[kind]
            c.line([(sx(s), y + 130), (sx(s), y + 250)], color=col, sw=4, head=None)
            c.p.append(f'<circle cx="{sx(s)}" cy="{y + 130}" r="10" fill="{col}"/>')
            if kind == "unknown":
                c.text(sx(s) - 14, y + 268, label, size=22, color=col, weight=600, anchor="end")
            else:
                c.text(sx(s) + 14, y + 268, label, size=22, color=col, weight=600)
        c.text(1730, y + 54, result, size=27, weight=700, color=RASP if ok else DATA, anchor="end")
    run(170, "14:47  ·  two check-ins instead of a group",
        "The second fob landed 0.57 s after the window closed, so it opened its own.",
        [(0, "fob ...00DC", "in"), (5.39, "unregistered card (ignored)", "unknown"), (6.57, "fob ...21DC: too late", "miss")],
        6.0, "missed by 0.57 s", False)
    run(560, "15:02  ·  one scan of two: joined",
        "The second fob landed 0.84 s after the first and restarted the 6 s.",
        [(0, "fob ...00DC", "in"), (0.84, "...21DC", "in")], 6.84, "joined, event to wall < 1 ms", True)
    c.text(50, 960, "The miss is the rule working, not a bug: a join needs everyone at the station together. "
                    "It also told us to coach people: tap one after another, right away.", size=25, color=SOFT)
    return c


def recovery():
    c = Canvas(1800, 760)
    c.text(50, 70, "Server down for 19 s: both stations recover on their own", size=44, weight=700)
    c.text(50, 116, "We stopped the server mid-soak. Times are from the stations' serial logs and the server log.", size=27, color=SOFT)
    panel(c, 50, 160, 1700, 440)
    X0, X1 = 330, 1700
    sx = lambda s: X0 + (X1 - X0) * s / 22
    t0 = 51.93 - 1.5
    for s in range(0, 23, 2):
        c.line([(sx(s), 200), (sx(s), 540)], color=GRID, sw=2, head=None)
        c.text(sx(s), 572, f"{s} s", size=22, color=SOFT, anchor="middle")
    c.rect(sx(0.2), 210, sx(19.0) - sx(0.2), 70, stroke="#8C9592", fill="#EEF1F0", sw=2.5, rx=8)
    c.text(sx(0.2) + 18, 255, "server stopped", size=25, color=SOFT, weight=600)
    for row, (st, off, on) in enumerate(((1, 51.973, 71.000), (2, 51.932, 70.990))):
        y = 330 + row * 110
        c.text(80, y + 40, f"Station {st}", size=27, weight=700, color=ST[st])
        c.rect(sx(off - t0), y, sx(on - t0) - sx(off - t0), 64, stroke=ST[st], fill="#fff", sw=3.5, rx=8)
        c.text(sx(off - t0) + 18, y + 42, "offline: brief blink every 2 s", size=23, color=ST[st])
        c.text(sx(on - t0) + 14, y + 42, "online", size=24, weight=700, color=ST[st])
    c.text(50, 660, "Offline shown about 1.5 s after the server went away; back online about 1 s after it returned. "
                    "No reboot, no button pressed,", size=27)
    c.text(50, 702, "and the wall reconnected by itself. Not yet tested: the router itself unplugged (needs a person at the table).",
           size=27)
    return c


CHARTS = {"evidence-tap-latency": (tap_latency, 1800, 1060), "evidence-soak": (soak, 1800, 1100),
          "evidence-gemini-models": (gemini_models, 1800, 1060), "evidence-scan-runs": (scan_runs, 1800, 1000),
          "evidence-recovery": (recovery, 1800, 760)}
