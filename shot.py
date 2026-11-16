from playwright.sync_api import sync_playwright
import pathlib

out = pathlib.Path("/home/andre/makefun/radar2/out")
page_url = (out / "dashboard" / "index.html").as_uri()

shots = [
    ("01-board.png", "#board", None),
    ("02-detail.png", "#p=steakhouse-financial", None),
    ("03-filtered.png", "#filter?category=Dexs", None),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    for name, h, _ in shots:
        pg.goto(page_url + h)
        pg.wait_for_timeout(700)
        pg.wait_for_selector("main#app [class], main#app h1", timeout=8000)
        pg.screenshot(path=str(out / "screenshots" / name), full_page=False)
        print(name, "ok")
    browser.close()
    if errors:
        print("PAGE ERRORS:")
        for e in errors[:10]:
            print(" ", e)
