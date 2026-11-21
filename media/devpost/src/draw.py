"""Tiny SVG diagram kit in the Lucid style: rounded boxes, teal/blue/orange borders, grey groups, a legend."""
from html import escape

TEAL, BLUE, ORANGE, GREY = "#1f7a73", "#3b7dc4", "#e0622a", "#c9d2d2"
FILL, INK, SOFT = "#f1f5f5", "#1c2a2a", "#4a5a5a"
FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"


class Diagram:
    def __init__(self, w, h):
        self.w, self.h, self.parts = w, h, []

    def group(self, x, y, w, h, label, size=22):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="#fff" stroke="{GREY}" stroke-width="3"/>')
        if label:
            self.parts.append(f'<text x="{x + 26}" y="{y + 38}" font-size="{size}" font-weight="700" fill="{INK}">{escape(label)}</text>')

    def box(self, x, y, w, h, title, lines=(), kind="teal", align="middle", tsize=27, lsize=21, fill=None, title_color=None):
        color = {"teal": TEAL, "blue": BLUE, "orange": ORANGE, "grey": GREY}[kind]
        f = fill or ("#fff" if kind == "orange" else FILL)
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{f}" stroke="{color}" stroke-width="3.5"/>')
        tx = x + w / 2 if align == "middle" else x + 28
        n = len(lines)
        block = tsize + (n * (lsize + 11))
        ty = y + (h - block) / 2 + tsize * 0.85
        tc = title_color or (ORANGE if kind == "orange" else INK)
        self.parts.append(f'<text x="{tx}" y="{ty}" text-anchor="{"middle" if align == "middle" else "start"}" font-size="{tsize}" font-weight="700" fill="{tc}">{escape(title)}</text>')
        for i, line in enumerate(lines):
            ly = ty + 14 + (i + 1) * (lsize + 11)
            self.parts.append(f'<text x="{tx}" y="{ly}" text-anchor="{"middle" if align == "middle" else "start"}" font-size="{lsize}" fill="{INK}">{escape(line)}</text>')

    def text(self, x, y, s, size=20, color=SOFT, anchor="middle", weight=400):
        self.parts.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" font-weight="{weight}" fill="{color}">{escape(s)}</text>')

    def arrow(self, pts, label=None, color=TEAL, dashed=False, lx=None, ly=None, lanchor="middle", width=3.5, head=True):
        d = "M " + " L ".join(f"{x} {y}" for x, y in pts)
        dash = ' stroke-dasharray="10 8"' if dashed else ""
        mid = {"#1f7a73": "t", "#e0622a": "o", "#3b7dc4": "b", "#8a9696": "g", "#1c2a2a": "k"}.get(color, "t")
        mk = f' marker-end="url(#m{mid})"' if head else ""
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}"{dash}{mk}/>')
        if label:
            (x1, y1), (x2, y2) = pts[-2], pts[-1]
            self.parts.append(f'<text x="{lx if lx is not None else (x1 + x2) / 2}" y="{ly if ly is not None else (y1 + y2) / 2 - 12}" text-anchor="{lanchor}" font-size="20" fill="{color if color != TEAL else INK}">{escape(label)}</text>')

    def legend(self, x, y, items, w=520):
        h = 60 + 46 * len(items)
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{FILL}" stroke="{GREY}" stroke-width="3"/>')
        self.parts.append(f'<text x="{x + 28}" y="{y + 42}" font-size="22" font-weight="700" fill="{INK}">Legend</text>')
        for i, (kind, label) in enumerate(items):
            yy = y + 70 + i * 46
            if kind == "dash":
                self.parts.append(f'<path d="M {x + 30} {yy} L {x + 80} {yy}" stroke="#8a9696" stroke-width="3.5" stroke-dasharray="10 8"/>')
            else:
                color = {"teal": TEAL, "blue": BLUE, "orange": ORANGE}[kind]
                self.parts.append(f'<rect x="{x + 30}" y="{yy - 16}" width="50" height="32" rx="9" fill="{"#fff" if kind == "orange" else FILL}" stroke="{color}" stroke-width="3.5"/>')
            self.parts.append(f'<text x="{x + 100}" y="{yy + 7}" font-size="20" fill="{INK}">{escape(label)}</text>')

    def svg(self):
        defs = "".join(
            f'<marker id="m{k}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
            for k, c in (("t", TEAL), ("o", ORANGE), ("b", BLUE), ("g", "#8a9696"), ("k", INK)))
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" '
                f'font-family="{FONT}"><defs>{defs}</defs><rect width="100%" height="100%" fill="#fff"/>' + "".join(self.parts) + "</svg>")
