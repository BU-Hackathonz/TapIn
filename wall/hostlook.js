// The sign-in steps and the join-or-host step in the style of David's host screen (wall/host.html, its Boston T look).
// Style only: the picture, the logo, the layout and the tap animation stay exactly as they are. This file only switches
// the style on and puts a black label bar on top of each step, ending in a line color, like the host screen's side column.
const HostLook = (() => {
  const LINES = ["var(--t-red-l)", "var(--t-orange-l)", "var(--t-blue-l)", "var(--t-green-l)"];
  const LINE_OF = { back: 3, 0: 0, 1: 1, 2: 2, 3: 3, 4: 0, 5: 1 };   // sign in red, about you orange, school blue, skills green, ...
  const BARS = { back: "Welcome back", 0: "Sign in", 1: "About you", 2: "School", 3: "What you bring", 4: "Link your apps", 5: "Your room" };

  // David's pixel smoke behind the page: low-res value noise, posterised through a 4x4 ordered dither, stepping
  // about ten times a second (the host screen's look), drawn in red at low alpha so the page stays light.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  function fume() {
    const c = document.createElement("canvas");
    c.className = "hl-fume"; c.setAttribute("aria-hidden", "true");
    c.width = 112; c.height = 70;
    document.body.prepend(c);
    const g = c.getContext("2d"), img = g.createImageData(c.width, c.height);
    const draw = (now) => {
      const w = c.width, h = c.height, s = now / 1000;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = (Math.sin(x * 0.07 + s * 0.3) + Math.sin(y * 0.12 - s * 0.2) + Math.sin((x + y) * 0.045 + s * 0.25)
          + Math.sin(Math.hypot(x - w * 0.25, y - h * 0.7) * 0.1 - s * 0.35)) / 4;
        const lv = Math.floor(((v + 1) / 2) * 3 + BAYER[(y % 4) * 4 + (x % 4)] - 0.5);
        const i = (y * w + x) * 4;
        img.data[i] = 212; img.data[i + 1] = 21; img.data[i + 2] = 27; img.data[i + 3] = lv <= 0 ? 0 : lv === 1 ? 9 : 20;
      }
      g.putImageData(img, 0, 0);
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { draw(0); return; }
    let last = 0;
    const loop = (now) => { if (now - last > 100) { last = now; draw(now); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // the host screen's black bottom bar, in amber dot-matrix lettering, saying what this is
  function strip() {
    const f = document.createElement("footer");
    f.className = "hl-board";
    const t = document.createElement("b"); t.textContent = "NEXT";
    const p = document.createElement("span"); p.textContent = "Sign in · tap your badge · find your table";
    const tag = document.createElement("i"); tag.textContent = "Prototype · sample data";
    f.append(t, p, tag);
    document.body.append(f);
  }

  function apply() {
    document.documentElement.dataset.look = "host";
    fume();
    strip();
    document.querySelectorAll(".card .step").forEach((sec) => {
      const label = BARS[sec.dataset.step];
      if (!label || sec.querySelector(".hl-bar")) return;
      const bar = document.createElement("p");
      bar.className = "hl-bar";
      bar.style.setProperty("--sc", LINES[LINE_OF[sec.dataset.step]]);
      bar.textContent = label;
      if (/^[1-4]$/.test(sec.dataset.step)) { const n = document.createElement("span"); n.textContent = `${sec.dataset.step} of 4`; bar.append(n); }
      sec.prepend(bar);
    });
  }
  return { apply };
})();
