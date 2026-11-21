"""The rest of the Tap In Devpost diagrams (same kit as diagrams.py)."""
from draw import BLUE, INK, ORANGE, SOFT, TEAL, Diagram


def tap_to_wall():
    d = Diagram(2000, 1520)
    X, W = 60, 1180
    steps = [
        ("A badge touches the lid", ["the station reads its UID and shows collecting at once, before the server answers"], "teal", "t = 0"),
        ("POST /api/tap", ["the server replies {state: collecting, count} right away"], "blue", "median 260 ms (155-345)"),
        ("Scan window: 6 s, per station", ["every new tap at the same station joins the scan and restarts the 6 s",
                                           "so a whole group can tap one after another"], "orange", "up to 6 s after the last tap"),
        ("Resolve the scan in one transaction", ["1 badge = check-in · 2+ = new group or join · a mentor = help",
                                                 "everyone already met = repeat (links get stronger)"], "teal", ""),
        ("Write to Tiger Data", ["scan_events hypertable, people, groups, connections, needs"], "blue", ""),
        ("Broadcast on one WebSocket", ["checked_in · group_formed · group_joined · points_updated · needs_updated"], "teal", "< 1 ms to every wall"),
        ("The wall and the station react", ["the person glows, lines reach people they know, fitting tables pulse,",
                                            "a bell or a run of plucks; the station shows the result for 2 s"], "teal", ""),
    ]
    y = 40
    for i, (t, lines, kind, timing) in enumerate(steps):
        h = 150 if len(lines) == 1 else 185
        d.box(X, y, W, h, t, lines, kind=kind, align="start", tsize=27, lsize=21)
        if timing:
            d.text(X + W + 40, y + h / 2 + 8, timing, size=22, color=ORANGE if "6 s" in timing else INK, anchor="start", weight=700)
        if i < len(steps) - 1:
            d.arrow([(X + W / 2, y + h), (X + W / 2, y + h + 45)], color=INK)
        y += h + 45
    d.box(1580, 1150, 380, 250, "Gemini", ["after checked_in,", "in the background,", "swaps in ~0.9 s later"], kind="blue")
    d.arrow([(1240, 1215), (1580, 1215)], color=BLUE, dashed=True)
    d.arrow([(1770, 1400), (1770, 1440), (1240, 1440)], "icebreaker event", lx=1460, ly=1425, color=BLUE, dashed=True)
    return d


def tiger_data():
    d = Diagram(2400, 1180)
    d.box(40, 120, 330, 200, "Every tap", ["POST /api/tap", "result: collecting,", "unknown, claimed"], kind="teal")
    d.box(40, 420, 330, 200, "Every scan", ["kind, size, station,", "group, at resolve"], kind="teal")
    d.group(440, 40, 1120, 760, "Tiger Data  ·  time-series in Postgres")
    d.box(480, 110, 460, 220, "taps", ["hypertable on ts", "raw, append-only", "station, uid, result"], kind="blue")
    d.box(480, 410, 460, 220, "scan_events", ["hypertable on ts", "checkin · join · new_group", "repeat · help"], kind="blue")
    d.box(1040, 410, 480, 220, "scans_per_10min", ["continuous aggregate", "real-time (materialized_only = false)", "refresh every 1 min"], kind="orange")
    d.box(1040, 110, 480, 220, "scans_per_hour", ["continuous aggregate", "built on scans_per_10min", "hierarchical, refresh 5 min"], kind="orange")
    d.box(480, 680, 1040, 100, "people · groups · group_members · needs · connections (regular tables)", [], kind="grey", tsize=22)
    d.arrow([(370, 220), (480, 220)], color=BLUE)
    d.arrow([(370, 520), (480, 520)], color=BLUE)
    d.arrow([(940, 520), (1040, 520)], color=ORANGE)
    d.arrow([(1280, 410), (1280, 330)], color=ORANGE)
    d.box(1640, 410, 720, 220, "/api/stats  +  stats_updated", ["here now, groups, links today, busiest station",
                                                                 "12 ten-minute buckets for the wall chart",
                                                                 "pushed to every wall every 30 s"], kind="teal")
    d.box(1640, 110, 720, 220, "/api/analytics", ["busiest station by hour, last 24 h",
                                                  "today's mix: check-ins, joins, helps",
                                                  "needs open and met, for the space's staff"], kind="teal")
    d.arrow([(1520, 520), (1640, 520)])
    d.arrow([(1520, 220), (1640, 220)])
    d.box(40, 870, 1110, 270, "Why connections is NOT a hypertable", [
        "a unique index on a hypertable must include the time column,",
        "and we need exactly one row per pair of people (person_a < person_b),",
        "so a repeat scan makes the link stronger instead of adding rows"], kind="grey", align="start", tsize=25, lsize=21)
    d.box(1250, 870, 1110, 270, "Built to survive the event", [
        "schema.sql runs on every start and is idempotent (IF NOT EXISTS)",
        "the newest minutes show before they are materialized",
        "the same schema runs on a local TimescaleDB if the venue Wi-Fi dies"], kind="grey", align="start", tsize=25, lsize=21)
    return d


