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

  // ---- look: the wall's v5 palette ----------------------------------------------------------------------------
  const C = {
    bg: "#121212", you: "#B0446E", mint: "#7FE0BD", grey: "#5F5F5F", greyDim: "#2E2E2E",
    walker: "#A8A8A8", text: "#EDEDED", textDim: "#9A9A9A",
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
  function makeLayer(container, z) {
    if (global.getComputedStyle(container).position === "static" && container !== document.body) container.style.position = "relative";
    const root = document.createElement("div");
    root.className = "tapin-intro";
    root.style.cssText = `position:${container === document.body ? "fixed" : "absolute"};inset:0;overflow:hidden;` +
      `background:${C.bg};z-index:${z || 50};font-family:${SANS};color:${C.text};touch-action:manipulation;`;
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
  function typed(text, k) { return text.slice(0, Math.floor(clamp(k) * text.length)); }

  // CSS for the DOM text: masked word reveals and a drawn underline. Injected once.
  function ensureCss() {
    if (document.getElementById("tapin-intro-css")) return;
    const st = document.createElement("style");
    st.id = "tapin-intro-css";
    st.textContent =
      ".tapin-intro .ti-m{display:inline-block;overflow:hidden;vertical-align:bottom;padding-bottom:.08em}" +
      ".tapin-intro .ti-w{display:inline-block;transform:translateY(110%);animation:ti-up 620ms cubic-bezier(.2,.8,.2,1) forwards}" +
      ".tapin-intro .ti-u{height:1px;transform:scaleX(0);transform-origin:left;animation:ti-x 700ms cubic-bezier(.6,0,.2,1) forwards}" +
      ".tapin-intro .ti-f{opacity:0;transform:translateY(14px);animation:ti-in 600ms cubic-bezier(.2,.8,.2,1) forwards}" +
      "@keyframes ti-up{to{transform:none}}@keyframes ti-x{to{transform:none}}@keyframes ti-in{to{opacity:1;transform:none}}" +
      ".tapin-intro.ti-still *{animation:none!important;transform:none!important;opacity:1!important}";
    document.head.appendChild(st);
  }
  // Wrap each word (or letter) in a mask so it rises into place, staggered.
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
  //    Alive before you touch it (pixel floor breathing from the door, tables turning, people drifting, links
  //    flickering, the button sending out a tap pulse). On the press, the button folds into you and walks in
  //    through the door; three ripples light the floor; three people turn mint and line up to you; the table that
  //    needs you locks on and says so; the camera pushes in on you and the screen lifts away to the form.
  // =================================================================================================================
  const SIGNIN_KEY = "tapin.intro.signin.v1";

  function signIn(container, opts) {
    opts = opts || {};
    try { if (sessionStorage.getItem(SIGNIN_KEY)) return Promise.resolve("already-played"); } catch (e) { /* private mode */ }
    const reduced = prefersReduced(opts);
    const soundOn = opts.sound !== false && !opts.quiet && !reduced;
    ensureCss();

    return new Promise((resolve) => {
      const L = makeLayer(container, opts.zIndex);
      const { g } = L;
      if (reduced) L.root.classList.add("ti-still");

      const ui = document.createElement("div");
      ui.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;" +
        "justify-content:space-between;padding:9vh 24px 6vh;box-sizing:border-box;pointer-events:none;text-align:center;";
      ui.innerHTML =
        `<div>` +
        `<div style="display:inline-block"><div aria-label="Tap In" style="font:600 15px ${MONO};letter-spacing:.42em;margin-right:-.42em;color:${C.text}">` +
        maskWords("TAP IN", 80, 55, true) + `</div>` +
        `<div class="ti-u" style="background:${C.you};margin-top:8px;animation-delay:420ms"></div></div>` +
        `<h1 style="margin:18px 0 0;font:500 22px/1.3 ${SANS};letter-spacing:normal;text-transform:none;color:${C.text}">` +
        maskWords("Tap in.", 380, 70) + `<br>` + maskWords("Find the table that needs you.", 520, 55) + `</h1>` +
        `<div data-stats class="ti-f" style="margin-top:14px;font:500 12px ${MONO};letter-spacing:.08em;color:${C.textDim};animation-delay:900ms;min-height:1em"></div>` +
        `</div>` +
        `<button type="button" class="ti-f" style="animation-delay:1000ms;pointer-events:auto;min-height:52px;width:min(320px,100%);` +
        `border:1px solid ${C.mint};border-radius:0;background:${C.mint};color:${C.bg};font:600 17px ${SANS};` +
        `letter-spacing:.02em;cursor:pointer">Tap in</button>`;
      L.root.appendChild(ui);
      const btn = ui.querySelector("button"), statsEl = ui.querySelector("[data-stats]");

      // Live counts under the line, ticking up, when the server answers. Hidden otherwise.
      let stats = null;
      readGraph(opts.graphUrl === undefined ? "/api/graph" : opts.graphUrl).then((d) => { stats = countRoom(d); });

      let room, floor;
      function layout() {
        const w = L.w, h = L.h, s = Math.min(w / 390, h / 760);
        const box = { x: w * 0.07, y: h * 0.34, x2: w * 0.93, y2: h * 0.75 };
        const door = { x: w * 0.5, y: box.y2, half: 16 * s };
        const tables = [
          { x: w * 0.26, y: h * 0.43, r: 24 * s, n: 3 }, { x: w * 0.73, y: h * 0.42, r: 28 * s, n: 4 },
          { x: w * 0.36, y: h * 0.63, r: 20 * s, n: 2 }, { x: w * 0.72, y: h * 0.63, r: 22 * s, n: 3, needs: true },
        ];
        const people = [];
        tables.forEach((t, ti) => {
          for (let i = 0; i < t.n; i++) {
            const a = -Math.PI / 2 + (i / t.n) * Math.PI * 2 + ti * 0.7;
            people.push({ bx: t.x + Math.cos(a) * (t.r + 9 * s), by: t.y + Math.sin(a) * (t.r + 9 * s), table: ti, ph: Math.random() * 6.28 });
          }
        });
        [[0.15, 0.53], [0.5, 0.52], [0.88, 0.53], [0.17, 0.7]].forEach(([fx, fy]) =>
          people.push({ bx: w * fx, by: h * fy, table: -1, ph: Math.random() * 6.28 }));
        const you = { x: door.x, y: door.y - 24 * s };
        // The people you'll meet: one from each of three tables, nearest first, so the ripple reaches them in order.
        const pick = [0, 1, 3].map((ti) => people.filter((p) => p.table === ti)
          .sort((a, b) => Math.hypot(a.bx - you.x, a.by - you.y) - Math.hypot(b.bx - you.x, b.by - you.y))[0]);
        pick.forEach((p) => { p.d = Math.hypot(p.bx - you.x, p.by - you.y); p.meet = true; });
        pick.sort((a, b) => a.d - b.d);
        const pitch = Math.max(10, Math.round(13 * s));
        floor = makeFloor(w, h, L.dpr, pitch, 1.5, "#242424");
        room = { s, box, door, tables, people, you, pick, rmax: Math.hypot(w, h) * 0.75 };
        room.pick.forEach((p) => { p.tPass = 300 + 1150 * (p.d / room.rmax) * 1.35; });
      }
      layout();

      // Idle links that flicker on and off between people at the same table.
      const flick = [];
      function spawnFlicker(tau) {
        const ti = Math.floor(Math.random() * room.tables.length);
        const at = room.people.filter((p) => p.table === ti);
        if (at.length < 2) return;
        const a = at[Math.floor(Math.random() * at.length)];
        let b = a; while (b === a) b = at[Math.floor(Math.random() * at.length)];
        flick.push({ a, b, t0: tau });
      }

      const born = now();
      let pressAt = -1, raf = 0, done = false, stopSkip = () => {}, nextFlick = 900, btnRect = null;
      const plucked = new Set();

      function pos(p, tau) {           // a slow drift around each seat
        const k = tau * 0.0011 + p.ph;
        return { x: p.bx + Math.cos(k) * 1.6 * room.s, y: p.by + Math.sin(k * 1.3) * 1.6 * room.s };
      }

      function draw() {
        const tau = reduced ? 3000 : now() - born;       // time on the landing
        const T = pressAt < 0 ? -1 : now() - pressAt;    // time since the press
        const { s, box, door, tables, people, you, pick } = room;
        const w = L.w, h = L.h;
        g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
        g.globalAlpha = 1; g.fillStyle = C.bg; g.fillRect(0, 0, w, h);

        // camera: after the press it pushes in on you
        const push = T < 0 ? 0 : easeInOut(seg(T, 1150, 1650));
        const z = 1 + push * 1.6;
        g.setTransform(L.dpr * z, 0, 0, L.dpr * z, L.dpr * (you.x - you.x * z), L.dpr * (you.y - you.y * z));

        // the floor, revealed from the door outward on load
        const reveal = easeOut(seg(tau, 0, 1100)) * room.rmax;
        g.save(); g.beginPath(); g.arc(door.x, door.y, Math.max(0.1, reveal), 0, Math.PI * 2); g.clip();
        g.drawImage(floor.canvas, 0, 0, w, h); g.restore();
        if (tau < 1300) lightRing(g, floor, door.x, door.y, reveal, 26 * s, C.mint, 0.35 * (1 - seg(tau, 900, 1300)));
        // a slow breath from the door every few seconds, so the room never sits still
        if (T < 0 && !reduced) {
          const cyc = (tau - 1400) % 3600;
          if (tau > 1400 && cyc < 2200) lightRing(g, floor, door.x, door.y, easeOut(cyc / 2200) * room.rmax, 22 * s, "#5F5F5F", 0.5 * (1 - cyc / 2200));
        }

        // room outline, drawn in on load
        const outline = easeInOut(seg(tau, 150, 900));
        hairline(g, C.grey, 0.6);
        const per = 2 * (box.x2 - box.x) + 2 * (box.y2 - box.y);
        g.setLineDash([per * outline, per]);
        g.beginPath();
        g.moveTo(door.x - door.half, box.y2); g.lineTo(box.x, box.y2); g.lineTo(box.x, box.y); g.lineTo(box.x2, box.y);
        g.lineTo(box.x2, box.y2); g.lineTo(door.x + door.half, box.y2); g.stroke();
        g.setLineDash([]);
        // door posts
        line(g, door.x - door.half, box.y2, door.x - door.half, box.y2 + 6 * s, outline, C.grey, 0.6);
        line(g, door.x + door.half, box.y2, door.x + door.half, box.y2 + 6 * s, outline, C.grey, 0.6);

        // tables: an arc that draws itself, a dashed outer ring that turns, four ticks
        tables.forEach((tb, ti) => {
          const k = easeInOut(seg(tau, 300 + ti * 110, 900 + ti * 110));
          if (k <= 0) return;
          const meet = pick.find((q) => q.table === ti);
          const lit = T >= 0 && meet ? easeOut(seg(T, meet.tPass, meet.tPass + 260)) : 0;
          const lock = T >= 0 && tb.needs ? easeBack(seg(T, 950, 1250)) : 0;
          const a0 = -Math.PI / 2 + ti;
          hairline(g, C.mint, 0.35 + 0.5 * Math.max(lit, lock), lock > 0 ? 1.5 : 1);
          g.beginPath(); g.arc(tb.x, tb.y, tb.r, a0, a0 + k * Math.PI * 2); g.stroke();
          hairline(g, C.mint, (0.22 + 0.3 * lock) * k);
          g.setLineDash([2, 5]); g.lineDashOffset = -tau * (0.012 + 0.05 * lock);
          g.beginPath(); g.arc(tb.x, tb.y, tb.r + 6 * s + lock * 3 * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
          for (let q = 0; q < 4; q++) {
            const a = q * Math.PI / 2 + tau * 0.0003 * (ti % 2 ? 1 : -1);
            const r1 = tb.r + 10 * s, r2 = r1 + 4 * s;
            line(g, tb.x + Math.cos(a) * r1, tb.y + Math.sin(a) * r1, tb.x + Math.cos(a) * r2, tb.y + Math.sin(a) * r2, k, C.mint, 0.45);
          }
          if (lock > 0) {        // the table that needs you says so
            g.font = `500 ${Math.round(10 * s + 1)}px ${MONO}`; g.textAlign = "center"; g.fillStyle = C.mint; g.globalAlpha = 1;
            g.fillText(typed("NEEDS YOU", seg(T, 1000, 1250)), tb.x, tb.y + tb.r + 24 * s);
          }
        });

        // idle link flickers
        if (T < 0 && !reduced && tau > nextFlick) { spawnFlicker(tau); nextFlick = tau + 650 + Math.random() * 700; }
        for (let i = flick.length - 1; i >= 0; i--) {
          const f = flick[i], u = tau - f.t0;
          if (u > 1500) { flick.splice(i, 1); continue; }
          const a = pos(f.a, tau), b = pos(f.b, tau);
          line(g, a.x, a.y, b.x, b.y, easeOut(seg(u, 0, 350)), C.mint, 0.45 * (1 - seg(u, 1000, 1500)));
        }

        // ripples from you, lighting the floor as they pass
        if (T >= 0) {
          for (const r0 of [260, 430, 600]) {
            const k = seg(T, r0, r0 + 1000);
            if (k <= 0 || k >= 1) continue;
            const r = 12 * s + easeOut(k) * room.rmax;
            ring(g, you.x, you.y, r, C.you, 0.8 * (1 - k));
            lightRing(g, floor, you.x, you.y, r, 16 * s, C.you, 0.7 * (1 - k));
          }
          for (const p of pick) {     // the line back to you, and a ping where they are
            const q = pos(p, tau);
            line(g, q.x, q.y, you.x, you.y, easeOut(seg(T, p.tPass, p.tPass + 320)), C.mint, 0.95);
            const pk = seg(T, p.tPass, p.tPass + 550);
            if (pk > 0 && pk < 1) ring(g, q.x, q.y, 4 * s + pk * 16 * s, C.mint, 0.9 * (1 - pk));
          }
        }

        // people: pop in on load, drift, the ones you'll meet turn mint as the ripple passes
        people.forEach((p, i) => {
          const k = easeBack(seg(tau, 500 + i * 45, 850 + i * 45));
          if (k <= 0) return;
          const q = pos(p, tau), r = 3.2 * s * k;
          const m = p.meet && T >= 0 ? seg(T, p.tPass, p.tPass + 160) : 0;
          dot(g, q.x, q.y, r, C.grey, 1 - m);
          if (m > 0) dot(g, q.x, q.y, r + 0.8 * s * m, C.mint, m);
        });

        // the button's tap pulse, before the press
        if (T < 0 && btnRect && !reduced && tau > 1500) {
          const cyc = ((tau - 1500) % 2400) / 1100;
          if (cyc < 1) {
            const e = easeOut(cyc) * 14 * s;
            hairline(g, C.mint, 0.7 * (1 - cyc));
            g.strokeRect(btnRect.x - e, btnRect.y - e, btnRect.w + 2 * e, btnRect.h + 2 * e);
          }
        }

        // you: the button folds into a square, walks in through the door, becomes a dot with a ring
        if (T >= 0 && btnRect) {
          const fold = easeInOut(seg(T, 0, 300));
          const bw = lerp(btnRect.w, 11 * s, fold), bh = lerp(btnRect.h, 11 * s, fold);
          const cx = lerp(btnRect.x + btnRect.w / 2, you.x, easeInOut(seg(T, 80, 300)));
          const cy = lerp(btnRect.y + btnRect.h / 2, you.y, easeInOut(seg(T, 80, 300)));
          if (T < 300) {
            g.globalAlpha = 1; g.fillStyle = fold < 0.4 ? C.mint : C.you;
            g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
          } else {
            const k = easeBack(seg(T, 300, 520));
            dot(g, you.x, you.y, 5.5 * s, C.you, 1);
            ring(g, you.x, you.y, 11 * s * k, C.you, 1, 1.5);
            g.font = `500 ${Math.round(10 * s + 1)}px ${MONO}`; g.textAlign = "center"; g.fillStyle = C.you; g.globalAlpha = 1;
            g.fillText(typed("YOU", seg(T, 360, 520)), you.x, you.y + 26 * s);
          }
        }
        g.globalAlpha = 1;

        // counts under the line, ticking up once the server answers
        if (stats && stats.here && T < 0) {
          if (!statsEl._t0) statsEl._t0 = tau;
          const k = easeOut(seg(tau, statsEl._t0, statsEl._t0 + 900));
          statsEl.textContent = `${Math.round(stats.here * k)} HERE NOW · ${Math.round(stats.tables.length * k)} TABLES` +
            (stats.needs ? ` · ${Math.round(stats.needs * k)} NEED HELP` : "");
        }
      }

      function measureButton() {
        const r = btn.getBoundingClientRect(), o = L.root.getBoundingClientRect();
        btnRect = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
      }
      const onResize = () => { L.resize(); layout(); measureButton(); };
      global.addEventListener("resize", onResize);
      setTimeout(measureButton, reduced ? 0 : 1650);   // after the button has risen into place

      function finish(tag) {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf); stopSkip(); global.removeEventListener("resize", onResize);
        L.root.remove();
        resolve(tag || "done");
      }
      const END = 1700;
      (function frame() {
        if (done) return;
        draw();
        if (pressAt >= 0) {
          const T = now() - pressAt;
          room.pick.forEach((p, i) => { if (T >= p.tPass && !plucked.has(i)) { plucked.add(i); if (soundOn) Audio.pluck(i * 2 + 2); } });
          const k = easeInOut(seg(T, 1300, END));
          L.root.style.transform = k > 0 ? `translate3d(0,${-k * 100}%,0)` : "";
          if (T >= END) return finish("done");
        }
        if (!reduced || pressAt < 0) raf = requestAnimationFrame(frame);
      })();

      btn.addEventListener("click", () => {
        if (pressAt >= 0) return;
        try { sessionStorage.setItem(SIGNIN_KEY, "1"); } catch (e) { /* ignore */ }
        btn.disabled = true;
        if (reduced) {           // 300 ms fade, nothing else
          L.root.style.transition = "opacity 300ms linear"; L.root.style.opacity = "0";
          setTimeout(() => finish("reduced"), 320);
          return;
        }
        measureButton();
        pressAt = now();
        btn.style.visibility = "hidden";
        ui.style.transition = "opacity 220ms linear"; ui.style.opacity = "0";
        if (soundOn) { Audio.unlock(); Audio.bell(); }
        setTimeout(() => { stopSkip = onSkip(() => finish("skipped")); }, 0);   // the press itself is not a skip
      });
    });
  }

  // =================================================================================================================
  // 2. Map opening: "the room fills up"
  //    The floor lights up from the door, the room and its tables draw in with typed labels, people stream in on
  //    curved paths with fading trails and an arrival ping, each group wires up with a rising run and locks, the
  //    counters tick with what actually happened, and the camera eases back as it hands over to the live map.
  // =================================================================================================================
  let mapPlayed = false;

  function map(container, opts) {
    opts = opts || {};
    if (mapPlayed) return Promise.resolve("already-played");   // never replays on a reconnect
    mapPlayed = true;
    const reduced = prefersReduced(opts);
    const quiet = !!opts.quiet || !!(global.Sound && global.Sound.muted);
    const soundOn = opts.sound !== false && !quiet && !reduced;

    return new Promise((resolve) => {
      const L = makeLayer(container, opts.zIndex);
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
        P.floor = makeFloor(L.w, L.h, L.dpr, Math.max(12, Math.round(18 * P.s)), Math.max(1.5, 1.6 * P.s), "#222222");
        const t0 = now(), belled = new Set(), ran = new Set();
        let lastBell = -1e9, bells = 0;
        (function frame() {
          if (done) return;
          const t = now() - t0;
          drawMap(g, L, P, t);
          for (const p of P.people) {            // one bell per arrival, thinned when a crowd walks in
            if (t >= p.t1 && !belled.has(p)) {
              belled.add(p);
              if (soundOn && t - lastBell > 140 && bells < 12) { Audio.bell(); lastBell = t; bells++; }
            }
          }
          for (const tb of P.tables) {            // each group's lines land as a quick rising run
            if (t >= tb.tLines && !ran.has(tb) && tb.pairs.length) { ran.add(tb); if (soundOn) Audio.run(tb.pairs.length, 0.08); }
          }
          if (t >= P.tFade) {
            const k = seg(t, P.tFade, P.tEnd);
            L.root.style.opacity = String(1 - k);
            if (k >= 1) return finish("done", 0);
          }
          raf = requestAnimationFrame(frame);
        })();
      });
    });
  }

  // Lay the room out and give every element its moment.
  function plan(spec, w, h) {
    const s = Math.min(w / 1600, h / 900) * 1.15;
    const n = spec.tables.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.8))), rows = Math.max(1, Math.ceil(n / cols));
    const area = { x: w * 0.12, y: h * 0.17, w: w * 0.76, h: h * 0.56 };
    const door = { x: w * 0.5, y: h * 0.9, half: 28 * s };
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
      people.push({ x: w * 0.5 + side * (w * 0.1 + j * 44 * s), y: h * 0.8, table: null });
    }
    // Stream in from the door, one after another; the room is in by about 2.6 s.
    const start = 700, span = Math.min(1700, people.length * 95), stagger = people.length > 1 ? span / (people.length - 1) : 0;
    const order = people.map((p, i) => i).sort((a, b) => (people[a].y - people[b].y) || (people[a].x - people[b].x));
    order.forEach((idx, k) => {
      const p = people[idx];
      p.t0 = start + k * stagger; p.t1 = p.t0 + 680;
      p.cx = (door.x + p.x) / 2 + (p.x < door.x ? -1 : 1) * 60 * s;   // a curved walk, not a straight line
      p.cy = (door.y + p.y) / 2 + 40 * s;
    });
    let last = 0, links = 0;
    for (const tb of tables) {
      tb.tLines = Math.max(...tb.seats.map((p) => p.t1)) + 60;
      for (let a = 0; a < tb.seats.length; a++) for (let b = a + 1; b < tb.seats.length; b++) tb.pairs.push([tb.seats[a], tb.seats[b]]);
      tb.pairs = tb.pairs.slice(0, 8);
      tb.tLock = tb.tLines + tb.pairs.length * 80 + 120;
      links += tb.pairs.length;
      last = Math.max(last, tb.tLock + 250);
    }
    last = Math.max(last, ...people.map((p) => p.t1));
    const tFade = Math.min(Math.max(last + 200, 3000), 3500);
    return { s, door, tables, people, links, spec, tFade, tEnd: tFade + 450 };
  }

  function walkAt(p, k, door) {
    const u = 1 - k;
    return { x: u * u * door.x + 2 * u * k * p.cx + k * k * p.x, y: u * u * door.y + 2 * u * k * p.cy + k * k * p.y };
  }

  function drawMap(g, L, P, t) {
    const { s, door, tables, people, floor } = P;
    const w = L.w, h = L.h, diag = Math.hypot(w, h);
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    g.globalAlpha = 1; g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    // camera: starts a little close and eases back to the live map's framing
    const z = 1.07 - 0.07 * easeOut(seg(t, 0, P.tFade));
    const cx = w / 2, cy = h * 0.55;
    g.setTransform(L.dpr * z, 0, 0, L.dpr * z, L.dpr * (cx - cx * z), L.dpr * (cy - cy * z));

    // floor lights up from the door
    const reveal = easeOut(seg(t, 0, 900)) * diag;
    g.save(); g.beginPath(); g.arc(door.x, door.y, Math.max(0.1, reveal), 0, Math.PI * 2); g.clip();
    g.drawImage(floor.canvas, 0, 0, w, h); g.restore();
    lightRing(g, floor, door.x, door.y, reveal, 40 * s, C.mint, 0.4 * (1 - seg(t, 600, 1100)));

    // the room, drawn as one line from the door round to the door
    const bx = w * 0.06, by = h * 0.08, bx2 = w * 0.94;
    const per = 2 * (bx2 - bx) + 2 * (door.y - by);
    hairline(g, C.grey, 0.55);
    g.setLineDash([per * easeInOut(seg(t, 80, 900)), per]);
    g.beginPath();
    g.moveTo(door.x - door.half, door.y); g.lineTo(bx, door.y); g.lineTo(bx, by); g.lineTo(bx2, by);
    g.lineTo(bx2, door.y); g.lineTo(door.x + door.half, door.y); g.stroke(); g.setLineDash([]);
    // corner marks
    const cm = easeOut(seg(t, 700, 1000)) * 14 * s;
    hairline(g, C.textDim, 0.7);
    for (const [x, y, dx, dy] of [[bx, by, 1, 1], [bx2, by, -1, 1], [bx, door.y, 1, -1], [bx2, door.y, -1, -1]]) {
      g.beginPath(); g.moveTo(x - dx * 6 * s, y); g.lineTo(x + dx * cm, y); g.moveTo(x, y - dy * 6 * s); g.lineTo(x, y + dy * cm); g.stroke();
    }

    // tables: arc draws itself, dashed outer ring turns, ticks, a typed label with a block cursor
    const fs = Math.max(11, 13 * s);
    g.font = `500 ${fs}px ${MONO}`; g.textBaseline = "alphabetic";
    let linksNow = 0;
    for (const tb of tables) {
      const k = easeInOut(seg(t, tb.tDraw, tb.tDraw + 520));
      if (k <= 0) continue;
      const lock = easeBack(seg(t, tb.tLock, tb.tLock + 320));
      const a0 = -Math.PI / 2;
      hairline(g, C.mint, 0.85, 1 + 0.6 * lock);
      g.beginPath(); g.arc(tb.x, tb.y, tb.r, a0, a0 + k * Math.PI * 2); g.stroke();
      hairline(g, C.mint, 0.3 * k);
      g.setLineDash([2 * s, 6 * s]); g.lineDashOffset = tb.spin * t * 0.02;
      g.beginPath(); g.arc(tb.x, tb.y, tb.r + 7 * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      for (let q = 0; q < 4; q++) {
        const a = q * Math.PI / 2 + tb.spin * (1 - k) * 1.2;
        const r1 = tb.r - 5 * s, r2 = tb.r + 3 * s;
        line(g, tb.x + Math.cos(a) * r1, tb.y + Math.sin(a) * r1, tb.x + Math.cos(a) * r2, tb.y + Math.sin(a) * r2, k, C.mint, 0.8);
      }
      // the lock: a ring that snaps out and fades when the group is wired
      const lk = seg(t, tb.tLock, tb.tLock + 600);
      if (lk > 0 && lk < 1) ring(g, tb.x, tb.y, tb.r + 7 * s + easeOut(lk) * 26 * s, C.mint, 0.8 * (1 - lk));
      // label
      const tk = seg(t, tb.tDraw + 300, tb.tDraw + 300 + tb.label.length * 35);
      if (tk > 0) {
        const txt = typed(tb.label, tk), ly = tb.y - tb.r - 26 * s;
        g.textAlign = "left"; g.globalAlpha = 0.9; g.fillStyle = C.mint;
        const full = g.measureText(tb.label).width, x0 = tb.x - full / 2;
        g.fillText(txt, x0, ly);
        if (tk < 1 || Math.floor(t / 180) % 2 === 0 && t < tb.tDraw + 1200) {
          const cw = g.measureText(txt).width;
          g.fillRect(x0 + cw + 2, ly - fs * 0.8, fs * 0.55, fs * 0.95);
        }
        if (lock > 0) {
          g.textAlign = "center"; g.fillStyle = C.textDim; g.globalAlpha = lock;
          g.fillText(String(tb.seats.length).padStart(2, "0"), tb.x, tb.y + fs * 0.35);
        }
      }
      // lines inside the group, one by one with the run
      tb.pairs.forEach(([a, b], i) => {
        const q = easeOut(seg(t, tb.tLines + i * 80, tb.tLines + i * 80 + 240));
        if (q >= 1) linksNow++;
        line(g, a.x, a.y, b.x, b.y, q, C.mint, 0.7);
      });
    }

    // people: stream in with a fading trail, ping on arrival, turn mint at a table
    let hereNow = 0;
    for (const p of people) {
      if (t < p.t0) continue;
      const k = easeOut(seg(t, p.t0, p.t1));
      const at = walkAt(p, k, door);
      if (k < 1) {          // trail: a few segments, each fainter than the last
        for (let j = 1; j <= 6; j++) {
          const ka = Math.max(0, k - j * 0.045), kb = Math.max(0, k - (j - 1) * 0.045);
          const A = walkAt(p, easeOut(ka), door), B = walkAt(p, easeOut(kb), door);
          hairline(g, C.walker, 0.5 * (1 - j / 7));
          g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
        }
      } else hereNow++;
      const settled = seg(t, p.t1, p.t1 + 200);
      const r = 4.2 * s;
      dot(g, at.x, at.y, r, C.walker, 1 - (p.table ? settled : 0));
      if (p.table && settled > 0) dot(g, at.x, at.y, r, C.mint, settled);
      const pk = seg(t, p.t1, p.t1 + 520);
      if (pk > 0 && pk < 1) {
        ring(g, at.x, at.y, r + easeOut(pk) * 18 * s, p.table ? C.mint : C.grey, 0.8 * (1 - pk));
        lightRing(g, floor, at.x, at.y, r + easeOut(pk) * 30 * s, 10 * s, p.table ? C.mint : "#6A6A6A", 0.55 * (1 - pk));
      }
    }

    // counters along the bottom: what actually happened so far, in mono
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    const hk = seg(t, 200, 600);
    g.globalAlpha = hk; g.textAlign = "left"; g.fillStyle = C.textDim;
    g.font = `500 ${Math.max(11, 12 * s)}px ${MONO}`;
    const tablesNow = tables.filter((tb) => t >= tb.tDraw + 300).length;
    const cells = [["HERE", hereNow], ["TABLES", tablesNow], ["LINKS", linksNow]];
    const y0 = h * 0.965, x0 = w * 0.06;
    cells.forEach(([label, v], i) => {
      const x = x0 + i * 150 * Math.max(0.7, s);
      g.fillStyle = C.textDim; g.fillText(label, x, y0);
      g.fillStyle = C.text; g.font = `600 ${Math.max(14, 18 * s)}px ${MONO}`;
      g.fillText(String(v).padStart(2, "0"), x, y0 - Math.max(14, 16 * s));
      g.font = `500 ${Math.max(11, 12 * s)}px ${MONO}`;
    });
    g.textAlign = "right"; g.fillStyle = C.textDim;
    g.fillText(typed(P.spec.generic ? "TAP IN · ROOM" : "TAP IN · LIVE ROOM", seg(t, 150, 650)), w * 0.94, y0);
    g.globalAlpha = 1;
  }

  global.TapInIntro = {
    signIn,
    map,
    // Demo-page helpers, not for production pages.
    _reset() { mapPlayed = false; try { sessionStorage.removeItem(SIGNIN_KEY); } catch (e) { /* ignore */ } },
  };
})(window);
