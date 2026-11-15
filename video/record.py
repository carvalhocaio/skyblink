"""Record the six scenes with Playwright recordVideo (1920x1080, dark UI, live site, real data).

Each scene opens its own browser context, sets the page up off camera, then marks t0 (the first frame
the final video uses) and runs its actions on a clock measured from t0. The scene windows come from
the narration timestamps (timeline.py). Writes out/scenes/<scene>.webm and out/scenes/marks.json.

Usage: uv run record.py [s1 s2 ...]   (default: all scenes)
"""

import json
import shutil
import sys
import time
from pathlib import Path

from playwright.sync_api import Browser, Page, sync_playwright

from timeline import OUT, scene_windows

HERE = Path(__file__).parent
SITE = "https://skyblink-swart.vercel.app"
BARNARD = f"{SITE}/?ra=269.4462&dec=4.7682&fov=6"
VIEW = {"width": 1920, "height": 1080}
SCENES = OUT / "scenes"
EXTRA = 0.6  # recorded past the scene end, so trimming never runs out of frames

# Two easter eggs fire on their own during the demo (Galileo when the motion card agrees, Feynman when
# the window looks like DevTools is open). Marking them as found keeps their pop-up toasts out of the
# picture; the page itself is unchanged.
SEED_EGGS = "try { localStorage.setItem('skyblink-eggs', JSON.stringify(['galileo', 'feynman'])) } catch {}"

# A visible pointer for the one scene where the click is the point (headless recordings have none).
FAKE_CURSOR = """
addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div');
  c.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2l15 11.5-6.5 1 3.8 7.4-2.9 1.4-3.8-7.5L4 20z" fill="#fff" stroke="#05070d" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, {position: 'fixed', left: '0', top: '0', zIndex: 2147483646, pointerEvents: 'none',
    transformOrigin: '4px 2px', opacity: '0'});
  document.body.appendChild(c);
  // Moved by CSS transitions, so the glide stays smooth while the page's own animations keep it busy.
  window.__cursor = {
    at: (x, y) => { c.style.transition = 'none'; c.style.left = x - 4 + 'px'; c.style.top = y - 2 + 'px'; c.style.opacity = '1'; },
    to: (x, y, ms) => { c.style.transition = `left ${ms}ms cubic-bezier(0.3, 0, 0.2, 1), top ${ms}ms cubic-bezier(0.3, 0, 0.2, 1), transform 0.12s, opacity 0.3s`;
      c.style.left = x - 4 + 'px'; c.style.top = y - 2 + 'px'; },
    press: () => { c.style.transform = 'scale(0.82)'; setTimeout(() => { c.style.transform = ''; }, 140); },
    hide: () => { c.style.opacity = '0'; },
  };
});
"""

SMOOTH_SCROLL = """([y, ms]) => new Promise((done) => {
  const y0 = scrollY, t0 = performance.now();
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    window.scrollTo({ top: y0 + (y - y0) * ease(k), behavior: 'instant' });
    k < 1 ? requestAnimationFrame(step) : done();
  };
  requestAnimationFrame(step);
})"""

# The "Did it really move?" card: the bordered box around its heading.
CARD_TOP = "() => document.querySelector('#motion-title').closest('section, div[class*=border]').getBoundingClientRect().top"
JOB_DONE = "() => [...document.querySelectorAll('[role=status]')].some((e) => /^Done\\./.test(e.textContent.trim()))"


class Clock:
    """Seconds since the scene's t0.

    The page is covered with a magenta sync frame until t0; assemble.py finds the first frame without
    it, so the cut point is read from the video itself, not from wall-clock guesses.
    """

    def start(self, page: Page, go: bool = False) -> None:
        page.evaluate(
            "() => { const d = document.createElement('div'); d.id = 'sync-mark';"
            " d.style.cssText = 'position:fixed;inset:0;background:#ff00ff;z-index:2147483647';"
            " document.body.appendChild(d); }"
        )
        page.wait_for_timeout(500)
        page.evaluate(
            "(go) => { document.getElementById('sync-mark').remove(); if (go) document.body.classList.add('go'); }", go
        )
        self.t0 = time.monotonic()

    def until(self, t: float) -> None:
        time.sleep(max(0.0, self.t0 + t - time.monotonic()))


def instant_scroll(page: Page, y: float) -> None:
    page.evaluate("(y) => window.scrollTo({ top: y, behavior: 'instant' })", y)
    page.wait_for_timeout(150)


def scroll_for_card(page: Page, card_top: float) -> float:
    """scrollY that puts the motion card's top at `card_top` px (the column is sticky, so iterate)."""
    for _ in range(4):
        y = page.evaluate("() => scrollY") + page.evaluate(CARD_TOP) - card_top
        instant_scroll(page, y)
    return page.evaluate("() => scrollY")


def open_barnard(page: Page) -> None:
    page.goto(BARNARD, wait_until="networkidle")
    page.wait_for_function(JOB_DONE, timeout=120_000)
    page.wait_for_function(
        "() => [...document.querySelectorAll('#watch img')].every((i) => i.complete && i.naturalWidth > 0)"
    )


