"""SVG kit for the Tap In Devpost images: Lucid's formats, Tap In's theme (the wall's raspberry + mint, IBM Plex)."""
from html import escape

GREEN = "#1F8A66"   # stations and server logic (the wall's mint, deepened for text on white)
DATA = "#4A63A8"    # data and external services: Tiger Data, Gemini, phones
RASP = "#B8406E"    # the key moment: proof of meeting (the wall's raspberry, deepened)
GREY = "#CBD2D0"
FILL = "#F4F7F6"
INK = "#1E1A22"
SOFT = "#5B5560"
LINE = "#2A2630"
SANS = "'IBM Plex Sans', Helvetica, Arial, sans-serif"
MONO = "'IBM Plex Mono', Consolas, monospace"
COLORS = {"green": GREEN, "data": DATA, "rasp": RASP, "grey": GREY, "ink": LINE}


def e(s):
    return escape(str(s))


class Canvas:
    def __init__(self, w, h):
        self.w, self.h, self.p = w, h, []

    # ---------- primitives ----------
    def rect(self, x, y, w, h, stroke=GREY, fill=FILL, sw=3.5, rx=22, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.p.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=26, color=INK, weight=400, anchor="start", mono=False, spacing=None, italic=False):
        fam = MONO if mono else SANS
        ls = f' letter-spacing="{spacing}"' if spacing else ""
        it = ' font-style="italic"' if italic else ""
        self.p.append(f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" fill="{color}" '
                      f'text-anchor="{anchor}"{ls}{it}>{e(s)}</text>')

    def line(self, pts, color=LINE, sw=3.5, dash=None, head="end", dot_start=False):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        mk = {"#1F8A66": "g", "#4A63A8": "d", "#B8406E": "r", "#2A2630": "k", "#8C9592": "s"}.get(color, "k")
        m = ""
        if head in ("end", "both"):
            m += f' marker-end="url(#a{mk})"'
        if head == "both":
            m += f' marker-start="url(#a{mk})"'
        path = "M " + " L ".join(f"{x} {y}" for x, y in pts)
        self.p.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{sw}"{d}{m}/>')
        if dot_start:
            self.p.append(f'<circle cx="{pts[0][0]}" cy="{pts[0][1]}" r="7" fill="{color}"/>')

    # ---------- composites ----------
    def group(self, x, y, w, h, label=None, size=28):
        self.rect(x, y, w, h, stroke=GREY, fill="#fff", sw=3.5, rx=26)
        if label:
            self.text(x + 30, y + 44, label, size=size, weight=700)

    def box(self, x, y, w, h, title, lines=(), kind="green", mono_lines=(), tsize=34, lsize=26, align="middle", fill=None,
            label=None):
        c = COLORS[kind]
        self.rect(x, y, w, h, stroke=c, fill=fill or ("#fff" if kind == "rasp" else FILL), sw=4, rx=22)
        rows = [(t, False) for t in lines] + [(t, True) for t in mono_lines]
        lab_h = 34 if label else 0
        block = lab_h + tsize + len(rows) * (lsize + 13)
        top = y + (h - block) / 2
        tx = x + w / 2 if align == "middle" else x + 32
        if label:
            self.text(tx, top + 22, label.upper(), size=22, weight=700, color=c, anchor=align if align == "middle" else "start", spacing=2)
        ty = top + lab_h + tsize * 0.82
        tcol = RASP if kind == "rasp" else INK
        self.text(tx, ty, title, size=tsize, weight=700, color=tcol, anchor="middle" if align == "middle" else "start")
        for i, (t, mono) in enumerate(rows):
            self.text(tx, ty + 16 + (i + 1) * (lsize + 13), t, size=lsize - (2 if mono else 0), color=INK if not mono else SOFT,
                      anchor="middle" if align == "middle" else "start", mono=mono)

    def chip(self, x, y, w, h, s, kind="green", size=26):
        c = COLORS[kind]
        self.rect(x, y, w, h, stroke=c, fill="#fff", sw=3, rx=h / 2.6)
        self.text(x + w / 2, y + h / 2 + size * 0.36, s, size=size, anchor="middle")

    def legend(self, x, y, items, w, title="Legend", note=None):
        h = 76 + 58 * len(items) + (40 * len(note) + 10 if note else 0)
        self.rect(x, y, w, h, stroke=GREY, fill=FILL, sw=3.5, rx=24)
        self.text(x + 34, y + 52, title, size=28, weight=700)
        for i, (kind, label) in enumerate(items):
            yy = y + 104 + i * 58
            if kind == "dash":
                self.line([(x + 34, yy - 8), (x + 96, yy - 8)], color="#8C9592", dash="12 9", head=None)
            else:
                c = COLORS[kind]
                self.rect(x + 34, yy - 30, 62, 40, stroke=c, fill="#fff" if kind == "rasp" else FILL, sw=3.5, rx=10)
            self.text(x + 120, yy, label, size=25)
        if note:
            for j, n in enumerate(note):
                self.text(x + 34, y + 104 + len(items) * 58 + 10 + j * 40, n, size=23, color=SOFT)

    def svg(self):
        defs = "".join(
            f'<marker id="a{k}" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
            for k, c in (("g", GREEN), ("d", DATA), ("r", RASP), ("k", LINE), ("s", "#8C9592")))
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}">'
                f'<defs>{defs}</defs><rect width="100%" height="100%" fill="#fff"/>{"".join(self.p)}</svg>')


FONT_LINK = ("<link href='https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700"
             "&family=IBM+Plex+Mono:wght@400;500&display=swap' rel='stylesheet'>")


def page(svg):
    return f"<!doctype html><meta charset='utf-8'>{FONT_LINK}<style>html,body{{margin:0;background:#fff}}</style>{svg}"
