"""Real screenshots from the live server: the wall (Start clicked) and two phone pages, framed like Lucid's."""
import base64
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / "out"
SERVER = "http://192.168.8.236:8000"
ME_ID = 288  # Avery's own profile


def frame(pg, shot: Path, out: Path, w=2454, h=1380):
    b64 = base64.b64encode(shot.read_bytes()).decode()
    pg.set_viewport_size({"width": w, "height": h})
    pg.set_content(f"""<!doctype html><style>html,body{{margin:0;background:#fff}}
      .s{{position:absolute;left:50%;top:0;transform:translateX(-50%);height:{h}px;background:#000}}
      img{{height:{h}px;display:block}}</style><div class="s"><img src="data:image/png;base64,{b64}"></div>""")
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(out))


with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    # the wall, 1440x900 at 2x = 2880x1800 (Lucid's dashboard size)
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    pg.goto(f"{SERVER}/wall/", wait_until="networkidle")
    for sel in ("text=Start", "button:has-text('Start')"):
        try:
            pg.click(sel, timeout=3000)
            break
        except Exception:
            pass
    pg.wait_for_timeout(4000)
    pg.screenshot(path=str(OUT / "wall.png"))
    print("wall.png")
    pg.close()
    # phone pages at iPhone size
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    for name, url in (("signup", f"{SERVER}/phone/"), ("where-you-stand", f"{SERVER}/phone/me.html?id={ME_ID}")):
        pg = ctx.new_page()
        pg.goto(url, wait_until="networkidle")
        pg.wait_for_timeout(2500)
        raw = OUT / f"_{name}-raw.png"
        pg.screenshot(path=str(raw))
        pg.close()
        fp = b.new_page()
        frame(fp, raw, OUT / f"phone-{name}.png")
        fp.close()
        print(f"phone-{name}.png")
    b.close()
