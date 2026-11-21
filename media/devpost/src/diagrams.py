"""Draw every Tap In Devpost diagram as SVG, then render each to PNG at 2x with headless Chrome."""
import subprocess
import sys
from pathlib import Path

from draw import BLUE, INK, ORANGE, SOFT, TEAL, Diagram

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
CHROME = r"C:Program FilesGoogleChromeApplicationrome.exe"  # any Chrome; renders each SVG to PNG
D = {}


def architecture():
    d = Diagram(2400, 1300)
    # Stations
    d.group(30, 30, 330, 760, "Stations x2")
    d.box(60, 90, 270, 190, "Entrance", ["station 1", "ESP32 + RC522", "blue status LED"])
    d.box(60, 320, 270, 190, "Table 2", ["station 2", "ESP32 + RC522", "blue status LED"])
    d.box(60, 560, 270, 200, "Badges", ["13.56 MHz cards", "and fobs", "UID only, no name"], kind="blue")
    d.arrow([(195, 560), (195, 512)], color=BLUE)
    d.text(210, 545, "tap", size=19, color=BLUE, anchor="start")
    # Server
    d.group(440, 30, 900, 1240, "FastAPI server  ·  one laptop on the event Wi-Fi")
    d.box(480, 90, 820, 230, "Scan windows", ["taps at one station within 6 s = one scan", "each tap extends the window by 6 s",
                                              "same badge within 3 s ignored"], kind="orange")
    d.box(480, 370, 820, 190, "Group rules + points", ["check-in · new group · join · help · repeat",
                                                       "+1 check-in  ·  +5 per new person  ·  +10 join"])
    d.box(480, 610, 395, 190, "Matching", ["skills vs looking for", "newcomer bonus", "reason in words"], tsize=25, lsize=20)
    d.box(905, 610, 395, 190, "Stats", ["/api/stats", "/api/analytics", "stats_updated 30 s"], tsize=25, lsize=20)
    d.box(480, 850, 820, 150, "Event hub", ["one WebSocket, every change as {type, ts, data}"])
    d.box(480, 1050, 820, 180, "Gemini icebreaker", ["gemini-3.5-flash-lite  ·  2 s budget", "runs in the background, template line if late"], kind="blue")
    d.arrow([(360, 185), (400, 185), (400, 205), (480, 205)], "POST /api/tap", lx=405, ly=165, lanchor="start")
    d.arrow([(360, 415), (420, 415), (420, 240), (480, 240)], "poll 500 ms", lx=365, ly=455, lanchor="start")
    d.arrow([(890, 320), (890, 370)])
    d.arrow([(890, 560), (890, 610)])
    d.arrow([(890, 800), (890, 850)])
    # Tiger Data
    d.group(1420, 30, 950, 640, "Tiger Data  ·  Postgres + TimescaleDB")
    d.box(1450, 90, 430, 220, "Hypertables", ["taps (every raw tap)", "scan_events (every scan)", "time-partitioned on ts"], kind="blue")
    d.box(1910, 90, 430, 220, "Regular tables", ["people · groups", "group_members · needs", "connections (one per pair)"], kind="blue")
    d.box(1450, 350, 430, 290, "Continuous aggregates", ["scans_per_10min", "real-time, refresh 1 min", "scans_per_hour", "built on the 10-min one"], kind="blue")
    d.box(1910, 350, 430, 290, "Why it matters", ["the chart never scans", "raw rows", "busiest station by", "hour for the space"], kind="teal")
    d.arrow([(1665, 310), (1665, 350)], color=BLUE)
    d.arrow([(1300, 465), (1420, 465), (1420, 200), (1450, 200)], "write scan", lx=1310, ly=445, lanchor="start", color=BLUE)
    d.arrow([(1450, 560), (1350, 560), (1350, 705), (1300, 705)], "read", lx=1360, ly=650, lanchor="start", color=BLUE)
    # Screens
    d.box(1420, 760, 440, 250, "Wall display", ["3D room map", "stats · leaderboard · needs", "bell + pluck sounds"])
    d.box(1930, 760, 440, 250, "Phone", ["sign up in 30 s", "claim a badge", "where you stand"])
    d.arrow([(1300, 925), (1420, 925)], "/ws events", lx=1360, ly=905)
    d.arrow([(1300, 975), (1370, 975), (1370, 1060), (2150, 1060), (2150, 1010)], "")
    d.text(1760, 1095, "sign-up, claim, /api/me", size=20, color=INK)
    d.arrow([(890, 1050), (890, 1000)], color=BLUE)
    d.text(905, 1032, "icebreaker event", size=19, color=BLUE, anchor="start")
    d.legend(30, 830, [("orange", "the hard part: proof of meeting"), ("teal", "server logic or screen"), ("blue", "data or external service")], w=380)
    return d


D["architecture"] = (architecture, 2400, 1300)
from more import DIAGRAMS  # noqa: E402
D.update(DIAGRAMS)

if __name__ == "__main__":
    names = sys.argv[1:] or list(D)
    for name in names:
        fn, w, h = D[name]
        svg = fn().svg()
        html = OUT / f"{name}.html"
        html.write_text(f'<!doctype html><meta charset="utf-8"><style>html,body{{margin:0;background:#fff}}</style>{svg}', encoding="utf-8")
        png = OUT / f"{name}.png"
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                        f"--window-size={w},{h}", f"--screenshot={png}", html.as_uri()], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("rendered", png.name)
