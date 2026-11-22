"""Tap In Devpost diagrams, one per Lucid format, in Tap In's theme."""
from kit import DATA, FILL, GREEN, GREY, INK, LINE, RASP, SOFT, Canvas


def architecture():  # Lucid: architecture.png, 2400 x 1260
    c = Canvas(2400, 1260)
    c.group(30, 30, 330, 700, "Station side")
    c.box(60, 90, 270, 170, "Badge", ["13.56 MHz", "UID only"], kind="data", tsize=34)
    c.box(60, 310, 270, 170, "RC522", ["reads through", "a 3 mm lid"])
    c.box(60, 530, 270, 170, "ESP32", ["Wi-Fi, blue LED", "800 ms timeouts"])
    c.line([(195, 260), (195, 310)], color=GREEN)
    c.line([(195, 480), (195, 530)], color=GREEN)
    c.line([(330, 615), (400, 615), (400, 200), (470, 200)], color=GREEN)
    c.text(60, 780, "POST each tap,", size=25, color=SOFT)
    c.text(60, 814, "poll every 500 ms", size=25, color=SOFT)

    c.group(440, 30, 760, 1150, "FastAPI server")
    c.box(470, 90, 700, 230, "Scan window", ["per station, 6 s, restarts on every tap", "same badge within 3 s counts once"],
          kind="rasp", mono_lines=["POST /api/tap · GET /api/station/{id}"])
    c.line([(820, 320), (820, 380)], color=GREEN)
    c.text(838, 360, "window closes", size=24, color=INK)
    c.rect(470, 380, 700, 250, stroke=GREEN, fill=FILL, sw=4)
    c.text(820, 428, "Resolve · one transaction", size=30, weight=700, anchor="middle")
    for i, (t, k) in enumerate((("check-in", "green"), ("new group", "rasp"), ("join", "rasp"), ("help", "green"), ("repeat", "green"))):
        col, row = i % 3, i // 3
        c.chip(500 + col * 220, 460 + row * 80, 200, 62, t, kind=k)
    c.line([(820, 630), (820, 690)], color=GREEN)
    c.text(838, 670, "points + suggestions", size=24)
    c.box(470, 690, 700, 200, "Matching + points", ["+3 per looking-for tag a skill fills", "+1 check-in · +5 new link · +10 join"],
          mono_lines=["suggested_groups · reason"])
    c.box(470, 950, 700, 200, "Tiger Data", ["taps · scan_events (hypertables)", "scans_per_10min → scans_per_hour"], kind="data",
          mono_lines=["Postgres + TimescaleDB"])
    c.line([(820, 890), (820, 950)], color=DATA)

    c.rect(1270, 30, 330, 730, stroke=GREEN, fill="#fff", sw=4, rx=26)
    c.text(1435, 88, "Wall display", size=34, weight=700, anchor="middle")
    for i, t in enumerate(("browser, fullscreen", "3D room map", "stats + chart", "top tables", "needs board")):
        c.text(1435, 138 + i * 40, t, size=26, anchor="middle")
    c.text(1435, 372, "The room plays it", size=27, weight=700, color=RASP, anchor="middle")
    for i, (a, b) in enumerate((("checked_in", "glow + bell"), ("group_joined", "run of plucks"), ("icebreaker", "line swaps in"))):
        c.rect(1300, 400 + i * 116, 270, 96, stroke=RASP if i == 1 else GREEN, fill="#fff", sw=3.5, rx=16)
        c.text(1435, 440 + i * 116, a, size=24, weight=600, anchor="middle", mono=True, color=RASP if i == 1 else INK)
        c.text(1435, 474 + i * 116, b, size=24, anchor="middle")
    c.line([(1170, 505), (1270, 505)], color=GREEN)
    c.text(1220, 488, "/ws", size=24, anchor="middle", mono=True)

    c.legend(1660, 120, [("rasp", "Proof of meeting"), ("green", "Station or server logic"), ("data", "Data or external service")], w=700,
             note=["Everyone taps the same station within", "6 s of each other, or it doesn't count."])

    c.box(1660, 560, 330, 230, "Gemini", ["3.5-flash-lite", "2 s budget", "key stays on server"], kind="data")
    c.box(2030, 560, 340, 230, "Phone", ["sign-up, claim", "where you stand", "no app, no login"], kind="data")
    c.line([(1170, 790), (1630, 790), (1630, 840), (1825, 840), (1825, 790)], color=DATA)
    c.text(1400, 828, "after checked_in", size=24, color=DATA, anchor="middle")
    c.line([(1660, 640), (1600, 640)], color=DATA)
    c.text(1640, 618, "text", size=22, color=DATA, anchor="end")
    c.line([(2200, 790), (2200, 1215), (820, 1215), (820, 1180)], color=GREEN, head="end")
    c.text(1510, 1200, "sign-up, claim and /api/me go to the same server", size=25, anchor="middle")
    return c