def gemini():
    d = Diagram(2200, 1300)
    d.box(40, 60, 620, 200, "Someone checks in", ["checked_in carries their top", "suggested table and the reason"], kind="teal")
    d.box(40, 360, 620, 230, "Template line, right away", ['"Maya (firmware): Table 2', 'needs design"', "the wall never waits for AI"], kind="teal")
    d.arrow([(350, 260), (350, 360)])
    d.box(800, 60, 640, 200, "Cached for this pair?", ["one answer per (person, table)", "a repeat check-in costs nothing"], kind="teal")
    d.arrow([(660, 160), (800, 160)], "background task", lx=730, ly=140)
    d.box(800, 360, 640, 300, "Gemini API", ["gemini-3.5-flash-lite", "name + skills, the table's work + needs",
                                              '"one icebreaker under 20 words,', 'no emojis, no exclamation marks"'], kind="blue")
    d.arrow([(1120, 260), (1120, 360)], "no", lx=1140, ly=320, lanchor="start")
    d.box(1580, 360, 580, 300, "Answer within 2 s?", ["timeout = 2.0 s", "measured 0.6-1.1 s", "clean: first line, no emoji, no !"], kind="orange")
    d.arrow([(1440, 510), (1580, 510)], color=BLUE)
    d.box(1580, 780, 580, 230, "icebreaker event", ["{person_id, group_id, text}", "the wall swaps the line"], kind="teal")
    d.arrow([(1870, 660), (1870, 780)], "yes", lx=1890, ly=730, lanchor="start")
    d.box(800, 780, 640, 230, "Nothing is sent", ["late, error, no key, bad model:", "the template line just stays"], kind="grey")
    d.arrow([(1580, 620), (1500, 620), (1500, 895), (1440, 895)], "no", lx=1515, ly=760, lanchor="start", color=ORANGE)
    d.arrow([(1440, 120), (2185, 120), (2185, 895), (2160, 895)], "yes: send the cached line", lx=1740, ly=105)
    d.box(40, 780, 620, 230, "Key stays on the server", ["in .env, sent only to Google", "as a header, never to a browser"], kind="grey")
    d.text(1100, 1110, "A real one from tonight, 0.9 s after a check-in:", size=24, color=SOFT)
    d.text(1100, 1165, "“Avery, your firmware and pitch skills fit Connection Map's design needs well.”", size=30, color=INK, weight=700)
    d.text(1100, 1230, "We planned gemini-2.5-flash; it returns 404 for new API keys, so we timed the models against the 2 s budget.", size=20, color=SOFT)
    return d


def journey():
    d = Diagram(2600, 900)
    steps = [
        ("1  Sign up", ["phone, about 30 s", "first name, 3 skills,", "2 looking-for tags"], "teal"),
        ("2  Claim a badge", ["tap any blank badge", "within 30 s; it also", "counts as a check-in"], "teal"),
        ("3  Where you stand", ["who you know here,", "tables that fit you,", "and why, in words"], "blue"),
        ("4  Walk over", ['"Table 2 needs firmware.', "You know 1 of its", '3 people"'], "teal"),
        ("5  Scan in together", ["everyone taps the", "same station within", "6 s of each other"], "orange"),
        ("6  You're in", ["+10 for you, +5 each", "member, links for every", "pair, the wall plays it"], "teal"),
    ]
    x, w, gap = 30, 380, 50
    for i, (t, lines, kind) in enumerate(steps):
        d.box(x, 120, w, 330, t, lines, kind=kind, tsize=27, lsize=21)
        if i < len(steps) - 1:
            d.arrow([(x + w, 285), (x + w + gap, 285)], color=INK)
        x += w + gap
    d.text(30, 70, "From first touch to a seat at a table", size=30, color=INK, anchor="start", weight=700)
    d.box(30, 540, 800, 300, "Mentors and staff", ["see the needs board on their phone;", "scanning in with a table counts as help:",
                                                     "the need is marked handled"], kind="grey")
    d.box(900, 540, 800, 300, "Opt out, built in", ["a table can go heads-down: on the map,", "never suggested; a person can check in",
                                                     "on focus mode the same way"], kind="grey")
    d.box(1770, 540, 800, 300, "Privacy", ["first names only, no student IDs,", "the badge UID never reaches a screen,",
                                           "an optional contact is stored, never shown"], kind="grey")
    return d


