// The opening scene as a reusable piece: a pixel Green Line train arrives at spark!, people step off and tap in, then it resolves.
//   await OpeningScene.play({ venue: "spark!" });      // full-screen overlay, about 7 s, Skip button / Esc / Space to jump ahead
// Drawn in code at 320x180 and scaled up with hard pixels. Same drawing as landing/index.html.
const OpeningScene = (() => {
  const W = 320, H = 180;
  let g = null, venue = "spark!";
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3), clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const R = (x, y, w, h2, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h2)); };
  const GROUND = 140, DOORX = 236, STOP = 74, T_TRAIN = 2.6, T_DOORS = 3.0, PEOPLE = [["#ff7ab2", "#2b1f23"], ["#ffc46b", "#2b1f23"], ["#7cc7ff", "#2b1f23"], ["#c9a2ff", "#2b1f23"], ["#ece0c6", "#2b1f23"]];
  const T_END = 7.2;
  const hashN = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

  function sky() {
    for (let i = 0; i < 9; i++) R(0, i * 14, W, 14, ["#f3e4dc", "#f1e0d8", "#efdcd3", "#edd9d0", "#ecd6cc", "#ead2c8", "#e8cfc4", "#e6cbc0", "#e4c8bc"][i]);
    for (let b = 0; b < 14; b++) { const x = b * 26 - 8, hh = 30 + hashN(b) * 52; R(x, GROUND - hh - 14, 22, hh + 14, "#dcbdb2"); for (let w = 0; w < 5; w++) for (let r = 0; r < hh / 9; r++) if (hashN(b * 9 + w * 3 + r) > 0.45) R(x + 3 + w * 4, GROUND - hh - 8 + r * 9, 2, 3, "#ecd3c8"); }
  }
  function building(lit) {
    const x = 196, y = 52, w = 84, hh = GROUND - y;
    R(x, y, w, hh, "#a8584d"); R(x - 3, y - 4, w + 6, 6, "#7d3d36"); R(x, y + 6, w, 2, "#8e4a44");
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { const on = lit > ((r * 5 + c) % 9) / 9 + 0.05; R(x + 6 + c * 15, y + 14 + r * 17, 9, 10, on ? "#ffd98a" : "#5a2d2a"); if (on) R(x + 6 + c * 15, y + 14 + r * 17, 9, 2, "#fff0c4"); }
    R(DOORX - 9, GROUND - 28, 18, 28, "#2b1f23"); R(DOORX - 7, GROUND - 26, 14, 26, lit > 0.2 ? "#ffd98a" : "#3a2b2b"); R(DOORX, GROUND - 26, 1, 26, "#2b1f23");
    R(x + 18, y - 16, 48, 11, "#111"); g.font = "10px DotGothic16, monospace"; g.fillStyle = "#ffb000"; g.textBaseline = "top"; g.fillText(venue.slice(0, 11), x + 22, y - 15);
  }
  function platform(t) {
    R(0, GROUND, W, 6, "#6a4f55"); R(0, GROUND + 6, W, 3, "#4a3a3d"); R(0, GROUND + 9, W, H - GROUND - 9, "#2b1f23");
    for (let i = 0; i < 16; i++) R(i * 22 + 2, GROUND + 12, 12, 2, "#3a2b2e");           // ties
    R(0, GROUND + 10, W, 1, "#8a7a7e");
    R(16, 112, 3, 28, "#2b1f23"); R(6, 108, 24, 8, "#00843D"); R(8, 110, 20, 4, "#f3e4dc");                    // station sign post
  }
  function train(t) {
    const x = -112 + ease(t / T_TRAIN) * (STOP + 112), y = GROUND - 30, moving = t < T_TRAIN, bob = moving ? Math.round(Math.sin(t * 40) * 0.6) : 0;
    const doors = clamp((t - T_TRAIN) / 0.35) * clamp((T_DOORS + 3.2 - t) / 0.35);
    R(x + 2, y - 8 + bob, 108, 2, "#2b1f23"); R(x + 40, y - 14 + bob, 2, 8, "#2b1f23"); R(x + 34, y - 15 + bob, 14, 2, "#2b1f23");                // pantograph
    R(x, y + bob, 112, 26, "#00843D"); R(x, y + bob, 112, 4, "#2fbf6a"); R(x, y + 20 + bob, 112, 3, "#f3e4dc"); R(x, y + 23 + bob, 112, 3, "#005c2a");
    for (let i = 0; i < 6; i++) R(x + 6 + i * 16, y + 6 + bob, 12, 9, "#cfe8d9");
    const dx = x + 70; R(dx, y + 4 + bob, 14, 19, "#005c2a"); R(dx + 2, y + 6 + bob, 4 + doors * 4, 17, doors > 0.05 ? "#3a2b2b" : "#cfe8d9"); R(dx + 8 - doors * 4, y + 6 + bob, 4, 17, "#cfe8d9");
    R(x + 106, y + 8 + bob, 6, 8, "#ffe9a8"); R(x + 108, y + 18 + bob, 4, 3, "#ffe9a8");
    for (const wx of [12, 30, 78, 96]) { R(x + wx, y + 24 + bob, 8, 5, "#111"); R(x + wx + 2, y + 26 + bob, 4, 2, "#8a7a7e"); }
    if (moving) for (let i = 0; i < 6; i++) R(x - 10 - i * 8 - (t * 60) % 8, GROUND - 8 + (i % 2) * 3, 5 - i * 0.6, 1, "#fff");            // speed streaks
    return { x, doorX: dx + 7 };
  }
  function person(i, t, doorStart) {
    const [col, ink] = PEOPLE[i], t0 = T_DOORS + 0.1 + i * 0.32, d = t - t0; if (d < 0) return null;
    const x0 = doorStart, x1 = DOORX, sp = 70, x = x0 + sp * d, lim = x1 - 2;
    const tapAt = (lim - x0) / sp; if (d > tapAt + 0.55) return { gone: true };
    const px = Math.min(x, lim), walking = x < lim, step = walking ? Math.floor(d * 8) % 2 : 0, y = GROUND - 12;
    R(px - 2, y + 1, 5, 6, col); R(px - 2, y - 3, 5, 4, "#f1c7a8"); R(px - 2, y - 4, 5, 2, ink); R(px - 2 + (step ? 0 : 1), y + 7, 2, 5, ink); R(px + 1 - (step ? 0 : 1), y + 7, 2, 5, ink);
    return { px, tapping: !walking, tapT: d - tapAt };
  }
  function tapFx(p) {
    if (!p || !p.tapping || p.tapT > 0.5) return;
    const k = p.tapT / 0.5, cx = DOORX - 16, cy = GROUND - 22;
    R(cx - 3, cy - 3, 6, 6, "#111"); R(cx - 1, cy - 1, 2, 2, "#ffb000");
    for (let i = 1; i <= 3; i++) { const rr = i * 4 + k * 10; if (rr > 4) { g.strokeStyle = "rgba(212,21,27," + (1 - k) + ")"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rr, -0.9, 0.9); g.stroke(); } }
  }
  function frame(t) {
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
    sky();
    const DS = STOP + 77, entered = PEOPLE.reduce((n, _, i) => n + (person(i, t, DS)?.gone ? 1 : 0), 0);
    building(clamp(entered / PEOPLE.length + (t > T_DOORS ? 0.15 : 0)));
    platform(t);
    const tr = train(t);
    PEOPLE.forEach((_, i) => { const p = person(i, t, DS); if (p && !p.gone) tapFx(p); });
  }

  function play(opts = {}) {
    if (opts.venue) venue = String(opts.venue);
    return new Promise((done) => {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;inset:0;z-index:99999;background:#ecd9d2;opacity:0;transition:opacity .35s ease";
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H; cv.setAttribute("aria-label", "A green line train arrives and people tap in");
      cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges";
      const skip = document.createElement("button"); skip.type = "button"; skip.textContent = "Skip";
      skip.style.cssText = "position:absolute;right:18px;bottom:22px;border:0;background:#111;color:#fff;font:600 13px/1 'IBM Plex Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:10px 14px;cursor:pointer;box-shadow:inset -6px 0 0 #00843D";
      el.append(cv, skip); document.body.append(el);
      requestAnimationFrame(() => { el.style.opacity = "1"; });
      g = cv.getContext("2d"); let finished = false, raf = 0;
      const end = () => { if (finished) return; finished = true; cancelAnimationFrame(raf); removeEventListener("keydown", key); el.style.opacity = "0"; setTimeout(() => { el.remove(); done(); }, 360); };
      const key = (e) => { if (e.key === "Escape" || e.key === " ") end(); };
      skip.addEventListener("click", end); addEventListener("keydown", key);
      const t0 = performance.now();
      const loop = (now) => { const t = (now - t0) / 1000; frame(Math.min(t, T_END)); if (t < T_END) raf = requestAnimationFrame(loop); else end(); };
      raf = requestAnimationFrame(loop);
    });
  }
  return { play };
})();