def pipeline():  # Lucid: agent-graph.png, 2400 x 2260
    c = Canvas(2400, 2260)
    X, W = 100, 940
    def step(y, h, title, sub, kind="green", mono=()):
        c.box(X, y, W, h, title, sub, kind=kind, align="start", tsize=32, lsize=25, mono_lines=mono)
    step(30, 140, "Scan window closes (scans.py)", ["popped first, so a tap mid-resolve opens a fresh window"])
    c.line([(570, 170), (570, 210)], color=LINE)
    step(210, 140, "Who tapped (groups.resolve)", ["role, current group, here now (3 h), already linked?"], kind="data")
    c.line([(570, 350), (570, 390)], color=LINE)
    c.rect(80, 390, 980, 230, stroke=GREY, fill="#fff", sw=3.5, rx=24)
    c.text(110, 440, "Decide what the scan means · one transaction", size=27, weight=700)
    for i, (t, s_, k) in enumerate((("check-in", "1 badge", "green"), ("new group", "2+, none in one", "rasp"),
                                    ("join", "2+, one in a group", "rasp"), ("help", "a mentor or staff", "green"))):
        x = 100 + i * 238
        c.rect(x, 470, 222, 130, stroke={"green": GREEN, "rasp": RASP}[k], fill="#fff" if k == "rasp" else FILL, sw=3.5, rx=18)
        c.text(x + 111, 522, t, size=28, weight=700, anchor="middle", color=RASP if k == "rasp" else INK)
        c.text(x + 111, 566, s_, size=22, anchor="middle")
    c.line([(570, 620), (570, 640), (310, 640), (310, 660)], color=LINE)
    c.line([(570, 640), (830, 640), (830, 660)], color=LINE)
    c.box(X, 660, 450, 220, "points.py", ["+1 first check-in", "+5 each new link · +10 join", "welcome bonus x2"], align="start", tsize=30, lsize=24)
    c.box(590, 660, 450, 220, "matching.py", ["check-ins only: top 3", "tables, top 5 people,", "a reason in words"], align="start", tsize=30, lsize=24)
    c.line([(310, 880), (310, 900), (570, 900), (570, 920)], color=LINE)
    c.line([(830, 880), (830, 900), (570, 900)], color=LINE, head=None)
    step(920, 150, "Write the scan, last", ["scan_events hypertable, then commit: people, groups, links, needs"], kind="data",
         mono=("INSERT INTO scan_events (station_id, kind, size, group_id)",))
    c.line([(570, 1070), (570, 1110)], color=LINE)
    c.box(X, 1110, W, 170, "Proof of meeting: group_formed / group_joined", ["only when everyone tapped this station within 6 s;",
                                                                             "every pair gets a link, or a stronger one"], kind="rasp", align="start", tsize=30)
    c.line([(570, 1280), (570, 1320)], color=RASP)
    step(1320, 150, "Broadcast on one WebSocket, < 1 ms", ["checked_in · group_joined · points_updated · needs_updated"])
    c.line([(570, 1470), (570, 1510)], color=LINE)
    step(1510, 150, "The station shows the result for 2 s", ["collecting is never followed by an idle blink (#59)"])
    c.line([(570, 1660), (570, 1700)], color=LINE)
    step(1700, 190, "Gemini icebreaker, in the background", ["only after a check-in, only if it answers within 2 s;",
                                                         "otherwise the template line stays"], kind="data")
    c.line([(570, 1890), (570, 1930)], color=LINE)
    c.box(X, 1930, W, 150, "stats_updated every 30 s", ["/api/stats reads scans_per_10min, not raw rows"], align="start", tsize=30)

    # right panels
    c.rect(1160, 210, 1180, 640, stroke=GREY, fill=FILL, sw=3.5, rx=24)
    c.text(1200, 270, "Tiger Data (Postgres + TimescaleDB)", size=32, weight=700)
    rows = [("taps, scan_events", "hypertables on ts, append-only"), ("scans_per_10min", "continuous aggregate, real-time, refresh 1 min"),
            ("scans_per_hour", "hierarchical: built on scans_per_10min"), ("connections", "regular table: one row per pair, unique"),
            ("schema.sql", "idempotent, runs on every server start")]
    for i, (a, b) in enumerate(rows):
        c.text(1200, 340 + i * 104, a, size=29, weight=600, color=GREEN, mono=True)
        c.text(1200, 380 + i * 104, b, size=26)
    c.line([(1040, 995), (1100, 995), (1100, 530), (1160, 530)], color="#8C9592", dash="12 9")
    c.line([(1160, 330), (1100, 330), (1100, 280), (1040, 280)], color="#8C9592", dash="12 9")

    c.rect(1160, 1150, 1180, 560, stroke=GREY, fill=FILL, sw=3.5, rx=24)
    c.text(1200, 1210, "Rules in code, not in a prompt", size=32, weight=700)
    rules = [("scans.py", "6 s window, 3 s dedupe, 2 s result"), ("groups.py", "kind, links, needs, in one transaction"),
             ("points.py", "every value in one place"), ("matching.py", "a score with a reason in words"),
             ("gemini.py", "2 s timeout, cache per (person, table)")]
    for i, (a, b) in enumerate(rules):
        c.text(1200, 1280 + i * 84, a, size=29, weight=600, color=GREEN, mono=True)
        c.text(1440, 1280 + i * 84, b, size=26)
    c.line([(1160, 1430), (1100, 1430), (1100, 1195), (1040, 1195)], color="#8C9592", dash="12 9")
    c.legend(1160, 1800, [("green", "server step"), ("data", "data or external service"), ("rasp", "proof of meeting"),
                          ("dash", "read or write of Tiger Data")], w=1180, title="")
    return c


