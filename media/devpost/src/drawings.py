"""Technical drawing (Lucid: enclosure-section.png) and the cover (Lucid: portfolio cover), in Tap In's theme."""
from kit import DATA, FILL, GREEN, GREY, INK, LINE, RASP, SOFT, Canvas


def dim(c, x1, y1, x2, y2, label, side="below", size=28):
    """A dimension line with arrows at both ends and a centered label."""
    c.line([(x1, y1), (x2, y2)], color=LINE, sw=3, head="both")
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    if y1 == y2:
        c.text(mx, my + (44 if side == "below" else -16), label, size=size, weight=700, anchor="middle")
    else:
        c.p.append(f'<text x="{mx - 24}" y="{my}" font-family="IBM Plex Sans" font-size="{size}" font-weight="700" fill="{INK}" '
                   f'text-anchor="middle" transform="rotate(-90 {mx - 24} {my})">{label}</text>')


def enclosure():
    c = Canvas(2400, 2220)
    c.text(50, 70, "Tap In station: enclosure", size=46, weight=700)
    c.text(50, 118, "A square food container, planned at 120 x 100 mm inside and 50 mm tall, with a 3 mm non-metal lid. "
                    "Planned sizes, from the shopping list.", size=28)
    S = 9.2  # px per mm in the side and top views
    # ---- side view ----
    c.text(160, 190, "Side view, cut away at the centreline", size=32, weight=700)
    X0, Y0, L, H = 160, 330, 120 * S, 50 * S
    c.rect(X0, Y0, L, H, stroke=LINE, fill="#fff", sw=5, rx=10)
    c.rect(X0 - 12, Y0 - 3 * S, L + 24, 3 * S, stroke=LINE, fill=FILL, sw=4, rx=4)              # lid
    c.rect(X0 + 10, Y0 - 3 * S - 10, L - 20, 8, stroke="none", fill=GREY, sw=0, rx=2)           # paper diffuser
    c.text(X0 + L / 2, Y0 - 3 * S - 26, "paper on the lid: “Tap in · Entrance”", size=26, anchor="middle")
    rx0 = X0 + (L - 60 * S) / 2
    c.rect(rx0, Y0 + 4, 60 * S, 1.6 * S + 4, stroke=DATA, fill="#E8ECF6", sw=3.5, rx=3)          # RC522 under the lid
    for i, t in enumerate(("RC522, 60 x 40 mm,", "taped flat under", "the lid, antenna up")):
        c.text(X0 + 24, Y0 + 80 + i * 36, t, size=25, weight=600, color=DATA)
    c.line([(rx0 + 20, Y0 - 3 * S - 60), (rx0 + 60 * S - 20, Y0 - 3 * S - 60)], color=DATA, dash="12 9", head=None, sw=3)
    c.text(rx0 + 60 * S + 16, Y0 - 3 * S - 52, "read zone", size=24, color=DATA)
    fy = Y0 + H - 4
    c.rect(X0 + 40, fy - 10 * S, 83 * S, 10 * S, stroke=GREY, fill=FILL, sw=3.5, rx=4)          # breadboard
    c.text(X0 + 40 + 41.5 * S, fy - 3.6 * S, "breadboard, 83 x 55 mm", size=26, anchor="middle")
    c.rect(X0 + 40 + 86 * S, fy - 8 * S, 28 * S, 8 * S, stroke=GREEN, fill=FILL, sw=3.5, rx=4)  # ESP32
    c.text(X0 + 40 + 100 * S, fy - 2.6 * S, "ESP32", size=26, weight=700, anchor="middle")
    for k in range(7):                                                                          # 7 jumpers reader -> ESP32
        x1 = rx0 + 6 * S + k * 3.2 * S
        x2 = X0 + 40 + 90 * S + k * 3 * S
        c.p.append(f'<path d="M {x1} {Y0 + 1.6 * S + 8} C {x1} {Y0 + 150}, {x2} {fy - 8 * S - 140}, {x2} {fy - 8 * S}" '
                   f'fill="none" stroke="#8C9592" stroke-width="2.6"/>')
    c.text(X0 + 24, Y0 + 300, "7 jumper wires,", size=25, color=SOFT)
    c.text(X0 + 24, Y0 + 334, "reader to ESP32", size=25, color=SOFT)
    c.rect(X0 + L - 6, fy - 9 * S, 16, 7 * S, stroke="none", fill="#fff", sw=0, rx=0)            # notch
    c.line([(X0 + 40 + 114 * S, fy - 4 * S), (X0 + L + 150, fy - 4 * S)], color=GREEN, sw=7, head=None)
    c.text(X0 + L + 40, fy - 4 * S - 22, "USB, out through a notch", size=25, color=GREEN, weight=600)
    c.text(X0 + L + 40, fy - 4 * S + 46, "taped down inside", size=25, color=GREEN)
    dim(c, X0, Y0 + H + 60, X0 + L, Y0 + H + 60, "120 mm")
    dim(c, X0 - 70, Y0 + H, X0 - 70, Y0, "50 mm")
    # ---- lid from above ----
    c.text(1680, 190, "Lid, from above", size=32, weight=700)
    LX, LY, LW, LHt = 1680, 270, 600, 500
    c.rect(LX, LY, LW, LHt, stroke=LINE, fill="#fff", sw=5, rx=14)
    c.rect(LX + 150, LY + 150, 300, 200, stroke=DATA, fill="none", sw=3, rx=6, dash="12 9")
    c.p.append(f'<circle cx="{LX + 300}" cy="{LY + 250}" r="88" fill="none" stroke="{RASP}" stroke-width="6"/>')
    c.p.append(f'<circle cx="{LX + 300}" cy="{LY + 250}" r="16" fill="{RASP}"/>')
    c.text(LX + 300, LY + 90, "Tap in", size=46, weight=700, anchor="middle")
    c.text(LX + 300, LY + 440, "Entrance", size=34, weight=600, anchor="middle", color=GREEN)
    c.text(LX + 300, LY + LHt + 50, "tap target over the reader; station name below", size=25, anchor="middle")
    # ---- top view, lid removed ----
    c.text(160, 1010, "Top view, lid removed: boards to scale", size=32, weight=700)
    TX, TY, TL, TW = 160, 1080, 120 * S, 100 * S
    c.rect(TX, TY, TL, TW, stroke=LINE, fill="#fff", sw=5, rx=10)
    c.rect(TX + (TL - 60 * S) / 2, TY + (TW - 40 * S) / 2, 60 * S, 40 * S, stroke=DATA, fill="none", sw=3.5, rx=6, dash="12 9")
    c.text(TX + TL / 2, TY + (TW - 40 * S) / 2 - 18, "RC522 footprint (on the lid, above)", size=25, color=DATA, anchor="middle")
    c.rect(TX + 40, TY + TW - 55 * S - 40, 83 * S, 55 * S, stroke=GREY, fill=FILL, sw=3.5, rx=8)
    c.text(TX + 40 + 41.5 * S, TY + TW - 27.5 * S - 30, "breadboard", size=28, weight=700, anchor="middle")
    c.text(TX + 40 + 41.5 * S, TY + TW - 27.5 * S + 8, "83 x 55", size=26, anchor="middle")
    c.rect(TX + 40 + 86 * S, TY + TW - 55 * S - 40, 28 * S, 55 * S, stroke=GREEN, fill="#fff", sw=4, rx=8)
    c.text(TX + 40 + 100 * S, TY + TW - 27.5 * S - 30, "ESP32", size=28, weight=700, anchor="middle")
    c.text(TX + 40 + 100 * S, TY + TW - 27.5 * S + 8, "55 x 28", size=26, anchor="middle")
    c.p.append(f'<circle cx="{TX + 40 + 100 * S}" cy="{TY + TW - 55 * S - 10}" r="9" fill="{DATA}"/>')
    c.text(TX + 40 + 100 * S - 22, TY + TW - 55 * S - 2, "LED", size=22, color=DATA, anchor="end")
    c.line([(TX + 40 + 100 * S, TY + TW - 40), (TX + 40 + 100 * S, TY + TW + 90)], color=GREEN, sw=7, head=None)
    c.text(TX + 40 + 100 * S + 20, TY + TW + 70, "USB out", size=25, color=GREEN, weight=600)
    dim(c, TX, TY + TW + 140, TX + TL, TY + TW + 140, "120 mm")
    dim(c, TX - 70, TY + TW, TX - 70, TY, "100 mm")
    # ---- detail A ----
    c.text(1680, 1010, "Detail A: reading through the lid", size=32, weight=700)
    DX, DY = 1690, 1140
    c.rect(DX + 70, DY, 220, 30, stroke=RASP, fill="#fff", sw=4, rx=6)
    c.text(DX + 60, DY + 24, "badge", size=25, anchor="end", color=RASP, weight=600)
    c.rect(DX, DY + 50, 360, 28, stroke=LINE, fill=FILL, sw=4, rx=3)
    c.text(DX + 380, DY + 72, "lid, 3 mm, non-metal", size=25)
    c.rect(DX + 40, DY + 82, 280, 22, stroke=DATA, fill="#E8ECF6", sw=3.5, rx=3)
    c.text(DX + 380, DY + 108, "RC522, taped tight", size=25, color=DATA)
    for r in (50, 90, 130):
        c.p.append(f'<path d="M {DX + 180 - r * 1.3} {DY + 94} A {r * 1.3} {r} 0 0 1 {DX + 180 + r * 1.3} {DY + 94}" fill="none" '
                   f'stroke="{DATA}" stroke-width="2.5" stroke-dasharray="10 8"/>')
    for i, t in enumerate(("13.56 MHz field, antenna gain set to max", "reads a badge flat on the lid; held on it", "for 10 s, it counts once (3 s dedupe)",
                           "metal anywhere in the lid would block it")):
        c.text(DX, DY + 260 + i * 42, t, size=26)
    # ---- legend ----
    c.line([(1690, 1780), (1770, 1780)], color=DATA, dash="12 9", sw=4, head=None)
    c.text(1790, 1790, "Reader footprint and read zone", size=26)
    c.line([(1690, 1840), (1770, 1840)], color=GREEN, sw=7, head=None)
    c.text(1790, 1850, "USB cable to a 5 V wall charger", size=26)
    c.text(1690, 1920, "No soldering: jumper wires and tape.", size=26, color=SOFT)
    c.text(1690, 1960, "No buzzer and no LED strip; the", size=26, color=SOFT)
    c.text(1690, 2000, "ESP32's own blue LED shows state.", size=26, color=SOFT)
    return c


