"""Render the diagrams to PNG with Playwright + the installed Chrome (IBM Plex loads from Google Fonts)."""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from kit import page  # noqa: E402

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)


def all_diagrams():
    from diagrams import DIAGRAMS
    d = dict(DIAGRAMS)
    try:
        from drawings import DRAWINGS
        d.update(DRAWINGS)
    except ImportError:
        pass
    return d


def main(names):
    d = all_diagrams()
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        for name in names or list(d):
            fn, w, h = d[name]
            pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            pg.set_content(page(fn().svg()), wait_until="networkidle")
            pg.evaluate("document.fonts.ready")
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / f"{name}.png"), full_page=False)
            pg.close()
            print("rendered", name)
        b.close()


if __name__ == "__main__":
    main(sys.argv[1:])