def journey():  # Lucid: user-journey.png, 2400 x 1120
    c = Canvas(2400, 1120)
    c.text(50, 82, "Tap In user journey", size=54, weight=700)
    c.text(50, 134, "From first touch to a seat at a table. Opt-in, first names only.", size=30)
    cards = [
        ("data", "On your phone", "1 Sign up", ["First name, up to three", "skills, two looking-for", "tags. About 30 seconds."]),
        ("green", "At a station", "2 Claim a badge", ["Tap any blank badge", "within 30 s. It becomes", "yours and checks you in."]),
        ("data", "Phone and wall", "3 Where you stand", ["Who you know here, and", "the tables that fit you,", "with the reason in words."]),
        ("rasp", "Proof of meeting", "4 Scan in together", ["Walk over. You and the", "table tap one station", "within 6 s of each other."]),
        ("green", "The room", "5 You're in", ["Linked to everyone there.", "+10 for you, +5 each", "member, a run of plucks."]),
        ("data", "Mentors and staff", "6 Needs met", ["A mentor scanning in", "counts as help: the", "table's need is handled."]),
        ("data", "The space", "7 Spark sees it", ["Busiest station by hour", "and needs met, from", "Tiger Data aggregates."]),
    ]
    pos = [(50, 190), (650, 190), (1250, 190), (1850, 190), (50, 710), (650, 710), (1250, 710)]
    colors = {"data": DATA, "green": GREEN, "rasp": RASP}
    for (kind, lab, title, body), (x, y) in zip(cards, pos):
        h = 360 if y == 190 else 360
        col = colors[kind]
        c.rect(x, y, 500, h if y == 190 else 360, stroke=col, fill="#fff" if kind == "rasp" else FILL, sw=4.5 if kind == "rasp" else 4, rx=24)
        c.text(x + 32, y + 52, lab.upper(), size=25, weight=700, color=col, spacing=2)
        c.text(x + 32, y + 108, title, size=40, weight=700, color=INK)
        for i, t in enumerate(body):
            c.text(x + 32, y + 172 + i * 50, t, size=30)
    for x in (550, 1150, 1750):
        c.line([(x + 8, 370), (x + 92, 370)], color=LINE, sw=5)
    c.line([(2100, 550), (2100, 620), (300, 620), (300, 702)], color=LINE, sw=5)
    for x in (550, 1150):
        c.line([(x + 8, 890), (x + 92, 890)], color=LINE, sw=5)
    c.rect(1850, 710, 500, 360, stroke=GREY, fill=FILL, sw=3.5, rx=24)
    for i, (k, t) in enumerate((("green", "In the room"), ("data", "Phones, staff, data"), ("rasp", "Proof of meeting"))):
        c.rect(1882, 742 + i * 58, 52, 38, stroke=colors[k], fill="#fff" if k == "rasp" else FILL, sw=3.5, rx=9)
        c.text(1956, 772 + i * 58, t, size=28)
    for i, t in enumerate(("Opt out any time: a table can", "go heads-down, a person can", "check in on focus mode.")):
        c.text(1882, 960 + i * 38, t, size=25, color=SOFT)
    return c