def cover():
    c = Canvas(1642, 920)
    c.p.append('<rect width="1642" height="920" fill="#FBF8F6"/>')
    c.rect(42, 35, 192, 192, stroke="none", fill="#1E1A22", sw=0, rx=4)
    c.p.append(f'<circle cx="138" cy="131" r="44" fill="none" stroke="#5CC8A0" stroke-width="14"/>')
    c.p.append(f'<circle cx="138" cy="131" r="14" fill="#C85C84"/>')
    c.text(262, 142, "Spark! Hack Our Space", size=32, color="#3A3540", weight=500)
    c.text(88, 470, "Tap In: walk in, tap in,", size=64, weight=700)
    c.text(88, 556, "find your people", size=64, weight=700)
    c.text(88, 622, "BostonHacks · 21–22 November 2026", size=30, color="#3A3540")
    tiles = [(810, 0), (1118, 0), (1426, 0), (1118, 308), (1426, 308), (1118, 616), (1426, 616)]
    fills = ["#5CC8A0", "#F3D9E3", "#C85C84", "#E3F4EC", "#4A63A8", "#C85C84", "#5CC8A0"]
    for (x, y), f in zip(tiles, fills):
        c.p.append(f'<rect x="{x}" y="{y}" width="{308 if x < 1426 else 216}" height="304" fill="{f}"/>')
    # tile art: a badge, a station, a room
    c.p.append('<rect x="890" y="70" width="150" height="100" rx="14" fill="#fff"/><circle cx="930" cy="120" r="18" fill="#1E1A22"/>'
               '<rect x="960" y="105" width="60" height="10" rx="5" fill="#1E1A22"/><rect x="960" y="125" width="40" height="10" rx="5" fill="#1E1A22"/>')
    c.p.append('<rect x="1190" y="80" width="164" height="130" rx="18" fill="#fff" stroke="#C85C84" stroke-width="8"/>'
               '<circle cx="1272" cy="145" r="34" fill="none" stroke="#C85C84" stroke-width="8"/><circle cx="1272" cy="145" r="10" fill="#C85C84"/>')
    c.p.append('<g stroke="#fff" stroke-width="7">' + "".join(
        f'<line x1="1272" y1="460" x2="{1272 + dx}" y2="{460 + dy}"/>' for dx, dy in ((-80, -60), (70, -70), (-60, 70), (85, 50), (0, -95))) + '</g>'
        + "".join(f'<circle cx="{1272 + dx}" cy="{460 + dy}" r="20" fill="#fff"/>' for dx, dy in ((-80, -60), (70, -70), (-60, 70), (85, 50), (0, -95)))
        + '<circle cx="1272" cy="460" r="26" fill="#C85C84"/>')
    for k in range(3):
        c.p.append(f'<circle cx="{1490 + k * 40}" cy="770" r="24" fill="#fff" opacity="{0.6 + k * 0.2}"/>')
    c.p.append('<path d="M 1500 140 a 60 60 0 1 1 0.1 0" fill="none" stroke="#fff" stroke-width="10"/>')
    # the station, drawn in place of Lucid's probe photo
    c.p.append('<g transform="translate(560 680) rotate(-12) scale(0.85)">'
               '<rect x="0" y="0" width="300" height="200" rx="22" fill="#1E1A22"/>'
               '<rect x="16" y="-30" width="268" height="40" rx="10" fill="#FBF8F6" stroke="#1E1A22" stroke-width="6"/>'
               '<text x="150" y="-2" font-family="IBM Plex Sans" font-size="24" font-weight="700" fill="#1E1A22" text-anchor="middle">Tap in · Entrance</text>'
               '<circle cx="150" cy="105" r="52" fill="none" stroke="#5CC8A0" stroke-width="10"/><circle cx="150" cy="105" r="14" fill="#C85C84"/>'
               '<circle cx="262" cy="172" r="9" fill="#4A63A8"/></g>')
    c.p.append('<path d="M 960 360 l 0 70 M 925 395 l 70 0" stroke="#5CC8A0" stroke-width="16" stroke-linecap="round"/>')
    return c


DRAWINGS = {"enclosure": (enclosure, 2400, 2220), "cover": (cover, 1642, 920)}