def card_scene(page: Page, clock: Clock, dur: float, html: str) -> None:
    page.goto((HERE / "scenes" / html).as_uri(), wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(300)
    clock.start(page, go=True)
    clock.until(dur + EXTRA)


def s1(page: Page, clock: Clock, dur: float, marks: dict) -> None:
    card_scene(page, clock, dur, "title.html")


def s2(page: Page, clock: Clock, dur: float, marks: dict) -> None:
    """The explainer's flipbook step: three seasons, far stars frozen, the nearby star moving."""
    page.goto(SITE, wait_until="networkidle")
    page.evaluate("document.querySelector('#how').scrollIntoView({ behavior: 'instant' })")
    page.evaluate("[...document.querySelectorAll('#how button')].find((b) => /flipbook/.test(b.textContent)).click()")
    page.wait_for_timeout(500)
    clock.start(page)
    clock.until(dur + EXTRA)


def s3(page: Page, clock: Clock, dur: float, marks: dict) -> None:
    """The top of the site, then a click on "Watch Barnard's Star move"."""
    page.goto(SITE, wait_until="networkidle")
    page.wait_for_timeout(1500)  # hero entrance animations
    button = page.get_by_role("button", name="Watch Barnard’s Star move").or_(
        page.get_by_role("link", name="Watch Barnard’s Star move")
    ).first
    box = button.bounding_box()
    tx, ty = round(box["x"] + box["width"] * 0.55), round(box["y"] + box["height"] * 0.6)
    page.evaluate("() => window.__cursor.at(1180, 930)")
    clock.start(page)
    clock.until(0.5)
    page.evaluate("([x, y]) => window.__cursor.to(x, y, 800)", [tx, ty])
    clock.until(1.3)
    page.mouse.move(tx, ty)  # real hover, for the button's own hover state
    clock.until(1.6)  # early enough for the player to be on screen before the scene ends
    page.evaluate("() => window.__cursor.press()")
    button.evaluate("(b) => b.click()")
    clock.until(2.1)
    page.evaluate("() => window.__cursor.hide()")
    page.mouse.move(8, 700)  # off the picture: hovering it draws RA/Dec guides
    clock.until(dur + EXTRA)
    marks["s3_scroll"] = page.evaluate("() => scrollY")


def s4(page: Page, clock: Clock, dur: float, marks: dict) -> None:
    """The player blinking Barnard's Star, then down to "Did it really move?"."""
    open_barnard(page)
    target = scroll_for_card(page, 560)
    instant_scroll(page, marks["s3_scroll"])
    page.mouse.move(8, 700)
    page.wait_for_timeout(1000)
    clock.start(page)
    clock.until(5.6)  # about three loops of the three seasons at "Normal" (0.6 s per picture)
    page.evaluate(SMOOTH_SCROLL, [target, 1000])
    clock.until(dur + EXTRA)
    marks["s4_scroll"] = page.evaluate("() => scrollY")


def s5(page: Page, clock: Clock, dur: float, marks: dict) -> None:
    """The saturation alert comes up under the motion card."""
    open_barnard(page)
    target = scroll_for_card(page, 380)
    instant_scroll(page, marks["s4_scroll"])
    page.mouse.move(8, 700)
    page.wait_for_timeout(800)
    clock.start(page)
    clock.until(0.3)
    page.evaluate(SMOOTH_SCROLL, [target, 900])
    clock.until(dur + EXTRA)


def s6(page: Page, clock: Clock, dur: float, marks: dict) -> None:
    card_scene(page, clock, dur, "end.html")


ACTIONS = {"s1": s1, "s2": s2, "s3": s3, "s4": s4, "s5": s5, "s6": s6}


def record(browser: Browser, name: str, dur: float, marks: dict) -> dict:
    tmp = SCENES / f"tmp-{name}"
    shutil.rmtree(tmp, ignore_errors=True)
    ctx = browser.new_context(
        viewport=VIEW, screen=VIEW, device_scale_factor=1, color_scheme="dark",
        record_video_dir=str(tmp), record_video_size=VIEW,
    )
    ctx.add_init_script(SEED_EGGS)
    if name == "s3":
        ctx.add_init_script(FAKE_CURSOR)
    page = ctx.new_page()
    clock = Clock()
    ACTIONS[name](page, clock, dur, marks)
    closed = time.monotonic()
    video = page.video
    ctx.close()
    dest = SCENES / f"{name}.webm"
    shutil.move(video.path(), dest)
    shutil.rmtree(tmp, ignore_errors=True)
    return {"dur": dur, "recorded_after_t0": round(closed - clock.t0, 3)}


def main() -> None:
    wanted = sys.argv[1:] or list(ACTIONS)
    windows = scene_windows()
    SCENES.mkdir(parents=True, exist_ok=True)
    marks_file = SCENES / "marks.json"
    marks = json.loads(marks_file.read_text()) if marks_file.exists() else {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True, args=["--hide-scrollbars"])
        # Warm the API once, so Barnard's result answers from cache during the takes.
        ctx = browser.new_context(viewport=VIEW, color_scheme="dark")
        ctx.add_init_script(SEED_EGGS)
        t = time.monotonic()
        open_barnard(ctx.new_page())
        print(f"warm-up: Barnard ready in {time.monotonic() - t:.1f} s")
        ctx.close()
        for name in ACTIONS:  # in order: s4 and s5 start where the previous scene ended
            if name not in wanted:
                continue
            a, b = windows[name]
            marks[name] = record(browser, name, round(b - a, 3), marks)
            print(f"{name}: {marks[name]}")
            marks_file.write_text(json.dumps(marks, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