def sequence():  # Lucid: photon-handoff.png, 2400 x 3032
    c = Canvas(2400, 2860)
    lanes = [("Person", "(badge)"), ("Station", "(ESP32)"), ("Server", "(FastAPI)"), ("Tiger Data", "(TimescaleDB)"),
             ("Gemini", "(3.5-flash-lite)"), ("Wall", "(browser)")]
    xs = [220 + i * 392 for i in range(6)]
    for i, ((a, b), x) in enumerate(zip(lanes, xs)):
        hl = a == "Server"
        c.rect(x - 175, 40, 350, 128, stroke=GREEN if hl else GREY, fill=GREEN if hl else FILL, sw=3.5, rx=18)
        c.text(x, 96, a, size=33, weight=700, anchor="middle", color="#fff" if hl else INK)
        c.text(x, 140, b, size=25, anchor="middle", color="#fff" if hl else SOFT)
        c.line([(x, 168), (x, 2560)], color=GREY, sw=3.5, head=None)
    def msg(i, a, b, y, label, color=GREEN, dashed=False, lines=1):
        x1, x2 = xs[a], xs[b]
        sgn = 1 if x2 > x1 else -1
        c.line([(x1, y), (x2 - sgn * 4, y)], color=color, sw=4.5, dash="13 9" if dashed else None, dot_start=True)
        mid = (x1 + x2) / 2
        parts = label.split("\n")
        for k, p in enumerate(parts):
            c.text(mid, y - 22 - (len(parts) - 1 - k) * 36, (f"{i} " if k == 0 else "") + p, size=27, anchor="middle",
                   color=RASP if color == RASP else INK, weight=600 if color == RASP else 400)
    def region(y, h, label, color=RASP):
        c.rect(30, y, 2340, h, stroke=color, fill="none", sw=3.5, rx=22, dash="14 10")
        c.text(64, y + 44, label, size=26, weight=700, color=color)
    # Part 1: a check-in at the Entrance
    c.text(64, 236, "Ann checks in alone at the Entrance", size=30, weight=700, color=SOFT)
    msg(1, 0, 1, 330, "taps her badge")
    msg(2, 1, 2, 440, "POST /api/tap {station_id, uid}")
    msg(3, 2, 1, 550, "collecting, count 1 (median 260 ms)", color=DATA)
    msg(4, 2, 3, 680, "6 s later the window closes:\nwrite a check-in, +1 point")
    msg(5, 2, 5, 800, "checked_in + her best table, < 1 ms")
    region(860, 470, "2 s BUDGET: Gemini can only make the wall better, never slower", color=DATA)
    msg(6, 2, 4, 1010, "one icebreaker, under 20 words", color=DATA)
    msg(7, 4, 2, 1130, "text in 0.6-1.1 s", color=DATA)
    msg(8, 2, 5, 1260, "icebreaker: swap the template line", color=DATA)
    # Part 2: a join at Table 2
    c.text(64, 1430, "Ann walks to Table 2 and scans in with Ben", size=30, weight=700, color=SOFT)
    region(1470, 640, "SCAN WINDOW: it only counts if everyone taps this station within 6 s")
    msg(9, 0, 1, 1620, "Ben taps", color=RASP)
    msg(10, 1, 2, 1730, "POST /api/tap: collecting, count 1", color=RASP)
    msg(11, 0, 1, 1850, "Ann taps, 2 s later", color=RASP)
    msg(12, 1, 2, 1960, "POST /api/tap: count 2, window restarts", color=RASP)
    msg(13, 2, 3, 2200, "6 s after the last tap: one transaction,\njoin + a link for every new pair")
    msg(14, 2, 5, 2320, "group_joined · points_updated, < 1 ms")
    msg(15, 1, 2, 2440, "poll every 500 ms")
    msg(16, 2, 1, 2540, "joined: the blue LED flickers for 2 s", color=DATA)
    c.rect(30, 2600, 2340, 230, stroke=GREY, fill=FILL, sw=3.5, rx=22)
    for i, t in enumerate(("The station shows collecting the moment it reads a card, before the server answers. A badge held on the",
                           "reader counts once (3 s dedupe). If Gemini is late, errors or has no key, nothing is sent and the template",
                           "line stays. Icebreakers are cached per (person, table), so a repeat check-in costs nothing.")):
        c.text(64, 2660 + i * 52, t, size=27)
    return c


