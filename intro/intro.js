/* Tap In intros: two short animations built from what Tap In is: one tap, a room of dots, lines, tables.
 *
 *   TapInIntro.signIn(container, opts)  phone landing before the sign-up form ("you arrive"). Once per session.
 *   TapInIntro.map(container, opts)     wall opening right after Start ("the room fills up"). Once per page load.
 *
 * Both return a Promise that resolves when the intro is done and its layer is removed. A tap or a key press skips
 * to the end. Plain canvas + Web Audio, no libraries, nothing loaded from the network except one optional
 * GET of /api/graph (counts only; no names or faces are ever drawn).
 *
 * opts: { sound: true|false, quiet: bool, reducedMotion: bool, graphUrl: '/api/graph' }
 * Owner: Avery. See intro/README.md for how to hook it into a page.
 */
(function (global) {
  "use strict";

  // ---- look: the phone site's palette (phone/style.css). The page's own CSS variables win when they exist. -----
  const C = {
    bg: "#121212", you: "#b8466f", mint: "#7fe0bd", grey: "#6b6b6b", line: "#2c2c2c", panel: "#1a1a1a",
    walker: "#a8a8a8", text: "#f2f2f2", textDim: "#a0a0a0",
  };
  const SANS = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const now = () => performance.now();

  function prefersReduced(opts) {
    if (opts && typeof opts.reducedMotion === "boolean") return opts.reducedMotion;
    try { return global.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }

  // ---- sound: the wall's scale and voices, rebuilt with plain Web Audio -----------------------------------------
  // wall/sound.js: bell = FM (harmonicity 3, index 6, decay 1.2 s, -14 dB), pluck = Karplus-Strong (noise 1.2,
  // dampening 3800 Hz, resonance 0.9, -8 dB), both into a 4 s reverb at 35 % wet. Notes: C5 D5 E5 G5 A5 C6;
  // plucks sit an octave lower and land 90 ms apart. Voices are synthesized once into buffers, then just played.
  const Audio = (() => {
    const FREQ = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25,
                   G5: 783.99, A5: 880.0, C6: 1046.5 };
    const BELL_NOTES = ["C5", "D5", "E5", "G5", "A5", "C6"];
    const RUN_NOTES = ["C4", "D4", "E4", "G4", "A4", "C5", "D5", "E5"];  // the scale, rising, pluck register
    let ctx = null, dry = null, wet = null;
    const cache = {};

    function ensure() {
      if (ctx) return ctx;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      dry = ctx.createGain(); dry.gain.value = 0.65; dry.connect(ctx.destination);
      const verb = ctx.createConvolver(); verb.buffer = impulse(4.0);
      wet = ctx.createGain(); wet.gain.value = 0.35;
      verb.connect(wet); wet.connect(ctx.destination);
      wet._in = verb;
      return ctx;
    }
    function impulse(seconds) {
      const sr = ctx.sampleRate, n = Math.floor(sr * seconds), buf = ctx.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-6.9 * i / n);
      }
      return buf;
    }
    function bellBuffer(note) {
      const sr = ctx.sampleRate, f = FREQ[note], n = Math.floor(sr * 2.4), buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      let phase = 0, mphase = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.002) * Math.exp(-5 * t / 1.2);
        const menv = Math.exp(-5 * t / 0.4);
        mphase += 2 * Math.PI * f * 3 / sr;
        phase += 2 * Math.PI * (f + f * 6 * menv * Math.sin(mphase)) / sr;
        d[i] = Math.sin(phase) * env * 0.2;                         // -14 dB
      }
      return buf;
    }
    function pluckBuffer(note) {
      const sr = ctx.sampleRate, f = FREQ[note], n = Math.floor(sr * 0.9), buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0), N = Math.max(2, Math.round(sr / f)), line = new Float32Array(N);
      const a = Math.exp(-2 * Math.PI * 3800 / sr);                  // dampening: one-pole lowpass in the loop
      const burst = Math.round(N * 1.2);                            // attack noise
      let lp = 0, peak = 1e-6;
      for (let i = 0; i < n; i++) {
        const j = i % N, x = i < burst ? Math.random() * 2 - 1 : 0;
        lp = (1 - a) * line[j] + a * lp;
        const y = x + 0.9 * lp;                                     // resonance 0.9
        line[j] = y; d[i] = y; peak = Math.max(peak, Math.abs(y));
      }
      for (let i = 0; i < n; i++) d[i] = d[i] / peak * 0.4;         // -8 dB
      return buf;
    }
    function play(kind, note, when) {
      if (!ensure()) return;
      const key = kind + note;
      if (!cache[key]) cache[key] = kind === "bell" ? bellBuffer(note) : pluckBuffer(note);
      const src = ctx.createBufferSource();
      src.buffer = cache[key];
      src.connect(dry); src.connect(wet._in);
      src.start(Math.max(ctx.currentTime, when || 0));
    }
    return {
      unlock() { if (ensure() && ctx.state === "suspended") ctx.resume(); },
      bell() { play("bell", BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)]); },
      pluck(i) { play("pluck", RUN_NOTES[i % RUN_NOTES.length]); },
      run(n, gap) {                                                  // a rising run of plucks, 90 ms apart
        if (!ensure()) return;
        for (let i = 0; i < Math.min(n, RUN_NOTES.length); i++) play("pluck", RUN_NOTES[i], ctx.currentTime + i * (gap || 0.09));
      },
      warm(kinds) { if (ensure()) kinds.forEach((k) => { if (!cache[k]) cache[k] = k.startsWith("bell") ? bellBuffer(k.slice(4)) : pluckBuffer(k.slice(5)); }); },
    };
  })();

  // ---- a layer: one canvas over the container, crisp at devicePixelRatio <= 2 -------------------------------------
  function makeLayer(container, z, bg) {
    if (global.getComputedStyle(container).position === "static" && container !== document.body) container.style.position = "relative";
    const root = document.createElement("div");
    root.className = "tapin-intro";
    root.style.cssText = `position:${container === document.body ? "fixed" : "absolute"};inset:0;overflow:hidden;` +
      `background:${bg || C.bg};z-index:${z || 50};font-family:${SANS};color:${C.text};touch-action:manipulation;`;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    canvas.setAttribute("aria-hidden", "true");
    root.appendChild(canvas);
    container.appendChild(root);
    const g = canvas.getContext("2d");
    const layer = { root, canvas, g, w: 0, h: 0, dpr: 1 };
    layer.resize = () => {
      const r = root.getBoundingClientRect();
      layer.dpr = Math.min(2, global.devicePixelRatio || 1);
      layer.w = Math.max(1, r.width); layer.h = Math.max(1, r.height);
      canvas.width = Math.round(layer.w * layer.dpr); canvas.height = Math.round(layer.h * layer.dpr);
      g.setTransform(layer.dpr, 0, 0, layer.dpr, 0, 0);
    };
    layer.resize();
    return layer;
  }

  // Skip on any tap or key; returns a function that removes the listeners.
  function onSkip(fn) {
    const h = (e) => { if (e.type === "keydown" && ["Shift", "Control", "Alt", "Meta"].includes(e.key)) return; fn(); };
    global.addEventListener("pointerdown", h, true);
    global.addEventListener("keydown", h, true);
    return () => { global.removeEventListener("pointerdown", h, true); global.removeEventListener("keydown", h, true); };
  }

  function hairline(g, color, alpha, width) {
    g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = width || 1; g.lineCap = "butt";
  }
  function dot(g, x, y, r, color, alpha) {
    g.globalAlpha = alpha; g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // ---- shared motion pieces ---------------------------------------------------------------------------------------
  const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));

  function hex(c) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || "").trim());
    if (!m) return null;
    let h = m[1]; if (h.length === 3) h = h.replace(/./g, "$&$&");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  function mix(a, b, k) {             // blend two hex colours; falls back to a if either can't be read
    const x = hex(a), y = hex(b);
    if (!x || !y) return a;
    return "#" + x.map((v, i) => Math.round(lerp(v, y[i], k)).toString(16).padStart(2, "0")).join("");
  }
  function cssVar(el, name) {
    try { return global.getComputedStyle(el).getPropertyValue(name).trim(); } catch (e) { return ""; }
  }

  // Phone colours: phone/style.css variables when the page has them, else the same values built in.
  function phonePalette() {
    const root = document.documentElement, v = (n, d) => cssVar(root, n) || d;
    return { bg: v("--bg", C.bg), you: v("--you", C.you), mint: v("--group", C.mint), grey: v("--grey", C.grey),
             line: v("--line", C.line), text: v("--text", C.text), dim: v("--muted", C.textDim), walker: C.walker };
  }
  // Wall colours: whatever wall/themes.js has selected right now (Minimal, Night, White, Sketch, Blueprint).
  const WALL_BG = { night: "#121212", white: "#fafafa", sketch: "#f6f1e4", minimal: "#ffffff", blueprint: "#123a6b" };
  function wallPalette(opts) {
    // wall/themes.js and wall/sound.js declare `const Theme` / `const Sound` at the top level: global bindings that
    // are not properties of window, so look them up by name.
    const T = typeof Theme !== "undefined" ? Theme : global.Theme, c = (T && T.c) || null;
    if (!c) {
      return { bg: C.bg, table: C.mint, outline: "#3a3a3a", link: "#8a8a8a", person: C.text, solo: C.grey, text: C.text,
               dim: "#8a8a8a", accent: C.you, floor: "#222222", lit: C.mint, mono: MONO, sans: SANS };
    }
    const themed = !!document.body.dataset.theme;          // the wall sets body[data-theme]; its CSS then has the colours
    const bg = (opts && opts.bg) || (themed && cssVar(document.body, "--bg")) || WALL_BG[T.name] || C.bg;
    const mono = (themed && cssVar(document.body, "--mono")) || (T.name === "sketch" ? c.font : MONO);
    return { bg, table: c.inner, outline: c.region, link: c.link, person: c.student, solo: c.away, text: c.title,
             dim: c.dim, accent: c.accent, floor: mix(bg, c.title, 0.09), lit: c.inner, mono, sans: c.font || SANS };
  }

  // A pixel floor: square dots on a grid, pre-rendered once, then lit locally by waves and pings.
  function makeFloor(w, h, dpr, pitch, size, color) {
    const c = document.createElement("canvas");
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = color;
    const xs = [], ys = [];
    for (let x = pitch / 2; x < w; x += pitch) xs.push(x);
    for (let y = pitch / 2; y < h; y += pitch) ys.push(y);
    for (const x of xs) for (const y of ys) g.fillRect(x - size / 2, y - size / 2, size, size);
    return { canvas: c, xs, ys, pitch, size };
  }
  // Light the floor dots that sit on a ring (a wavefront) of radius r around (cx, cy).
  function lightRing(g, F, cx, cy, r, band, color, alpha) {
    if (alpha <= 0.01 || r <= 0) return;
    g.fillStyle = color;
    const x0 = cx - r - band, x1 = cx + r + band, y0 = cy - r - band, y1 = cy + r + band;
    const sz = F.size + 0.6;
    for (const x of F.xs) {
      if (x < x0 || x > x1) continue;
      for (const y of F.ys) {
        if (y < y0 || y > y1) continue;
        const d = Math.abs(Math.hypot(x - cx, y - cy) - r);
        if (d > band) continue;
        g.globalAlpha = alpha * (1 - d / band);
        g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    g.globalAlpha = 1;
  }
  function ring(g, x, y, r, color, alpha, width) {
    if (alpha <= 0.01 || r <= 0) return;
    hairline(g, color, alpha, width); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  }
  function line(g, ax, ay, bx, by, k, color, alpha, width) {
    if (k <= 0 || alpha <= 0.01) return;
    hairline(g, color, alpha, width);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k); g.stroke();
  }
  function curve(g, ax, ay, bx, by, bend, k, color, alpha) {   // a bowed link, drawn from a towards b
    if (k <= 0 || alpha <= 0.01) return;
    const mx = (ax + bx) / 2 - (by - ay) * bend, my = (ay + by) / 2 + (bx - ax) * bend;
    hairline(g, color, alpha); g.beginPath(); g.moveTo(ax, ay);
    const N = 18;
    for (let i = 1; i <= Math.ceil(N * k); i++) {
      const u = Math.min(k, i / N), v = 1 - u;
      g.lineTo(v * v * ax + 2 * v * u * mx + u * u * bx, v * v * ay + 2 * v * u * my + u * u * by);
    }
    g.stroke();
  }
  function typed(text, k) { return text.slice(0, Math.floor(clamp(k) * text.length)); }
  // A walk along a curve from (sx, sy) to the seat, with a few fading trail segments behind.
  function walkAt(p, k) {
    const u = 1 - k;
    return { x: u * u * p.sx + 2 * u * k * p.cx + k * k * p.x, y: u * u * p.sy + 2 * u * k * p.cy + k * k * p.y };
  }
  function trail(g, p, k, color, alpha) {
    for (let j = 1; j <= 6; j++) {
      const A = walkAt(p, Math.max(0, k - j * 0.05)), B = walkAt(p, Math.max(0, k - (j - 1) * 0.05));
      hairline(g, color, alpha * (1 - j / 7));
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
    }
  }
  function station(g, x, y, sz, color, flash, accent) {   // a reader at the door: a square that flashes on a tap
    g.globalAlpha = 1;
    hairline(g, color, 0.9);
    g.strokeRect(x - sz / 2, y - sz / 2, sz, sz);
    if (flash > 0) { g.globalAlpha = flash; g.fillStyle = accent; g.fillRect(x - sz / 2 + 2, y - sz / 2 + 2, sz - 4, sz - 4); }
    g.globalAlpha = 1;
  }

  // CSS for the DOM text: masked word reveals. Injected once.
  function ensureCss() {
    if (document.getElementById("tapin-intro-css")) return;
    const st = document.createElement("style");
    st.id = "tapin-intro-css";
    st.textContent =
      ".tapin-intro .ti-m{display:inline-block;overflow:hidden;vertical-align:bottom;padding-bottom:.08em}" +
      ".tapin-intro .ti-w{display:inline-block;transform:translateY(110%);animation:ti-up 620ms cubic-bezier(.2,.8,.2,1) forwards}" +
      ".tapin-intro .ti-f{opacity:0;transform:translateY(14px);animation:ti-in 600ms cubic-bezier(.2,.8,.2,1) forwards}" +
      "@keyframes ti-up{to{transform:none}}@keyframes ti-in{to{opacity:1;transform:none}}" +
      ".tapin-intro.ti-still *{animation:none!important;transform:none!important;opacity:1!important}";
    document.head.appendChild(st);
  }
  function maskWords(text, startMs, stepMs, byLetter) {
    const parts = byLetter ? [...text] : text.split(" ");
    return parts.map((p, i) => p === " " ? "&nbsp;" :
      `<span class="ti-m"><span class="ti-w" style="animation-delay:${startMs + i * stepMs}ms">${p}</span></span>`)
      .join(byLetter ? "" : " ");
  }

  async function readGraph(url) {
    if (!url) return null;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 700);
    try {
      const r = await fetch(url, { signal: ctrl && ctrl.signal, cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; } finally { clearTimeout(timer); }
  }
  // Counts only: how many are here, and how big each group is. Names never leave this function.
  function countRoom(data) {
    if (!data) return null;
    const here = (data.people || []).filter((p) => p.here);
    const sizes = {};
    let solos = 0;
    for (const p of here) { if (p.group_id != null) sizes[p.group_id] = (sizes[p.group_id] || 0) + 1; else solos++; }
    const tables = Object.values(sizes).sort((a, b) => b - a).slice(0, 8).map((n) => Math.min(n, 8));
    const needs = (data.groups || []).filter((g) => (g.looking_for || []).length).length;
    return { here: here.length, tables, solos: Math.min(solos, 14), needs };
  }

  // =================================================================================================================
  // 1. Sign-in landing: "you arrive"
  //    Laid out like the phone's own header (mint mono TAP IN, 28 px headline, raspberry button), so it hands
  //    over to the form without a jump. Alive before you touch it: the floor breathes from the door, people keep
  //    tapping in at the Entrance and walking to a seat, tables turn, links flicker, the button pulses. On the
  //    press the raspberry button folds into you and walks in through the door; three ripples light the floor and
  //    knock the tables; three people turn mint and line up to you; the table that needs you locks on; the camera
  //    pushes in and the screen lifts away to the form.
  // =================================================================================================================
  const SIGNIN_KEY = "tapin.intro.signin.v1";

  function signIn(container, opts) {
    opts = opts || {};
    try { if (sessionStorage.getItem(SIGNIN_KEY)) return Promise.resolve("already-played"); } catch (e) { /* private mode */ }
    const reduced = prefersReduced(opts);
    const soundOn = opts.sound !== false && !opts.quiet && !reduced;
    const K = phonePalette();
    ensureCss();

    return new Promise((resolve) => {
      const L = makeLayer(container, opts.zIndex, K.bg);
      const { g } = L;
      if (reduced) L.root.classList.add("ti-still");

      const ui = document.createElement("div");
      ui.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;" +
        "max-width:480px;margin:0 auto;padding:20px 16px 28px;box-sizing:border-box;pointer-events:none;text-align:left;";
      ui.innerHTML =
        `<div data-head>` +
        `<div style="font:500 14px ${MONO};letter-spacing:.08em;color:${K.mint}">` + maskWords("TAP IN", 60, 50, true) + `</div>` +
        `<h1 style="margin:4px 0 4px;font:700 28px/1.25 ${SANS};letter-spacing:-.01em;text-transform:none;color:${K.text}">` +
        maskWords("Tap in.", 260, 70) + `<br>` + maskWords("Find the table that needs you.", 400, 55) + `</h1>` +
        `<div data-stats class="ti-f" style="font:500 13px ${MONO};letter-spacing:.06em;color:${K.dim};animation-delay:800ms;min-height:1.3em"></div>` +
        `</div>` +
        `<div><div data-readout style="font:500 13px ${MONO};letter-spacing:.06em;color:${K.dim};min-height:1.3em;margin-bottom:10px"></div>` +
        `<button type="button" class="ti-f" style="animation-delay:900ms;pointer-events:auto;display:flex;align-items:center;` +
        `justify-content:center;width:100%;min-height:52px;margin:0;border:0;border-radius:0;background:${K.you};color:#fff;` +
        `font:600 17px ${SANS};cursor:pointer">Tap in</button></div>`;
      L.root.appendChild(ui);
      const btn = ui.querySelector("button"), statsEl = ui.querySelector("[data-stats]");
      const head = ui.querySelector("[data-head]"), readout = ui.querySelector("[data-readout]");

      let stats = null;
      readGraph(opts.graphUrl === undefined ? "/api/graph" : opts.graphUrl).then((d) => { stats = countRoom(d); });

      let room, floor, btnRect = null;
      function measureButton() {
        const r = btn.getBoundingClientRect(), o = L.root.getBoundingClientRect();
        btnRect = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
      }
      function layout() {
        const w = L.w, h = L.h;
        const o = L.root.getBoundingClientRect(), hb = head.getBoundingClientRect();
        const top = Math.max(hb.bottom - o.top + 18, h * 0.24), bottom = h - 52 - 28 - 10 - 1.3 * 13 - 46;
        const col = Math.min(480, w), left = (w - col) / 2 + 16, right = left + col - 32;
        const box = { x: left, y: top, x2: right, y2: Math.max(top + 160, bottom) };
        const bw = box.x2 - box.x, bh = box.y2 - box.y, s = Math.min(bw / 358, bh / 340, 1.25);
        const door = { x: (box.x + box.x2) / 2, y: box.y2, half: 15 * s };
        const at = (fx, fy) => ({ x: box.x + bw * fx, y: box.y + bh * fy });
        const tables = [
          { ...at(0.24, 0.24), r: 22 * s, n: 3, cap: 4 }, { ...at(0.74, 0.22), r: 26 * s, n: 3, cap: 5 },
          { ...at(0.27, 0.66), r: 19 * s, n: 2, cap: 3 }, { ...at(0.73, 0.64), r: 21 * s, n: 2, cap: 4, needs: true },
        ];
        const people = [];
        const seatOf = (t, i, ti) => {
          const a = -Math.PI / 2 + (i / t.cap) * Math.PI * 2 + ti * 0.7;
          return { x: t.x + Math.cos(a) * (t.r + 9 * s), y: t.y + Math.sin(a) * (t.r + 9 * s) };
        };
        tables.forEach((t, ti) => {
          t.free = [];
          for (let i = 0; i < t.cap; i++) {
            const seat = seatOf(t, i, ti);
            if (i < t.n) people.push({ bx: seat.x, by: seat.y, table: ti, ph: Math.random() * 6.28 });
            else t.free.push(seat);
          }
        });
        [[0.08, 0.45], [0.5, 0.42], [0.93, 0.44]].forEach(([fx, fy]) => {
          const q = at(fx, fy); people.push({ bx: q.x, by: q.y, table: -1, ph: Math.random() * 6.28 });
        });
        const you = { x: door.x, y: door.y - 22 * s };
        const pick = [0, 1, 3].map((ti) => people.filter((p) => p.table === ti)
          .sort((a, b) => Math.hypot(a.bx - you.x, a.by - you.y) - Math.hypot(b.bx - you.x, b.by - you.y))[0]);
        pick.forEach((p) => { p.d = Math.hypot(p.bx - you.x, p.by - you.y); p.meet = true; });
        pick.sort((a, b) => a.d - b.d);
        floor = makeFloor(w, h, L.dpr, Math.max(10, Math.round(13 * s)), 1.5, mix(K.bg, K.text, 0.09));
        room = { s, box, door, tables, people, you, pick, rmax: Math.hypot(w, h) * 0.8, walkers: [], taps: [] };
        pick.forEach((p) => { p.tPass = 300 + 1500 * (p.d / room.rmax); });
        tables.forEach((t) => { t.d = Math.hypot(t.x - you.x, t.y - you.y); });
        measureButton();
      }
      layout();

      const flick = [];
      function spawnFlicker(tau) {
        const ti = Math.floor(Math.random() * room.tables.length);
        const at = room.people.filter((p) => p.table === ti && !p.walking);
        if (at.length < 2) return;
        const a = at[Math.floor(Math.random() * at.length)];
        let b = a; while (b === a) b = at[Math.floor(Math.random() * at.length)];
        flick.push({ a, b, t0: tau });
      }
      // Someone taps in at the Entrance and walks to a free seat.
      function spawnArrival(tau) {
        const open = room.tables.map((t, ti) => ({ t, ti })).filter(({ t }) => t.free.length);
        if (!open.length) return false;
        const { t, ti } = open[Math.floor(Math.random() * open.length)];
        const seat = t.free.shift(), { door, s } = room;
        const p = { bx: seat.x, by: seat.y, x: seat.x, y: seat.y, table: ti, ph: Math.random() * 6.28, walking: true,
                    sx: door.x, sy: door.y + 18 * s, t0: tau + 260, t1: tau + 260 + 1100 };
        p.cx = (p.sx + p.x) / 2 + (p.x < door.x ? -1 : 1) * 40 * s; p.cy = (p.sy + p.y) / 2 + 30 * s;
        room.people.push(p); room.walkers.push(p); room.taps.push(tau);
        return true;
      }

      const born = now();
      let pressAt = -1, raf = 0, done = false, stopSkip = () => {}, nextFlick = 1100, nextArrive = 1700;
      const plucked = new Set();

      function pos(p, tau) {
        if (p.walking) {
          if (tau < p.t1) return walkAt(p, easeOut(seg(tau, p.t0, p.t1)));
          p.walking = false;
        }
        const k = tau * 0.0011 + p.ph;
        return { x: p.bx + Math.cos(k) * 1.6 * room.s, y: p.by + Math.sin(k * 1.3) * 1.6 * room.s };
      }

      function draw() {
        const tau = reduced ? 3000 : now() - born;
        const T = pressAt < 0 ? -1 : now() - pressAt;
        const { s, box, door, tables, people, you, pick } = room;
        const w = L.w, h = L.h;
        g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
        g.globalAlpha = 1; g.fillStyle = K.bg; g.fillRect(0, 0, w, h);

        // camera: a slow sway while you wait, then a push in on you after the press
        const push = T < 0 ? 0 : easeInOut(seg(T, 1250, 1750));
        const z = 1 + push * 1.7;
        const sx = reduced ? 0 : Math.sin(tau * 0.0004) * 3 * s * (1 - push), sy = reduced ? 0 : Math.cos(tau * 0.00031) * 2 * s * (1 - push);
        g.setTransform(L.dpr * z, 0, 0, L.dpr * z, L.dpr * (you.x - you.x * z + sx), L.dpr * (you.y - you.y * z + sy));

        const reveal = easeOut(seg(tau, 0, 1100)) * room.rmax;
        g.save(); g.beginPath(); g.arc(door.x, door.y, Math.max(0.1, reveal), 0, Math.PI * 2); g.clip();
        g.drawImage(floor.canvas, 0, 0, w, h); g.restore();
        if (tau < 1300) lightRing(g, floor, door.x, door.y, reveal, 26 * s, K.mint, 0.35 * (1 - seg(tau, 900, 1300)));
        if (T < 0 && !reduced && tau > 1400) {
          const cyc = (tau - 1400) % 4200;
          if (cyc < 2400) lightRing(g, floor, door.x, door.y, easeOut(cyc / 2400) * room.rmax, 22 * s, K.grey, 0.45 * (1 - cyc / 2400));
        }

        // the room, drawn as one line from the door round to the door, with door posts and the Entrance reader
        const outline = easeInOut(seg(tau, 150, 900));
        hairline(g, K.grey, 0.7);
        const per = 2 * (box.x2 - box.x) + 2 * (box.y2 - box.y);
        g.setLineDash([per * outline, per]);
        g.beginPath();
        g.moveTo(door.x - door.half, box.y2); g.lineTo(box.x, box.y2); g.lineTo(box.x, box.y); g.lineTo(box.x2, box.y);
        g.lineTo(box.x2, box.y2); g.lineTo(door.x + door.half, box.y2); g.stroke();
        g.setLineDash([]);
        line(g, door.x - door.half, box.y2, door.x - door.half, box.y2 + 6 * s, outline, K.grey, 0.7);
        line(g, door.x + door.half, box.y2, door.x + door.half, box.y2 + 6 * s, outline, K.grey, 0.7);
        const stX = door.x + door.half + 14 * s, stY = box.y2 + 8 * s;
        if (outline > 0.9 && T < 0) {
          let flash = 0;
          for (const tt of room.taps) flash = Math.max(flash, 1 - seg(tau, tt, tt + 450));
          station(g, stX, stY, 8 * s, K.grey, flash, K.mint);
          g.font = `500 ${Math.round(8 * s + 1)}px ${MONO}`; g.textAlign = "left"; g.fillStyle = K.dim; g.globalAlpha = 0.9;
          g.fillText("ENTRANCE", stX + 8 * s, stY + 3 * s); g.globalAlpha = 1;
          for (const tt of room.taps) { const k = seg(tau, tt, tt + 600); if (k > 0 && k < 1) ring(g, stX, stY, 5 * s + easeOut(k) * 22 * s, K.mint, 0.8 * (1 - k)); }
        }

        // tables
        tables.forEach((tb, ti) => {
          const k = easeInOut(seg(tau, 300 + ti * 110, 900 + ti * 110));
          if (k <= 0) return;
          const meet = pick.find((q) => q.table === ti);
          const lit = T >= 0 && meet ? easeOut(seg(T, meet.tPass, meet.tPass + 260)) : 0;
          const lock = T >= 0 && tb.needs ? easeBack(seg(T, 1000, 1300)) : 0;
          let knock = 0;                       // the ripple knocks each table as it passes
          if (T >= 0) for (const r0 of [260, 430, 600]) {
            const rr = 12 * s + easeOut(seg(T, r0, r0 + 1000)) * room.rmax;
            knock = Math.max(knock, bump(1 - Math.abs(rr - tb.d) / (34 * s)) * (1 - seg(T, r0, r0 + 1000)));
          }
          const r = tb.r + knock * 4 * s;
          const a0 = -Math.PI / 2 + ti;
          hairline(g, K.mint, 0.4 + 0.5 * Math.max(lit, lock), lock > 0 ? 1.5 : 1);
          g.beginPath(); g.arc(tb.x, tb.y, r, a0, a0 + k * Math.PI * 2); g.stroke();
          hairline(g, K.mint, (0.25 + 0.3 * lock) * k);
          g.setLineDash([2, 5]); g.lineDashOffset = -tau * (0.012 + 0.05 * lock);
          g.beginPath(); g.arc(tb.x, tb.y, r + 6 * s + lock * 3 * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
          for (let q = 0; q < 4; q++) {
            const a = q * Math.PI / 2 + tau * 0.0003 * (ti % 2 ? 1 : -1);
            const r1 = r + 10 * s, r2 = r1 + 4 * s;
            line(g, tb.x + Math.cos(a) * r1, tb.y + Math.sin(a) * r1, tb.x + Math.cos(a) * r2, tb.y + Math.sin(a) * r2, k, K.mint, 0.5);
          }
          if (lock > 0) {
            g.font = `500 ${Math.round(9 * s + 2)}px ${MONO}`; g.textAlign = "center"; g.fillStyle = K.mint; g.globalAlpha = 1;
            g.fillText(typed("NEEDS YOU", seg(T, 1050, 1300)), tb.x, tb.y + tb.r + 24 * s);
          }
        });

        // idle life: links flicker, people tap in and walk to a seat
        if (T < 0 && !reduced) {
          if (tau > nextFlick) { spawnFlicker(tau); nextFlick = tau + 600 + Math.random() * 700; }
          if (tau > nextArrive) { spawnArrival(tau); nextArrive = tau + 1500 + Math.random() * 1200; }
        }
        for (let i = flick.length - 1; i >= 0; i--) {
          const f = flick[i], u = tau - f.t0;
          if (u > 1500) { flick.splice(i, 1); continue; }
          const a = pos(f.a, tau), b = pos(f.b, tau);
          line(g, a.x, a.y, b.x, b.y, easeOut(seg(u, 0, 350)), K.mint, 0.5 * (1 - seg(u, 1000, 1500)));
        }
        for (const p of room.walkers) {
          if (tau < p.t0 || tau > p.t1 + 600) continue;
          const k = easeOut(seg(tau, p.t0, p.t1));
          if (k < 1) trail(g, p, k, K.walker, 0.6);
          const pk = seg(tau, p.t1, p.t1 + 550);
          if (pk > 0 && pk < 1) {
            ring(g, p.x, p.y, 3 * s + easeOut(pk) * 14 * s, K.mint, 0.8 * (1 - pk));
            lightRing(g, floor, p.x, p.y, 3 * s + easeOut(pk) * 22 * s, 8 * s, K.mint, 0.5 * (1 - pk));
          }
        }

        // ripples from you
        if (T >= 0) {
          for (const r0 of [260, 430, 600]) {
            const k = seg(T, r0, r0 + 1000);
            if (k <= 0 || k >= 1) continue;
            const r = 12 * s + easeOut(k) * room.rmax;
            ring(g, you.x, you.y, r, K.you, 0.85 * (1 - k));
            lightRing(g, floor, you.x, you.y, r, 16 * s, K.you, 0.75 * (1 - k));
          }
          pick.forEach((p, i) => {
            const q = pos(p, tau);
            line(g, q.x, q.y, you.x, you.y, easeOut(seg(T, p.tPass, p.tPass + 320)), K.mint, 0.95);
            const pk = seg(T, p.tPass, p.tPass + 550);
            if (pk > 0 && pk < 1) ring(g, q.x, q.y, 4 * s + pk * 16 * s, K.mint, 0.9 * (1 - pk));
            const nk = seg(T, p.tPass + 80, p.tPass + 700);           // +1, +2, +3 rising off you
            if (nk > 0 && nk < 1) {
              g.font = `600 ${Math.round(10 * s + 2)}px ${MONO}`; g.textAlign = "left"; g.fillStyle = K.mint; g.globalAlpha = 1 - nk;
              g.fillText("+" + (i + 1), you.x + 16 * s, you.y - 8 * s - easeOut(nk) * 18 * s); g.globalAlpha = 1;
            }
          });
        }

        // people
        people.forEach((p, i) => {
          const k = p.t0 != null ? (tau >= p.t0 ? 1 : 0) : easeBack(seg(tau, 500 + i * 45, 850 + i * 45));
          if (k <= 0) return;
          const q = pos(p, tau), r = 3.2 * s * k;
          const m = p.meet && T >= 0 ? seg(T, p.tPass, p.tPass + 160) : 0;
          const settled = p.t1 != null ? seg(tau, p.t1, p.t1 + 200) : 1;
          dot(g, q.x, q.y, r, p.t1 != null && settled < 1 ? K.walker : K.grey, 1 - m);
          if (m > 0) dot(g, q.x, q.y, r + 0.8 * s * m, K.mint, m);
        });

        // you: the raspberry button folds into a square and walks in through the door
        if (T >= 0 && btnRect) {
          const fold = easeInOut(seg(T, 0, 320));
          const bw = lerp(btnRect.w, 11 * s, fold), bh = lerp(btnRect.h, 11 * s, fold);
          const cx = lerp(btnRect.x + btnRect.w / 2, you.x, easeInOut(seg(T, 60, 320)));
          const cy = lerp(btnRect.y + btnRect.h / 2, you.y, easeInOut(seg(T, 60, 320)));
          if (T < 320) { g.globalAlpha = 1; g.fillStyle = K.you; g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh); }
          else {
            const k = easeBack(seg(T, 320, 540));
            dot(g, you.x, you.y, 5.5 * s, K.you, 1);
            ring(g, you.x, you.y, 11 * s * k, K.you, 1, 1.5);
            g.font = `500 ${Math.round(9 * s + 2)}px ${MONO}`; g.textAlign = "center"; g.fillStyle = K.you; g.globalAlpha = 1;
            g.fillText(typed("YOU", seg(T, 380, 540)), you.x, you.y + 26 * s);
          }
        }
        g.globalAlpha = 1;

        // the button's tap pulse, before the press
        if (T < 0 && btnRect && !reduced && tau > 1500) {
          g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
          for (const off of [0, 300]) {
            const cyc = ((tau - 1500 - off) % 2600) / 1100;
            if (cyc < 0 || cyc >= 1) continue;
            const e = easeOut(cyc) * 12;
            hairline(g, K.you, 0.75 * (1 - cyc));
            g.strokeRect(btnRect.x - e, btnRect.y - e, btnRect.w + 2 * e, btnRect.h + 2 * e);
          }
        }

        if (stats && stats.here && T < 0) {
          if (!statsEl._t0) statsEl._t0 = tau;
          const k = easeOut(seg(tau, statsEl._t0, statsEl._t0 + 900));
          statsEl.textContent = `${Math.round(stats.here * k)} HERE NOW · ${Math.round(stats.tables.length * k)} TABLES` +
            (stats.needs ? ` · ${Math.round(stats.needs * k)} NEED HELP` : "");
        }
        if (T >= 0) readout.textContent = typed("3 PEOPLE YOU'LL MEET · 1 TABLE NEEDS YOU", seg(T, 1000, 1400));
      }

      const onResize = () => { L.resize(); layout(); };
      global.addEventListener("resize", onResize);
      setTimeout(() => { if (!done && pressAt < 0) { layout(); } }, reduced ? 0 : 1600);   // fonts in, button risen

      function finish(tag) {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf); stopSkip(); global.removeEventListener("resize", onResize);
        L.root.remove();
        resolve(tag || "done");
      }
      const END = 1850;
      (function frame() {
        if (done) return;
        draw();
        if (pressAt >= 0) {
          const T = now() - pressAt;
          room.pick.forEach((p, i) => { if (T >= p.tPass && !plucked.has(i)) { plucked.add(i); if (soundOn) Audio.pluck(i * 2 + 2); } });
          const k = easeInOut(seg(T, 1450, END));
          L.root.style.transform = k > 0 ? `translate3d(0,${-k * 100}%,0)` : "";
          if (T >= END) return finish("done");
        }
        if (!reduced || pressAt < 0) raf = requestAnimationFrame(frame);
      })();

      btn.addEventListener("click", () => {
        if (pressAt >= 0) return;
        try { sessionStorage.setItem(SIGNIN_KEY, "1"); } catch (e) { /* ignore */ }
        btn.disabled = true;
        if (reduced) {
          L.root.style.transition = "opacity 300ms linear"; L.root.style.opacity = "0";
          setTimeout(() => finish("reduced"), 320);
          return;
        }
        measureButton();
        pressAt = now();
        btn.style.visibility = "hidden";
        head.style.transition = "opacity 260ms linear"; head.style.opacity = "0.25";
        if (soundOn) { Audio.unlock(); Audio.bell(); }
        setTimeout(() => { stopSkip = onSkip(() => finish("skipped")); }, 0);
      });
    });
  }

  // =================================================================================================================
  // 2. Map opening: "the room fills up"
  //    In the wall's current theme. The floor lights up from the door; the room, the Entrance reader and the
  //    tables draw in with typed labels; every arrival is a tap (the reader flashes and rings) and a walk with a
  //    trail and a ping; each group wires up with a rising run and locks; links reach across tables; the big
  //    "here now" number counts what actually happened; then the plan tilts back into the 3D map and hands over.
  // =================================================================================================================
  let mapPlayed = false;

  function map(container, opts) {
    opts = opts || {};
    if (mapPlayed) return Promise.resolve("already-played");
    mapPlayed = true;
    const reduced = prefersReduced(opts);
    const S = typeof Sound !== "undefined" ? Sound : global.Sound;
    const quiet = !!opts.quiet || !!(S && S.muted);
    const soundOn = opts.sound !== false && !quiet && !reduced;
    const K = wallPalette(opts);

    return new Promise((resolve) => {
      const L = makeLayer(container, opts.zIndex, K.bg);
      const { g } = L;
      let done = false, raf = 0, stopSkip = () => {};
      function finish(tag, fade) {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf); stopSkip();
        const ms = fade == null ? 0 : fade;
        if (ms) { L.root.style.transition = `opacity ${ms}ms linear`; L.root.style.opacity = "0"; }
        setTimeout(() => { L.root.remove(); resolve(tag); }, ms + 20);
      }
      if (reduced) { requestAnimationFrame(() => finish("reduced", 300)); return; }
      stopSkip = onSkip(() => finish("skipped", 150));
      if (soundOn) Audio.unlock();

      readGraph(opts.graphUrl === undefined ? "/api/graph" : opts.graphUrl).then((data) => {
        if (done) return;
        let spec = countRoom(data);
        if (!spec || (!spec.tables.length && !spec.solos)) spec = { tables: [4, 3, 3, 2, 2], solos: 4, generic: true };
        if (soundOn) Audio.warm(["pluckC4", "pluckD4", "pluckE4", "pluckG4", "pluckA4", "pluckC5", "pluckD5", "pluckE5"]);
        const P = plan(spec, L.w, L.h);
        P.K = K;
        P.floor = makeFloor(L.w, L.h, L.dpr, Math.max(12, Math.round(18 * P.s)), Math.max(1.5, 1.6 * P.s), K.floor);
        L.root.style.transformOrigin = "50% 70%";
        const t0 = now(), belled = new Set(), ran = new Set(), crossed = new Set();
        let lastBell = -1e9, bells = 0;
        (function frame() {
          if (done) return;
          const t = now() - t0;
          drawMap(g, L, P, t);
          for (const p of P.people) {
            if (t >= p.t1 && !belled.has(p)) {
              belled.add(p);
              if (soundOn && t - lastBell > 140 && bells < 12) { Audio.bell(); lastBell = t; bells++; }
            }
          }
          for (const tb of P.tables) {
            if (t >= tb.tLines && !ran.has(tb) && tb.pairs.length) { ran.add(tb); if (soundOn) Audio.run(tb.pairs.length, 0.08); }
          }
          P.cross.forEach((c, i) => { if (t >= c.t0 && !crossed.has(c)) { crossed.add(c); if (soundOn) Audio.pluck(7 - (i % 4)); } });
          if (t >= P.tFade) {      // tilt back into the 3D map and hand over
            const k = easeInOut(seg(t, P.tFade, P.tEnd));
            L.root.style.transform = `perspective(1400px) rotateX(${k * 34}deg) scale(${1 - k * 0.05})`;
            L.root.style.opacity = String(1 - easeOut(seg(t, P.tFade + 120, P.tEnd)));
            if (t >= P.tEnd) return finish("done", 0);
          }
          raf = requestAnimationFrame(frame);
        })();
      });
    });
  }

  function plan(spec, w, h) {
    const s = Math.min(w / 1600, h / 900) * 1.15;
    const n = spec.tables.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.8))), rows = Math.max(1, Math.ceil(n / cols));
    const area = { x: w * 0.12, y: h * 0.18, w: w * 0.62, h: h * 0.56 };
    const door = { x: w * 0.43, y: h * 0.9, half: 28 * s };
    const people = [];
    const tables = spec.tables.map((size, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const inRow = Math.min(cols, n - r * cols);
      const x = area.x + area.w * ((c + 0.5 + (cols - inRow) / 2) / cols);
      const y = area.y + area.h * ((r + 0.5) / rows);
      const rad = (30 + 5 * size) * s;
      const tb = { x, y, r: rad, label: "TABLE " + String(i + 1).padStart(2, "0"), tDraw: 250 + i * 130, seats: [], pairs: [], spin: i % 2 ? 1 : -1 };
      for (let k = 0; k < size; k++) {
        const a = -Math.PI / 2 + (k / size) * Math.PI * 2 + i * 0.5;
        const seat = { x: x + Math.cos(a) * (rad + 14 * s), y: y + Math.sin(a) * (rad + 14 * s), table: tb };
        tb.seats.push(seat); people.push(seat);
      }
      return tb;
    });
    for (let k = 0; k < spec.solos; k++) {
      const side = k % 2 ? 1 : -1, j = Math.floor(k / 2);
      people.push({ x: door.x + side * (w * 0.1 + j * 44 * s), y: h * 0.8, table: null });
    }
    const start = 600, span = Math.min(1500, people.length * 90), stagger = people.length > 1 ? span / (people.length - 1) : 0;
    const order = people.map((p, i) => i).sort((a, b) => (people[a].y - people[b].y) || (people[a].x - people[b].x));
    order.forEach((idx, k) => {
      const p = people[idx];
      p.tap = start + k * stagger; p.t0 = p.tap + 120; p.t1 = p.t0 + 650;
      p.sx = door.x; p.sy = door.y + 10 * s;
      p.cx = (door.x + p.x) / 2 + (p.x < door.x ? -1 : 1) * 60 * s;
      p.cy = (door.y + p.y) / 2 + 40 * s;
    });
    let last = 0, links = 0;
    for (const tb of tables) {
      tb.tLines = Math.max(...tb.seats.map((p) => p.t1)) + 60;
      for (let a = 0; a < tb.seats.length; a++) for (let b = a + 1; b < tb.seats.length; b++) tb.pairs.push([tb.seats[a], tb.seats[b]]);
      tb.pairs = tb.pairs.slice(0, 8);
      tb.tLock = tb.tLines + tb.pairs.length * 80 + 120;
      links += tb.pairs.length;
      last = Math.max(last, tb.tLock + 200);
    }
    // links that reach across tables: people who already know each other
    const cross = [];
    for (let i = 0; i + 1 < tables.length && cross.length < 5; i++) {
      const a = tables[i].seats[tables[i].seats.length - 1], b = tables[i + 1].seats[0];
      if (a && b) cross.push({ a, b, bend: (i % 2 ? 1 : -1) * 0.22, t0: last + i * 110 });
    }
    if (cross.length) last = Math.max(last, cross[cross.length - 1].t0 + 380);
    last = Math.max(last, ...people.map((p) => p.t1));
    const tFade = Math.min(Math.max(last + 150, 3000), 3500);
    return { s, door, tables, people, links: links + cross.length, cross, spec, tFade, tEnd: tFade + 650 };
  }

  function drawMap(g, L, P, t) {
    const { s, door, tables, people, floor, K } = P;
    const w = L.w, h = L.h, diag = Math.hypot(w, h);
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    g.globalAlpha = 1; g.fillStyle = K.bg; g.fillRect(0, 0, w, h);
    const z = 1.07 - 0.07 * easeOut(seg(t, 0, P.tFade));
    const cx = w * 0.43, cy = h * 0.55;
    g.setTransform(L.dpr * z, 0, 0, L.dpr * z, L.dpr * (cx - cx * z), L.dpr * (cy - cy * z));

    const reveal = easeOut(seg(t, 0, 900)) * diag;
    g.save(); g.beginPath(); g.arc(door.x, door.y, Math.max(0.1, reveal), 0, Math.PI * 2); g.clip();
    g.drawImage(floor.canvas, 0, 0, w, h); g.restore();
    lightRing(g, floor, door.x, door.y, reveal, 40 * s, K.lit, 0.45 * (1 - seg(t, 600, 1100)));

    const bx = w * 0.05, by = h * 0.08, bx2 = w * 0.81;
    const per = 2 * (bx2 - bx) + 2 * (door.y - by);
    hairline(g, K.outline, 0.9);
    g.setLineDash([per * easeInOut(seg(t, 80, 900)), per]);
    g.beginPath();
    g.moveTo(door.x - door.half, door.y); g.lineTo(bx, door.y); g.lineTo(bx, by); g.lineTo(bx2, by);
    g.lineTo(bx2, door.y); g.lineTo(door.x + door.half, door.y); g.stroke(); g.setLineDash([]);
    const cm = easeOut(seg(t, 700, 1000)) * 14 * s;
    hairline(g, K.dim, 0.8);
    for (const [x, y, dx, dy] of [[bx, by, 1, 1], [bx2, by, -1, 1], [bx, door.y, 1, -1], [bx2, door.y, -1, -1]]) {
      g.beginPath(); g.moveTo(x - dx * 6 * s, y); g.lineTo(x + dx * cm, y); g.moveTo(x, y - dy * 6 * s); g.lineTo(x, y + dy * cm); g.stroke();
    }

    // the Entrance reader: flashes and rings on every tap
    const stX = door.x + door.half + 22 * s, stY = door.y + 14 * s;
    const fs = Math.max(11, 13 * s);
    if (t > 400) {
      let flash = 0;
      for (const p of people) flash = Math.max(flash, bump(seg(t, p.tap, p.tap + 260)));
      station(g, stX, stY, 12 * s, K.dim, flash, K.accent);
      g.font = `500 ${fs * 0.85}px ${K.mono}`; g.textAlign = "left"; g.fillStyle = K.dim; g.globalAlpha = seg(t, 400, 700);
      g.fillText(typed("ENTRANCE", seg(t, 420, 800)), stX + 12 * s, stY + fs * 0.3); g.globalAlpha = 1;
      for (const p of people) { const k = seg(t, p.tap, p.tap + 520); if (k > 0 && k < 1) ring(g, stX, stY, 7 * s + easeOut(k) * 30 * s, K.accent, 0.7 * (1 - k)); }
    }

    g.font = `500 ${fs}px ${K.mono}`; g.textBaseline = "alphabetic";
    let linksNow = 0;
    for (const tb of tables) {
      const k = easeInOut(seg(t, tb.tDraw, tb.tDraw + 520));
      if (k <= 0) continue;
      const lock = easeBack(seg(t, tb.tLock, tb.tLock + 320));
      const a0 = -Math.PI / 2;
      hairline(g, K.table, 0.95, 1 + 0.6 * lock);
      g.beginPath(); g.arc(tb.x, tb.y, tb.r, a0, a0 + k * Math.PI * 2); g.stroke();
      hairline(g, K.table, 0.4 * k);
      g.setLineDash([2 * s, 6 * s]); g.lineDashOffset = tb.spin * t * 0.02;
      g.beginPath(); g.arc(tb.x, tb.y, tb.r + 7 * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      for (let q = 0; q < 4; q++) {
        const a = q * Math.PI / 2 + tb.spin * (1 - k) * 1.2;
        const r1 = tb.r - 5 * s, r2 = tb.r + 3 * s;
        line(g, tb.x + Math.cos(a) * r1, tb.y + Math.sin(a) * r1, tb.x + Math.cos(a) * r2, tb.y + Math.sin(a) * r2, k, K.table, 0.9);
      }
      const lk = seg(t, tb.tLock, tb.tLock + 600);
      if (lk > 0 && lk < 1) ring(g, tb.x, tb.y, tb.r + 7 * s + easeOut(lk) * 26 * s, K.table, 0.85 * (1 - lk));
      const tk = seg(t, tb.tDraw + 300, tb.tDraw + 300 + tb.label.length * 35);
      if (tk > 0) {
        const txt = typed(tb.label, tk), ly = tb.y - tb.r - 26 * s;
        g.textAlign = "left"; g.globalAlpha = 1; g.fillStyle = K.text;
        const full = g.measureText(tb.label).width, x0 = tb.x - full / 2;
        g.fillText(txt, x0, ly);
        if (tk < 1 || (Math.floor(t / 180) % 2 === 0 && t < tb.tDraw + 1200)) {
          g.fillStyle = K.table; g.fillRect(x0 + g.measureText(txt).width + 2, ly - fs * 0.8, fs * 0.55, fs * 0.95);
        }
        if (lock > 0) {
          g.textAlign = "center"; g.fillStyle = K.dim; g.globalAlpha = lock;
          g.fillText(String(tb.seats.length).padStart(2, "0"), tb.x, tb.y + fs * 0.35);
        }
      }
      tb.pairs.forEach(([a, b], i) => {
        const q = easeOut(seg(t, tb.tLines + i * 80, tb.tLines + i * 80 + 240));
        if (q >= 1) linksNow++;
        line(g, a.x, a.y, b.x, b.y, q, K.table, 0.85);
      });
    }
    for (const c of P.cross) {
      const q = easeOut(seg(t, c.t0, c.t0 + 380));
      if (q >= 1) linksNow++;
      g.setLineDash([4 * s, 4 * s]);
      curve(g, c.a.x, c.a.y, c.b.x, c.b.y, c.bend, q, K.link, 0.95);
      g.setLineDash([]);
    }

    let hereNow = 0;
    for (const p of people) {
      if (t < p.t0) continue;
      const k = easeOut(seg(t, p.t0, p.t1));
      const at = walkAt(p, k);
      if (k < 1) trail(g, p, k, K.dim, 0.7); else hereNow++;
      const settled = seg(t, p.t1, p.t1 + 200);
      const r = 4.2 * s;
      dot(g, at.x, at.y, r, p.table ? K.person : K.solo, 1);
      if (p.table && settled > 0) ring(g, at.x, at.y, r + 2.5 * s, K.table, settled * 0.9);
      const pk = seg(t, p.t1, p.t1 + 520);
      if (pk > 0 && pk < 1) {
        ring(g, at.x, at.y, r + easeOut(pk) * 18 * s, p.table ? K.table : K.solo, 0.85 * (1 - pk));
        lightRing(g, floor, at.x, at.y, r + easeOut(pk) * 30 * s, 10 * s, K.lit, 0.55 * (1 - pk));
      }
    }

    // the wall's big "here now" number, top right, counting what actually walked in
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    const hk = seg(t, 200, 600), rx = w * 0.95;
    g.globalAlpha = hk; g.textAlign = "right";
    g.fillStyle = K.text; g.font = `600 ${Math.max(30, 52 * s)}px ${K.mono}`;
    g.fillText(String(hereNow), rx, h * 0.13);
    g.fillStyle = K.dim; g.font = `400 ${Math.max(13, 17 * s)}px ${K.sans}`;
    g.fillText("here now", rx, h * 0.13 + Math.max(18, 24 * s));
    const tablesNow = tables.filter((tb) => t >= tb.tDraw + 300).length;
    g.font = `500 ${Math.max(11, 13 * s)}px ${K.mono}`;
    const rows = [["TABLES", tablesNow], ["LINKS", linksNow], ["TAPS", people.filter((p) => t >= p.tap).length]];
    rows.forEach(([label, v], i) => {
      const y = h * 0.27 + i * Math.max(22, 30 * s);
      g.fillStyle = K.dim; g.textAlign = "left"; g.fillText(label, w * 0.85, y);
      g.fillStyle = K.text; g.textAlign = "right"; g.fillText(String(v).padStart(2, "0"), rx, y);
      hairline(g, K.outline, 0.8 * hk); g.beginPath(); g.moveTo(w * 0.85, y + 9 * s); g.lineTo(rx, y + 9 * s); g.stroke();
    });
    g.textAlign = "left"; g.fillStyle = K.dim; g.font = `500 ${Math.max(11, 12 * s)}px ${K.mono}`;
    g.fillText(typed(P.spec.generic ? "TAP IN · ROOM" : "TAP IN · LIVE ROOM", seg(t, 150, 650)), w * 0.05, h * 0.965);
    g.globalAlpha = 1;
  }

  global.TapInIntro = {
    signIn,
    map,
    // Demo-page helpers, not for production pages.
    _reset() { mapPlayed = false; try { sessionStorage.removeItem(SIGNIN_KEY); } catch (e) { /* ignore */ } },
  };
})(window);