def station():
    d = Diagram(2200, 1100)
    d.text(40, 70, "One station  ·  ESP32 + RC522, no soldering", size=30, color=INK, anchor="start", weight=700)
    left = ["SDA (NSS)", "SCK", "MOSI", "MISO", "RST", "3.3V (never 5 V)", "GND"]
    right = ["GPIO 5", "GPIO 18", "GPIO 23", "GPIO 19", "GPIO 22", "3V3", "GND"]
    d.box(40, 130, 520, 170, "RC522 reader", ["13.56 MHz, max antenna gain", "taped under a 3 mm lid"], kind="blue")
    d.box(820, 130, 520, 170, "ESP32-WROOM", ["Wi-Fi to the server", "blue LED on GPIO 2"], kind="teal")
    for i, (a, b) in enumerate(zip(left, right)):
        yy = 340 + i * 52
        d.parts.append(f'<rect x="40" y="{yy}" width="520" height="42" rx="10" fill="#f1f5f5" stroke="{BLUE}" stroke-width="2.5"/>')
        d.parts.append(f'<rect x="820" y="{yy}" width="520" height="42" rx="10" fill="#f1f5f5" stroke="{TEAL}" stroke-width="2.5"/>')
        d.text(70, yy + 29, a, size=22, color=INK, anchor="start", weight=600)
        d.text(1310, yy + 29, b, size=22, color=INK, anchor="end", weight=600)
        d.arrow([(560, yy + 21), (820, yy + 21)], color=ORANGE if "3.3V" in a else TEAL, head=False, width=3)
    d.box(40, 760, 1300, 300, "Firmware rules that keep it from freezing", [
        "never delay() in loop(): every animation is computed from millis()",
        "800 ms timeout on every request; Wi-Fi rejoins by itself, offline shows in 1.5 s",
        "the same badge within 3 s counts once, even held on the lid",
        "30- and 40-minute soaks: 0 reboots, 0 time offline"], kind="grey", align="start", tsize=25, lsize=21)
    rows = [("idle", "0.15 s blip every 3 s"), ("collecting", "solid on"), ("checked in", "3 Hz blink"),
            ("joined", "10 Hz flicker"), ("repeat", "one 0.4 s blink"), ("claim waiting", "slow 1 Hz blink"),
            ("claimed", "solid on"), ("unknown badge", "double blink"), ("offline", "brief blink every 2 s")]
    d.group(1420, 130, 740, 930, "The blue LED, one rhythm per state")
    for i, (state, rhythm) in enumerate(rows):
        yy = 210 + i * 92
        k = ORANGE if state == "joined" else TEAL
        d.parts.append(f'<rect x="1450" y="{yy}" width="680" height="76" rx="14" fill="{"#fff" if state == "joined" else "#f1f5f5"}" stroke="{k}" stroke-width="3"/>')
        d.text(1480, yy + 48, state, size=24, color=ORANGE if state == "joined" else INK, anchor="start", weight=700)
        d.text(2100, yy + 48, rhythm, size=22, color=SOFT, anchor="end")
    return d


def cover():
    d = Diagram(1500, 1000)
    d.parts.append('<rect width="1500" height="1000" fill="#f1f5f5"/>')
    d.text(750, 300, "Tap In", size=150, color=INK, weight=800)
    d.text(750, 390, "Walk into a room, tap in, find your people.", size=44, color=TEAL, weight=600)
    for x, t, c in ((330, "Tap in", TEAL), (750, "Scan in together", ORANGE), (1170, "Find your people", TEAL)):
        d.parts.append(f'<circle cx="{x}" cy="600" r="95" fill="#fff" stroke="{c}" stroke-width="8"/>')
        d.text(x, 760, t, size=34, color=INK, weight=700)
    d.parts.append(f'<circle cx="330" cy="600" r="36" fill="none" stroke="{TEAL}" stroke-width="7"/><circle cx="330" cy="600" r="12" fill="{TEAL}"/>')
    for k in (-1, 0, 1):
        d.parts.append(f'<circle cx="{750 + k * 42}" cy="600" r="22" fill="{ORANGE}" opacity="0.9"/>')
    for dx, dy in ((-45, -25), (40, -35), (0, 45), (-38, 30), (42, 22)):
        d.parts.append(f'<line x1="1170" y1="600" x2="{1170 + dx}" y2="{600 + dy}" stroke="{TEAL}" stroke-width="5"/>'
                       f'<circle cx="{1170 + dx}" cy="{600 + dy}" r="12" fill="{TEAL}"/>')
    d.parts.append(f'<circle cx="1170" cy="600" r="16" fill="{ORANGE}"/>')
    d.arrow([(440, 600), (640, 600)], color=INK, width=5)
    d.arrow([(860, 600), (1060, 600)], color=INK, width=5)
    d.text(750, 910, "BostonHacks 2026  ·  ESP32 stations  ·  Tiger Data  ·  Gemini", size=30, color=SOFT)
    return d


DIAGRAMS = {"tap-to-wall": (tap_to_wall, 2000, 1520), "tiger-data": (tiger_data, 2400, 1180), "gemini": (gemini, 2200, 1300),
            "user-journey": (journey, 2600, 900), "station": (station, 2200, 1100), "cover": (cover, 1500, 1000)}