DIAGRAMS = {"architecture": (architecture, 2400, 1260), "scan-pipeline": (pipeline, 2400, 2260),
            "user-journey": (journey, 2400, 1120), "tap-sequence": (sequence, 2400, 2860)}


def tiger():  # same visual language as architecture.png, for the Tiger Data sponsor block
    c = Canvas(2400, 1260)
    c.text(50, 70, "Tap In on Tiger Data", size=46, weight=700)
    c.text(50, 116, "Two hypertables, two continuous aggregates (the second built on the first), and the endpoints that read them.", size=28)
    c.box(40, 210, 330, 220, "Every tap", ["POST /api/tap", "collecting, unknown,", "claimed"])
    c.box(40, 520, 330, 220, "Every scan", ["kind, size, station,", "group, at resolve"])
    c.group(440, 160, 1120, 760, "Tiger Data  ·  Postgres + TimescaleDB")
    c.box(480, 230, 460, 230, "taps", ["raw, append-only"], kind="data", mono_lines=["hypertable on ts"])
    c.box(480, 520, 460, 230, "scan_events", ["checkin · join · new_group", "repeat · help"], kind="data", mono_lines=["hypertable on ts"])
    c.box(1040, 520, 480, 230, "scans_per_10min", ["real-time, refresh 1 min"], kind="rasp", mono_lines=["materialized_only = false"])
    c.box(1040, 230, 480, 230, "scans_per_hour", ["hierarchical, refresh 5 min"], kind="rasp", mono_lines=["built on scans_per_10min"])
    c.box(480, 800, 1040, 90, "people · groups · group_members · needs · connections (regular tables)", [], kind="grey", tsize=24)
    c.line([(370, 320), (480, 320)], color=DATA)
    c.line([(370, 630), (480, 630)], color=DATA)
    c.line([(940, 635), (1040, 635)], color=RASP)
    c.line([(1280, 520), (1280, 460)], color=RASP)
    c.box(1640, 520, 720, 230, "/api/stats + stats_updated", ["here now, groups, links today, busiest station",
                                                               "12 ten-minute buckets for the wall chart", "pushed to every wall every 30 s"])
    c.box(1640, 230, 720, 230, "/api/analytics", ["busiest station by hour, last 24 h", "today's check-ins, joins, helps",
                                                  "needs open and met, for staff"])
    c.line([(1520, 635), (1640, 635)], color=GREEN)
    c.line([(1520, 345), (1640, 345)], color=GREEN)
    c.legend(1640, 790, [("rasp", "continuous aggregate"), ("data", "hypertable"), ("green", "endpoint")], w=720)
    c.rect(40, 980, 1520, 240, stroke=GREY, fill=FILL, sw=3.5, rx=24)
    for i, t in enumerate(("connections is a regular table on purpose: a unique index on a hypertable must include the time",
                           "column, and we need one row per pair, so a repeat scan makes a link stronger instead of adding rows.",
                           "schema.sql is idempotent and runs on every start; the same schema runs on a local TimescaleDB if Wi-Fi dies.")):
        c.text(74, 1040 + i * 56, t, size=27)
    return c


