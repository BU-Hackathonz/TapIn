"""Real screenshots of Tap In as it runs now (Sunday), every one 3:2 for the Devpost gallery.

Pages come from the venue server (http://192.168.8.236:8000), which shows no attendee names on them. The host wall's room
comes from the fake server (python tools/fake_taps.py --events --port 8001: made-up people, no database), through the
wall's own ?server= option, and is captioned "sample data". Nothing here writes to the live database: the phone pages are
loaded as they are: the sign-up page sends nothing until "Get my badge" is pressed, and the claim page only reads the
status of a made-up claim code.

    python shots_now.py            # writes landing.png, join.png, phone-signup-claim.png, host-pin.png, host-wall.png
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

VENUE = "http://192.168.8.236:8000"
FAKE = "localhost:8001"
OUT = Path(__file__).resolve().parent.parent          # media/devpost/
W, H = 2400, 1600                                     # 3:2

BACKDROP = """<html><body style="margin:0;width:{W}px;height:{H}px;background:{bg};display:flex;align-items:center;
justify-content:center;gap:{gap}px;font-family:'IBM Plex Sans',Arial,sans-serif">{inner}</body></html>"""


def fake_mode(route):
    """Serve a phone page with FAKE = true (hard-coded replies, no server calls)."""
    r = route.fetch()
    route.fulfill(status=200, content_type="text/html; charset=utf-8", body=r.text().replace("const FAKE = false", "const FAKE = true"))


def desktop(b, url, out, wait=3500, before=None):
    pg = b.new_page(viewport={"width": 1440, "height": 960}, device_scale_factor=W / 1440)
    pg.goto(url, wait_until="load")
    pg.wait_for_timeout(wait)
    if before:
        before(pg)
    pg.screenshot(path=str(out))
    pg.close()
    print("wrote", out.name)


def phones(b, out):
    """The phone sign-up and the claim countdown, side by side on one 3:2 canvas."""
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    # No interception: the sign-up page sends nothing until "Get my badge" is pressed, and the claim page only reads
    # GET /api/claim/{code} for a made-up code, so nothing is written to the live database.
    # The claim page asks GET /api/claim/{code} every second; answer "waiting" so it shows the countdown, not "Time ran out".
    ctx.route("**/api/claim/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"status":"waiting"}'))
    tmp = []
    pg = ctx.new_page()
    pg.goto(VENUE + "/phone/", wait_until="load"); pg.wait_for_timeout(3500)
    p1 = OUT / "_phone1.png"; pg.screenshot(path=str(p1)); tmp.append(p1)
    pg.evaluate("sessionStorage.setItem('tapin_form', JSON.stringify({name:'Maya'}));"
                "sessionStorage.setItem('tapin_claim', JSON.stringify({person_id:1, claim_code:'FAKE01', expires_in:30}))")
    pg.goto(VENUE + "/phone/claim.html", wait_until="load"); pg.wait_for_timeout(2500)
    p2 = OUT / "_phone2.png"; pg.screenshot(path=str(p2)); tmp.append(p2)
    ctx.close()
    import base64
    imgs = "".join(f'<img src="data:image/png;base64,{base64.b64encode(p.read_bytes()).decode()}" '
                   'style="height:1440px;border-radius:44px;box-shadow:0 12px 40px rgba(0,0,0,.25)">' for p in tmp)
    canvas = b.new_page(viewport={"width": W, "height": H})
    canvas.set_content(BACKDROP.format(W=W, H=H, bg="#262a52", gap=120, inner=imgs), wait_until="load")
    canvas.wait_for_timeout(500)
    canvas.screenshot(path=str(out))
    canvas.close()
    for p in tmp:
        p.unlink()
    print("wrote", out.name)


def main(names):
    todo = set(names) or {"landing", "join", "phone", "host-pin", "host-wall"}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        if "landing" in todo:   # the opening scene plays first; wait for the hero with the two choices
            desktop(b, VENUE + "/landing/", OUT / "landing.png", wait=9000)
        if "join" in todo:
            desktop(b, VENUE + "/wall/join.html", OUT / "join.png", wait=4000)
        if "phone" in todo:
            phones(b, OUT / "phone-signup-claim.png")
        if "host-pin" in todo:
            desktop(b, VENUE + "/wall/join.html?host", OUT / "host-pin.png", wait=3500)
        if "host-wall" in todo:  # sample data: the fake server's made-up room, never real attendees
            desktop(b, f"{VENUE}/wall/host.html?start&silent&server={FAKE}&venue=BostonHacks", OUT / "host-wall.png", wait=14000)
        b.close()


if __name__ == "__main__":
    main(sys.argv[1:])