DIAGRAMS["tiger-data"] = (tiger, 2400, 1260)


# ---------------------------------------------------------------- Sunday: the system as it runs now (3:2, 2400 x 1600)
def system():
    c = Canvas(2400, 1600)
    c.text(50, 72, "Tap In, as it runs at BostonHacks", size=46, weight=700)
    c.text(50, 118, "Two stations and a laptop server on the venue Wi-Fi; Tiger Data and Gemini in the cloud; tapin.boston for phones anywhere.", size=27)

    c.group(30, 170, 1500, 1390, "Venue Wi-Fi (cmap router)")
    c.box(70, 240, 380, 250, "Station 1 · Entrance", ["ESP32 + RC522", "check-ins"])
    c.box(70, 540, 380, 250, "Station 2 · Table 2", ["ESP32 + RC522", "group scans"])
    c.text(70, 850, "POST each tap,", size=25, color=SOFT)
    c.text(70, 884, "poll state every 500 ms", size=25, color=SOFT)
    c.line([(450, 365), (540, 365), (540, 520), (600, 520)], color=GREEN)
    c.line([(450, 665), (540, 665), (540, 520), (600, 520)], color=GREEN)

    c.box(600, 240, 560, 560, "Server laptop", ["FastAPI · one process", "scan windows (6 s)", "groups, points, matching",
          "host sign-in + room settings", "restarts itself if it exits"], kind="rasp", mono_lines=["192.168.8.236:8000"])
    c.box(600, 900, 560, 250, "Host wall", ["projector browser", "live over /ws", "sound: bells, plucks, chords"])
    c.line([(880, 800), (880, 900)], color=GREEN)
    c.box(70, 1000, 440, 250, "Phones on cmap", ["sign-up, claim,", "where you stand"], kind="data")
    c.line([(510, 1125), (560, 1125), (560, 700), (600, 700)], color=DATA)
    c.box(1200, 240, 300, 250, "Tiger Data", ["hypertables +", "continuous aggregates"], kind="data")
    c.box(1200, 560, 300, 250, "Gemini", ["icebreakers", "2 s budget"], kind="data")
    c.line([(1160, 365), (1200, 365)], color=DATA)
    c.line([(1160, 685), (1200, 685)], color=DATA)
    c.text(620, 1240, "Hosting, the room map, taps and live updates", size=25, color=SOFT)
    c.text(620, 1274, "stay on this network.", size=25, color=SOFT)

    c.group(1600, 170, 770, 1390, "Internet")
    c.box(1640, 240, 690, 230, "A phone, any network", ["opens tapin.boston"], kind="data")
    c.box(1640, 560, 690, 300, "tapin.boston", ["static pages on Vercel (Jun's project)", "landing · join · phone sign-up",
          "+ 6 API routes forwarded"], mono_lines=["signup · claim · me · focus · mode · needs"])
    c.box(1640, 950, 690, 260, "Cloudflare tunnel", ["outbound from the laptop", "address kept private"], kind="rasp")
    c.line([(1985, 470), (1985, 560)], color=DATA)
    c.line([(1985, 860), (1985, 950)], color=GREEN)
    c.line([(1640, 1080), (1300, 1080), (1300, 760), (1160, 760)], color=GREEN)
    c.text(1660, 1290, "Everything else on the public site", size=25, color=SOFT)
    c.text(1660, 1324, "answers 404 (see the next image).", size=25, color=SOFT)
    return c


def access():
    c = Canvas(2400, 1600)
    c.text(50, 72, "What is public, and what stays at the venue", size=46, weight=700)
    c.text(50, 118, "tapin.boston forwards six API routes and nothing else. Names, taps and hosting never leave the venue network.", size=27)
    c.group(40, 180, 1120, 1360, "Public · tapin.boston (any network)")
    rows = [("Pages", "landing · Join a space · phone sign-up, claim, where you stand"),
            ("POST /api/signup", "make a profile (first name only)"),
            ("GET /api/claim/{code}", "is my badge linked yet?"),
            ("GET /api/me/{id}", "where you stand"),
            ("POST /api/me/{id}/focus", "focus mode on or off"),
            ("POST /api/groups/{id}/mode", "open or heads-down table"),
            ("GET /api/needs", "what tables are looking for")]
    for i, (a, b) in enumerate(rows):
        y = 260 + i * 172
        c.rect(80, y, 1040, 140, stroke=GREEN, fill="#fff", sw=3.5, rx=18)
        c.text(110, y + 58, a, size=30, weight=600, mono=a.startswith(("POST", "GET")))
        c.text(110, y + 104, b, size=26, color=SOFT)
    c.group(1240, 180, 1120, 1360, "Venue Wi-Fi only · 192.168.8.236:8000")
    rows = [("Host a space + PIN", "/host · /api/host/* (on tapin.boston, Host forwards here)"),
            ("Host wall", "/wall/host.html, the projector"),
            ("GET /api/graph", "the room: everyone's first name"),
            ("stats · leaderboard · analytics", "the wall's side column"),
            ("POST /api/tap · /api/station/{id}", "the two stations"),
            ("/ws", "live updates to the wall"),
            ("Why", "names only for people in the room; no fake taps or PIN guesses")]
    for i, (a, b) in enumerate(rows):
        y = 260 + i * 172
        c.rect(1280, y, 1040, 140, stroke=RASP, fill="#fff", sw=3.5, rx=18)
        c.text(1310, y + 58, a, size=30, weight=600, mono=a.startswith(("POST", "GET", "/ws")), color=RASP if a == "Why" else INK)
        c.text(1310, y + 104, b, size=26, color=SOFT)
    return c


def sound_map():
    c = Canvas(2400, 1600)
    c.text(50, 72, "The room plays it: Tap In's sound map", size=46, weight=700)
    c.text(50, 118, "One pentatonic scale (C D E G A over two octaves), so overlapping sounds never clash. Silent until the first click.", size=27)
    c.group(40, 180, 1480, 1360, "Host wall (projector)")
    rows = [("Someone taps in", "a bell in their own note (person id % 10)", "green"),
            ("A new link", "a pluck of both people's notes together", "green"),
            ("A table forms or someone joins", "one pluck per new link, 120 ms apart: a rising run", "rasp"),
            ("A mentor helps a table", "a low warm chord", "green"),
            ("A table asks for help", "two quiet rising notes", "green"),
            ("Every 10th person here", "a trolley bell, two dings (event mode)", "rasp"),
            ("The room fills", "a quiet pad, 1 note when empty, up to 5 (event mode)", "green")]
    for i, (a, b, k) in enumerate(rows):
        y = 260 + i * 172
        col = RASP if k == "rasp" else GREEN
        c.rect(80, y, 1400, 140, stroke=col, fill="#fff", sw=3.5, rx=18)
        c.text(110, y + 58, a, size=31, weight=600)
        c.text(110, y + 104, b, size=27, color=SOFT)
    c.group(1600, 180, 760, 820, "Every page")
    for i, (a, b) in enumerate((("Buttons and fields", "a very soft tick"), ("An error appears", "one low soft note"),
                                ("City bed (optional)", "a low hum, a far-off trolley bell"), ("Speaker button", "mutes all; remembered"))):
        y = 260 + i * 172
        c.rect(1640, y, 680, 140, stroke=DATA, fill="#fff", sw=3.5, rx=18)
        c.text(1670, y + 58, a, size=30, weight=600)
        c.text(1670, y + 104, b, size=26, color=SOFT)
    c.group(1600, 1060, 760, 480, "Two modes, switched by staff")
    c.text(1640, 1150, "Event", size=32, weight=700, color=RASP)
    c.text(1640, 1192, "everything above plays", size=27)
    c.text(1640, 1282, "Quiet (study hours)", size=32, weight=700, color=GREEN)
    c.text(1640, 1324, "no bell on check-ins;", size=27)
    c.text(1640, 1360, "soft plucks for groups", size=27)
    c.text(1640, 1450, "?mode=quiet or the gear panel", size=25, color=SOFT, mono=True)
    return c


DIAGRAMS["system"] = (system, 2400, 1600)
DIAGRAMS["access"] = (access, 2400, 1600)
DIAGRAMS["sound-map"] = (sound_map, 2400, 1600)
