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
    const root = document.documentElement, hv = (n) => cssVar(root, n);
    if (!c && hv("--green") && hv("--pink")) {        // David's host screen (wall/host.css): use its live palette
      const bg = (opts && opts.bg) || hv("--bg") || C.bg, fg = hv("--fg") || C.text;
      return { bg, table: hv("--deep") || hv("--green"), outline: hv("--line"), link: hv("--forest") || hv("--green"), person: fg,
               solo: hv("--dim") || C.grey, text: fg, dim: hv("--muted") || C.textDim, accent: hv("--pink"),
               floor: mix(bg, fg, 0.09), lit: hv("--green"), mono: hv("--mono") || MONO, sans: hv("--sans") || SANS, host: true };
    }
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

  // ---- a tiny 3D camera: hairlines in perspective on a plain 2D canvas ---------------------------------------------
  // World units are metres: x across the room, z towards the door, y up. The camera orbits a target point.
  function camera() {
    const cam = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0.5, dist: 20, cx: 0, cy: 0, f: 600 };
    cam.update = () => {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw);
      cam.ex = cam.tx + cam.dist * cp * syw; cam.ey = cam.ty + cam.dist * sp; cam.ez = cam.tz + cam.dist * cp * cyw;
      let fx = cam.tx - cam.ex, fy = cam.ty - cam.ey, fz = cam.tz - cam.ez;
      const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
      const rx = cyw, ry = 0, rz = -syw;                         // right, from the yaw (safe looking straight down)
      Object.assign(cam, { fx, fy, fz, rx, ry, rz, ux: ry * fz - rz * fy, uy: rz * fx - rx * fz, uz: rx * fy - ry * fx });
    };
    cam.p = (x, y, z) => {
      const vx = x - cam.ex, vy = y - cam.ey, vz = z - cam.ez;
      const zc = vx * cam.fx + vy * cam.fy + vz * cam.fz;
      if (zc < 0.3) return null;
      const k = cam.f / zc;
      return { x: cam.cx + (vx * cam.rx + vy * cam.ry + vz * cam.rz) * k, y: cam.cy - (vx * cam.ux + vy * cam.uy + vz * cam.uz) * k, k, z: zc };
    };
    cam.pose = (a) => { Object.assign(cam, a); cam.update(); };
    return cam;
  }
  const lerpPose = (a, b, k) => ({ tx: lerp(a.tx, b.tx, k), ty: lerp(a.ty, b.ty, k), tz: lerp(a.tz, b.tz, k),
    yaw: lerp(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), dist: lerp(a.dist, b.dist, k) });

  function path3(g, cam, pts) {        // a polyline through 3D points, skipping anything behind the camera
    let open = false;
    g.beginPath();
    for (const [x, y, z] of pts) {
      const q = cam.p(x, y, z);
      if (!q) { open = false; continue; }
      if (open) g.lineTo(q.x, q.y); else { g.moveTo(q.x, q.y); open = true; }
    }
    g.stroke();
  }
  function circle3(g, cam, x, y, z, r, a0, a1, color, alpha, width) {
    if (alpha <= 0.01 || r <= 0 || a1 <= a0) return;
    const n = Math.max(6, Math.ceil(48 * (a1 - a0) / (Math.PI * 2))), pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]); }
    hairline(g, color, alpha, width); path3(g, cam, pts);
  }
  function arc3(g, cam, a, b, hgt, k, color, alpha, width) {   // a leap through the air from a to b
    if (k <= 0 || alpha <= 0.01) return;
    const pts = [], n = 22;
    for (let i = 0; i <= Math.ceil(n * k); i++) {
      const u = Math.min(k, i / n);
      pts.push([lerp(a.x, b.x, u), lerp(a.y || 0, b.y || 0, u) + 4 * hgt * u * (1 - u), lerp(a.z, b.z, u)]);
    }
    hairline(g, color, alpha, width); path3(g, cam, pts);
  }
  // A person: a hairline stalk with a dot on top. Seen from above it reads as a plain dot, like the map.
  function pin(g, cam, x, z, lift, color, alpha, tall) {
    const b = cam.p(x, lift, z), t = cam.p(x, lift + (tall || 0.85), z);
    if (!b || !t || alpha <= 0.01) return null;
    hairline(g, color, alpha * 0.8); g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(t.x, t.y); g.stroke();
    const r = Math.max(2, 0.16 * t.k);
    dot(g, t.x, t.y, r, color, alpha);
    return { x: t.x, y: t.y, r, k: t.k };
  }
  // The floor: a grid of cells that rise into a skyline as a wave passes, then settle back into dots.
  function makeCells(W, D, pitch) {
    const cells = [];
    for (let x = -W / 2 + pitch / 2; x < W / 2; x += pitch)
      for (let z = -D / 2 + pitch / 2; z < D / 2; z += pitch)
        cells.push({ x, z, hr: 0.35 + Math.random() * 0.65, ph: Math.random() * 6.28 });
    return cells;
  }
  // waves: [{x, z, t0 (ms), v (m/s), amp, decay (s), heat: 0 to stay in the cool colour}]. Draws the floor.
  function drawFloor(g, cam, cells, pitch, t, waves, K, reveal) {
    for (const c of cells) { c.q = cam.p(c.x, 0, c.z); }
    const vis = cells.filter((c) => c.q);
    vis.sort((a, b) => b.q.z - a.q.z);
    const far = cam.dist * 1.9;
    for (const c of vis) {
      const q = c.q;
      let h = 0, heat = 0, lit = 0;
      for (const wv of waves) {
        const front = (t - wv.t0) / 1000 * wv.v;
        if (front <= 0) continue;
        const age = (front - Math.hypot(c.x - wv.x, c.z - wv.z)) / wv.v;   // seconds since the wave passed here
        if (age < 0) continue;
        lit = 1;
        const rise = age < 0.12 ? easeOut(age / 0.12) : Math.exp(-(age - 0.12) / (wv.decay || 0.45));
        h = Math.max(h, wv.amp * c.hr * rise);
        if (wv.heat !== 0) heat = Math.max(heat, 1 - clamp(age / 0.35));
      }
      const fog = clamp(1.35 - q.z / far, 0.18, 1);
      const shown = reveal == null ? 1 : reveal(c);
      if (shown <= 0) continue;
      if (h > 0.06) {
        const top = cam.p(c.x, h, c.z);
        if (top) {
          const w = Math.max(1, pitch * 0.46 * q.k);
          g.globalAlpha = fog * shown * (0.35 + 0.65 * Math.min(1, h * 1.5));
          g.fillStyle = heat > 0.5 ? K.hot : K.cool;
          g.fillRect(q.x - w / 2, top.y, w, Math.max(1, q.y - top.y));
          continue;
        }
      }
      const s = Math.max(1, 0.07 * q.k);
      g.globalAlpha = fog * shown * (lit ? 1 : 0.55);
      g.fillStyle = K.dot;
      g.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    g.globalAlpha = 1;
  }
  // The Entrance reader: a small upright box beside the door that flashes on every tap.
  function reader(g, cam, x, z, color, flash, accent) {
    const a = cam.p(x - 0.22, 0, z), b = cam.p(x + 0.22, 0, z), c = cam.p(x + 0.22, 1.1, z), d = cam.p(x - 0.22, 1.1, z);
    if (!a || !b || !c || !d) return;
    if (flash > 0) {
      g.globalAlpha = flash; g.fillStyle = accent;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
    }
    hairline(g, color, 0.95); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.stroke();
    g.globalAlpha = 1;
  }
  function ring(g, x, y, r, color, alpha, width) {
    if (alpha <= 0.01 || r <= 0) return;
    hairline(g, color, alpha, width); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  }
  function typed(text, k) { return text.slice(0, Math.floor(clamp(k) * text.length)); }
  function text3(g, cam, s, x, y, z, px, font, color, alpha, align) {
    const q = cam.p(x, y, z);
    if (!q || alpha <= 0.01 || !s) return;
    g.globalAlpha = alpha; g.fillStyle = color; g.textAlign = align || "center";
    g.font = `500 ${Math.round(clamp(px * q.k, 9, 26))}px ${font}`;
    g.fillText(s, q.x, q.y); g.globalAlpha = 1;
  }
  // A walk from the door to a seat along a gentle curve on the floor.
  function walkAt(p, k) {
    const u = 1 - k;
    return { x: u * u * p.sx + 2 * u * k * p.cx + k * k * p.x, z: u * u * p.sz + 2 * u * k * p.cz + k * k * p.z };
  }
  function trail3(g, cam, p, k, color, alpha) {
    const pts = [];
    for (let j = 8; j >= 0; j--) { const q = walkAt(p, Math.max(0, k - j * 0.035)); pts.push([q.x, 0.02, q.z]); }
    hairline(g, color, alpha); path3(g, cam, pts);
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
  //    The phone's own header and raspberry button over a small room seen in 3D. Before you touch it the room is
  //    alive: the floor rose into a skyline when the page opened and breathes every few seconds; people tap the
  //    Entrance reader and walk to a seat; links leap between people at the same table; the camera drifts.
  //    On the press the button folds into you and you drop in at the door. Your tap sends a raspberry wave across
  //    the floor that lifts it into a skyline; as it reaches three people they turn mint and leap a line to you; the
  //    table that needs you rises; the camera cranes down onto you and the screen lifts away to the form.
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

      // The room: 10 m by 11 m, the door at the front edge.
      const W = 10, D = 11, PITCH = 0.5, DOOR = { x: 0, z: D / 2 }, READER = { x: 1.1, z: D / 2 + 0.2 };
      const YOU = { x: 0, z: D / 2 - 1.2 };
      const cells = makeCells(W, D, PITCH);
      const tables = [
        { x: -2.6, z: -2.9, r: 0.95, n: 3, cap: 4 }, { x: 2.6, z: -3.1, r: 1.1, n: 3, cap: 5 },
        { x: -2.5, z: 1.2, r: 0.8, n: 2, cap: 3 }, { x: 2.5, z: 1.0, r: 0.9, n: 2, cap: 4, needs: true },
      ];
      const people = [];
      tables.forEach((t, ti) => {
        t.free = [];
        for (let i = 0; i < t.cap; i++) {
          const a = -Math.PI / 2 + (i / t.cap) * Math.PI * 2 + ti * 0.7;
          const seat = { x: t.x + Math.cos(a) * (t.r + 0.45), z: t.z + Math.sin(a) * (t.r + 0.45) };
          if (i < t.n) people.push({ ...seat, table: ti }); else t.free.push(seat);
        }
      });
      [[-4.1, -0.6], [0.2, -0.9], [4.0, -0.5]].forEach(([x, z]) => people.push({ x, z, table: -1 }));
      const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      const ENTRY = { x: DOOR.x, z: DOOR.z, t0: 120, v: 8.5, amp: 0.9, decay: 0.5 };
      people.forEach((p) => { p.tOn = ENTRY.t0 + dist(p, DOOR) / ENTRY.v * 1000; });
      tables.forEach((t) => { t.tOn = ENTRY.t0 + dist(t, DOOR) / ENTRY.v * 1000; });
      const pick = [0, 1, 3].map((ti) => people.filter((p) => p.table === ti).sort((a, b) => dist(a, YOU) - dist(b, YOU))[0]);
      pick.sort((a, b) => dist(a, YOU) - dist(b, YOU));
      pick.forEach((p) => { p.meet = true; });

      const cam = camera();
      let btnRect = null, view = null;
      function measure() {
        const o = L.root.getBoundingClientRect(), r = btn.getBoundingClientRect(), hb = head.getBoundingClientRect();
        btnRect = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
        const top = hb.bottom - o.top + 4, bottom = btnRect.y - 34;
        view = { cx: L.w / 2, cy: (top + bottom) / 2 + 10, f: Math.max(200, (bottom - top) * 1.12) };
      }
      measure();

      const waves = [ENTRY], walkers = [], flick = [], taps = [];
      const born = now();
      let pressAt = -1, raf = 0, done = false, stopSkip = () => {};
      let nextFlick = 1500, nextArrive = 1900, nextBreath = 4200;
      const plucked = new Set();

      function arrive(tau) {
        const open = tables.map((t, ti) => ({ t, ti })).filter(({ t }) => t.free.length);
        if (!open.length) return;
        const { t, ti } = open[Math.floor(Math.random() * open.length)];
        const seat = t.free.shift();
        const p = { x: seat.x, z: seat.z, table: ti, tOn: 0, sx: DOOR.x + 0.3, sz: DOOR.z + 0.4, t0: tau + 220, t1: tau + 1300 };
        p.cx = (p.sx + p.x) / 2 + (p.x < 0 ? -1.5 : 1.5); p.cz = (p.sz + p.z) / 2 + 0.6;
        people.push(p); walkers.push(p); taps.push(tau);
      }
      function personAt(p, tau) {
        if (p.t0 != null && tau < p.t1) return walkAt(p, easeOut(seg(tau, p.t0, p.t1)));
        return p;
      }

      function draw() {
        const tau = reduced ? 4000 : now() - born;
        const T = pressAt < 0 ? -1 : now() - pressAt;
        g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
        g.globalAlpha = 1; g.fillStyle = K.bg; g.fillRect(0, 0, L.w, L.h);

        // camera: rises into place on load, drifts while you wait, cranes down onto you after the press
        const enter = easeInOut(seg(tau, 0, 1500));
        const idle = { tx: 0, ty: 0, tz: 0.4, yaw: 0.38 * Math.sin(tau * 0.00021) - 0.1, pitch: 0.7, dist: 17.5 };
        let pose = lerpPose({ tx: 0, ty: 0.4, tz: 2.6, yaw: -0.55, pitch: 0.28, dist: 12 }, idle, enter);
        if (T >= 0) pose = lerpPose(pose, { tx: YOU.x, ty: 0, tz: YOU.z - 0.4, yaw: 0, pitch: 1.32, dist: 6.5 }, easeInOut(seg(T, 1150, 1900)));
        Object.assign(cam, view); cam.pose(pose);

        const front = (tau - ENTRY.t0) / 1000 * ENTRY.v;
        drawFloor(g, cam, cells, PITCH, tau, waves, T >= 0 ? { dot: mix(K.bg, K.text, 0.2), hot: K.you, cool: K.mint }
          : { dot: mix(K.bg, K.text, 0.2), hot: K.mint, cool: mix(K.bg, K.mint, 0.55) },
          (c) => (dist(c, DOOR) <= front ? 1 : 0));

        // room outline on the floor, with the door gap and the Entrance reader
        const ok = seg(tau, 200, 1000);
        if (ok > 0) {
          hairline(g, K.grey, 0.8 * ok);
          path3(g, cam, [[DOOR.x - 0.7, 0, D / 2], [-W / 2, 0, D / 2], [-W / 2, 0, -D / 2], [W / 2, 0, -D / 2], [W / 2, 0, D / 2], [DOOR.x + 0.7, 0, D / 2]]);
          let flash = T >= 0 ? 0 : 0;
          for (const tt of taps) flash = Math.max(flash, 1 - seg(tau, tt, tt + 450));
          reader(g, cam, READER.x, READER.z, K.grey, flash, K.mint);
          text3(g, cam, "ENTRANCE", READER.x + 0.45, 0.05, READER.z + 0.1, 0.32, MONO, K.dim, ok, "left");
          for (const tt of taps) {
            const k = seg(tau, tt, tt + 700);
            if (k > 0 && k < 1) circle3(g, cam, DOOR.x, 0, DOOR.z, 0.3 + easeOut(k) * 2.2, 0, Math.PI * 2, K.mint, 0.8 * (1 - k));
          }
        }

        // tables: a ring that draws itself as the floor wakes under it, and a dashed outer ring that turns
        tables.forEach((tb, ti) => {
          const k = easeInOut(seg(tau, tb.tOn, tb.tOn + 500));
          if (k <= 0) return;
          const meet = pick.find((q) => q.table === ti);
          const lit = T >= 0 && meet ? easeOut(seg(T, meet.tPass, meet.tPass + 260)) : 0;
          const lift = T >= 0 && tb.needs ? 0.6 * easeBack(seg(T, 1050, 1400)) : 0.25 * bump(seg(tau, tb.tOn, tb.tOn + 600));
          let knock = 0;
          if (T >= 0) knock = 0.35 * bump(seg(T, tb.tWave, tb.tWave + 380));
          const y = lift + knock;
          circle3(g, cam, tb.x, y, tb.z, tb.r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2, K.mint, 0.55 + 0.45 * Math.max(lit, tb.needs && T >= 0 ? seg(T, 1050, 1300) : 0), 1.5);
          g.setLineDash([2, 5]); g.lineDashOffset = -tau * 0.015 * (ti % 2 ? 1 : -1);
          circle3(g, cam, tb.x, y, tb.z, tb.r + 0.28, 0, Math.PI * 2, K.mint, 0.35 * k);
          g.setLineDash([]);
          if (y > 0.05) {      // lifted: hang it on two hairlines so it reads as up in the air
            hairline(g, K.mint, 0.35);
            path3(g, cam, [[tb.x - tb.r, 0, tb.z], [tb.x - tb.r, y, tb.z]]); path3(g, cam, [[tb.x + tb.r, 0, tb.z], [tb.x + tb.r, y, tb.z]]);
          }
          if (tb.needs && T >= 0) text3(g, cam, typed("NEEDS YOU", seg(T, 1150, 1450)), tb.x, y + 0.35, tb.z - tb.r - 0.35, 0.42, MONO, K.mint, 1);
        });

        // idle life
        if (T < 0 && !reduced) {
          if (tau > nextArrive) { arrive(tau); nextArrive = tau + 1500 + Math.random() * 1300; }
          if (tau > nextBreath) { waves.push({ x: DOOR.x, z: DOOR.z, t0: tau, v: 7, amp: 0.35, decay: 0.4, heat: 0 }); nextBreath = tau + 4600; }
          if (tau > nextFlick) {
            const ti = Math.floor(Math.random() * tables.length);
            const at = people.filter((p) => p.table === ti && (p.t1 == null || tau > p.t1));
            if (at.length > 1) { const a = at[0], b = at[1 + Math.floor(Math.random() * (at.length - 1))]; flick.push({ a, b, t0: tau }); }
            nextFlick = tau + 700 + Math.random() * 700;
          }
          if (waves.length > 6) waves.splice(1, waves.length - 6);
        }
        for (let i = flick.length - 1; i >= 0; i--) {
          const f = flick[i], u = tau - f.t0;
          if (u > 1500) { flick.splice(i, 1); continue; }
          arc3(g, cam, { x: f.a.x, y: 0.85, z: f.a.z }, { x: f.b.x, y: 0.85, z: f.b.z }, 0.45, easeOut(seg(u, 0, 420)), K.mint, 0.75 * (1 - seg(u, 1000, 1500)));
        }
        for (const p of walkers) if (tau > p.t0 && tau < p.t1) trail3(g, cam, p, easeOut(seg(tau, p.t0, p.t1)), K.walker, 0.7);

        // after the press: lines leap from the people you'll meet to you
        if (T >= 0) {
          pick.forEach((p, i) => {
            const q = personAt(p, tau);
            arc3(g, cam, { x: q.x, y: 0.85, z: q.z }, { x: YOU.x, y: 0.95, z: YOU.z }, 0.9, easeOut(seg(T, p.tPass, p.tPass + 380)), K.mint, 1, 1.5);
            const k = seg(T, p.tPass, p.tPass + 600);
            if (k > 0 && k < 1) circle3(g, cam, q.x, 0, q.z, 0.2 + easeOut(k) * 0.9, 0, Math.PI * 2, K.mint, 0.9 * (1 - k));
          });
          const ik = seg(T, 500, 1200);
          if (ik > 0 && ik < 1) circle3(g, cam, YOU.x, 0, YOU.z, 0.2 + easeOut(ik) * 1.6, 0, Math.PI * 2, K.you, 1 - ik, 1.5);
        }

        // people, far to near
        const drawn = people.map((p) => ({ p, q: personAt(p, tau) })).filter(({ p }) => tau >= p.tOn && (p.t0 == null || tau >= p.t0));
        drawn.sort((a, b) => (a.q.z - b.q.z));
        for (const { p, q } of drawn) {
          const grow = p.t0 != null ? 1 : easeBack(seg(tau, p.tOn, p.tOn + 420));
          const m = p.meet && T >= 0 ? seg(T, p.tPass, p.tPass + 160) : 0;
          const settled = p.t1 != null ? seg(tau, p.t1, p.t1 + 250) : 1;
          const col = m > 0.5 ? K.mint : settled < 1 ? K.walker : K.grey;
          pin(g, cam, q.x, q.z, 0, col, 1, 0.85 * Math.max(0.05, grow));
          if (p.t1 != null) { const k = seg(tau, p.t1, p.t1 + 600); if (k > 0 && k < 1) circle3(g, cam, p.x, 0, p.z, 0.15 + easeOut(k) * 0.7, 0, Math.PI * 2, K.mint, 0.8 * (1 - k)); }
        }

        // you: the button folds into a raspberry square, then you drop in at the door
        if (T >= 0 && btnRect) {
          const at = cam.p(YOU.x, 0.95, YOU.z) || { x: L.w / 2, y: L.h / 2 };
          if (T < 300) {
            const fold = easeInOut(seg(T, 0, 300));
            const bw = lerp(btnRect.w, 12, fold), bh = lerp(btnRect.h, 12, fold);
            const cx = lerp(btnRect.x + btnRect.w / 2, at.x, fold), cy = lerp(btnRect.y + btnRect.h / 2, at.y - 120, fold);
            g.globalAlpha = 1; g.fillStyle = K.you; g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
          } else {
            const drop = easeBack(seg(T, 300, 560)), lift = Math.max(-0.08, 3.2 * (1 - drop));
            const h = pin(g, cam, YOU.x, YOU.z, lift, K.you, 1, 0.95);
            if (h) {
              dot(g, h.x, h.y, h.r * 1.35, K.you, 1);
              ring(g, h.x, h.y, h.r * 3.2 * easeBack(seg(T, 480, 700)), K.you, 1, 1.5);
              g.font = `600 ${Math.round(clamp(0.36 * h.k, 10, 18))}px ${MONO}`; g.textAlign = "center"; g.fillStyle = K.you; g.globalAlpha = 1;
              g.fillText(typed("YOU", seg(T, 560, 720)), h.x, h.y - h.r * 4.2);
              pick.forEach((p, i) => {
                const nk = seg(T, p.tPass + 80, p.tPass + 760);
                if (nk > 0 && nk < 1) {
                  g.font = `600 ${Math.round(clamp(0.34 * h.k, 10, 16))}px ${MONO}`; g.textAlign = "left"; g.fillStyle = K.mint; g.globalAlpha = 1 - nk;
                  g.fillText("+" + (i + 1), h.x + h.r * 4, h.y - easeOut(nk) * 26);
                }
              });
              g.globalAlpha = 1;
            }
          }
        }

        // the button's pulse before the press, in screen space
        if (T < 0 && btnRect && !reduced && tau > 1600) {
          for (const off of [0, 320]) {
            const cyc = ((tau - 1600 - off) % 2600) / 1100;
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
        if (T >= 0) readout.textContent = typed("3 PEOPLE YOU'LL MEET · 1 TABLE NEEDS YOU", seg(T, 1050, 1450));
      }

      const onResize = () => { L.resize(); measure(); };
      global.addEventListener("resize", onResize);
      setTimeout(() => { if (!done && pressAt < 0) measure(); }, reduced ? 0 : 1600);

      function finish(tag) {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf); stopSkip(); global.removeEventListener("resize", onResize);
        L.root.remove();
        resolve(tag || "done");
      }
      const END = 2100;
      (function frame() {
        if (done) return;
        draw();
        if (pressAt >= 0) {
          const T = now() - pressAt;
          pick.forEach((p, i) => { if (T >= p.tPass && !plucked.has(i)) { plucked.add(i); if (soundOn) Audio.pluck(i * 2 + 2); } });
          const k = easeInOut(seg(T, 1700, END));
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
        measure();
        pressAt = now();
        const tau = pressAt - born;
        // your tap: one wave from where you land, timed against the landing clock
        const V = 10, T0 = 520;
        waves.length = 0;
        waves.push({ x: DOOR.x, z: DOOR.z, t0: -1e6, v: 1e3, amp: 0, decay: 0.1 });   // keeps the floor revealed
        waves.push({ x: YOU.x, z: YOU.z, t0: tau + T0, v: V, amp: 1.5, decay: 0.55 });
        pick.forEach((p) => { p.tPass = T0 + dist(personAt(p, tau), YOU) / V * 1000; });
        tables.forEach((tb) => { tb.tWave = T0 + Math.max(0, dist(tb, YOU) - tb.r) / V * 1000; });
        btn.style.visibility = "hidden";
        head.style.transition = "opacity 260ms linear"; head.style.opacity = "0.25";
        if (soundOn) { Audio.unlock(); Audio.bell(); }
        setTimeout(() => { stopSkip = onSkip(() => finish("skipped")); }, 0);
      });
    });
  }

  // =================================================================================================================
  // 2. Map opening: "the room fills up"
  //    In the wall's current theme. The camera starts at floor level by the Entrance. One tap on the reader sends a
  //    wave across the whole floor; the floor rises into a skyline behind it and settles, and the tables lift out of
  //    it. People tap in one after another (each tap ripples the floor) and walk to their seats; each group's lines
  //    leap between them with a rising run of plucks; links arc across tables. Meanwhile the camera cranes up from
  //    the door to straight overhead, which is where the map starts, and the intro hands over to it.
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
        const page = pageLayout(L);
        const P = planRoom(spec, page ? "left" : "centre");
        P.page = page;
        P.target = typeof opts.target === "function" ? opts.target : null;
        const cam = camera();
        const t0 = now(), belled = new Set(), ran = new Set(), crossed = new Set();
        let lastBell = -1e9, bells = 0, tapped = false;
        (function frame() {
          if (done) return;
          const t = now() - t0;
          drawRoom(g, L, cam, P, K, t);
          if (!tapped && t >= P.TAP) { tapped = true; if (soundOn) Audio.bell(); }
          for (const p of P.people) {
            if (t >= p.t1 && !belled.has(p)) {
              belled.add(p);
              if (soundOn && t - lastBell > 150 && bells < 12) { Audio.bell(); lastBell = t; bells++; }
            }
          }
          for (const tb of P.tables) {
            if (t >= tb.tLines && !ran.has(tb) && tb.pairs.length) { ran.add(tb); if (soundOn) Audio.run(tb.pairs.length, 0.08); }
          }
          P.cross.forEach((c, i) => { if (t >= c.t0 && !crossed.has(c)) { crossed.add(c); if (soundOn) Audio.pluck(7 - (i % 4)); } });
          if (t >= P.tFade) {
            L.root.style.opacity = String(1 - easeInOut(seg(t, P.tFade, P.tEnd)));
            if (t >= P.tEnd) return finish("done", 0);
          }
          raf = requestAnimationFrame(frame);
        })();
      });
    });
  }

  // Lay the room out in metres and give every element its moment.
  function planRoom(spec, doorAt) {
    const W = 24, D = 15, PITCH = 0.6, dx = doorAt === "left" ? -W / 2 + 2.6 : 0;
    const DOOR = { x: dx, z: D / 2 }, READER = { x: dx + 1.3, z: D / 2 + 0.25 };
    const TAP = 320, WAVE = { x: READER.x, z: READER.z, t0: TAP + 40, v: 16, amp: 2.4, decay: 0.6 };
    const n = spec.tables.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.8))), rows = Math.max(1, Math.ceil(n / cols));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const people = [];
    const tables = spec.tables.map((size, i) => {
      const c = i % cols, r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols);
      const x = -9 + 18 * ((c + 0.5 + (cols - inRow) / 2) / cols);
      const z = -5.4 + 8.6 * ((r + 0.5) / rows);
      const rad = 0.9 + 0.17 * size;
      const tb = { x, z, r: rad, label: "TABLE " + String(i + 1).padStart(2, "0"), seats: [], pairs: [], spin: i % 2 ? 1 : -1 };
      tb.tOn = WAVE.t0 + dist(tb, READER) / WAVE.v * 1000;
      for (let k = 0; k < size; k++) {
        const a = -Math.PI / 2 + (k / size) * Math.PI * 2 + i * 0.5;
        const seat = { x: x + Math.cos(a) * (rad + 0.5), z: z + Math.sin(a) * (rad + 0.5), table: tb };
        tb.seats.push(seat); people.push(seat);
      }
      return tb;
    });
    for (let k = 0; k < spec.solos; k++) {
      const side = k % 2 ? 1 : -1, j = Math.floor(k / 2);
      people.push({ x: dx * 0.3 + side * (3.2 + j * 1.3), z: 5.0, table: null });
    }
    // Taps at the reader, one after another; each person then walks from the door to their seat.
    const start = 900, span = Math.min(1500, people.length * 85), stagger = people.length > 1 ? span / (people.length - 1) : 0;
    const order = people.map((p, i) => i).sort((a, b) => dist(people[a], DOOR) - dist(people[b], DOOR));
    const waves = [WAVE];
    order.forEach((idx, k) => {
      const p = people[idx];
      p.tap = start + k * stagger; p.t0 = p.tap + 120; p.t1 = p.t0 + 760;
      p.sx = DOOR.x + 0.4; p.sz = DOOR.z + 0.6;
      p.cx = (p.sx + p.x) / 2 + (p.x < 0 ? -2.2 : 2.2); p.cz = (p.sz + p.z) / 2 + 1.0;
      if (k % 3 === 0) waves.push({ x: READER.x, z: READER.z, t0: p.tap, v: 11, amp: 0.45, decay: 0.3, heat: 0 });
    });
    let last = 0;
    for (const tb of tables) {
      tb.tLines = Math.max(...tb.seats.map((p) => p.t1)) + 60;
      for (let a = 0; a < tb.seats.length; a++) for (let b = a + 1; b < tb.seats.length; b++) tb.pairs.push([tb.seats[a], tb.seats[b]]);
      tb.pairs = tb.pairs.slice(0, 8);
      tb.tLock = tb.tLines + tb.pairs.length * 80 + 120;
      last = Math.max(last, tb.tLock + 200);
    }
    const cross = [];
    for (let i = 0; i + 1 < tables.length && cross.length < 5; i++) {
      const a = tables[i].seats[tables[i].seats.length - 1], b = tables[i + 1].seats[0];
      if (a && b) cross.push({ a, b, t0: last - 150 + i * 110 });
    }
    if (cross.length) last = Math.max(last, cross[cross.length - 1].t0 + 420);
    last = Math.max(last, ...people.map((p) => p.t1));
    const tFade = Math.min(Math.max(last + 200, 3500), 4000);
    // Camera: from floor level by the door, up and round, to straight overhead.
    const A = { tx: dx + 0.6, ty: 0.5, tz: 5.6, yaw: dx ? -0.35 : -0.7, pitch: 0.1, dist: 8 };
    const B = { tx: dx * 0.4, ty: 0, tz: 1.5, yaw: -0.3, pitch: 0.55, dist: 19 };
    const C = { tx: 0, ty: 0, tz: -0.6, yaw: 0, pitch: 1.36, dist: 23 };
    return { W, D, PITCH, DOOR, READER, TAP, cells: makeCells(W, D, PITCH), waves, tables, people, cross, spec,
             A, B, C, tFade, tEnd: tFade + 500, tMorph: tFade - 850 };
  }

  // When the page underneath has a plan area and a side column (David's host screen: #room, #side, #moment), frame
  // the camera on the plan and paint the side column and strip in place, so the intro dissolves straight into it.
  function pageLayout(L) {
    const o = L.root.getBoundingClientRect();
    const box = (id) => {
      const el = document.getElementById(id);
      if (!el || el.offsetParent === null) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 30) return null;
      const cs = global.getComputedStyle(el), v = (n) => cs.getPropertyValue(n).trim();
      return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, bg: cs.backgroundColor,
               fg: v("--fg"), muted: v("--muted"), line: v("--line"), pink: v("--pink") };
    };
    const plan = box("room"), side = box("side");
    return plan && side ? { plan, side, strip: box("moment") } : null;
  }

  // Pair the intro's tables and people with the page's own (largest table with largest table, seat with seat), in
  // the layer's pixel space. Anything without a partner fades out or in where it stands.
  function matchTarget(P, snap, L) {
    if (!snap || !Array.isArray(snap.tables) || !Array.isArray(snap.people)) return null;
    const o = L.root.getBoundingClientRect();
    const tt = snap.tables.map((T) => ({ ...T, x: T.x - o.left, y: T.y - o.top })).sort((a, b) => (b.r || 0) - (a.r || 0));
    const tp = snap.people.map((q) => ({ ...q, x: q.x - o.left, y: q.y - o.top }));
    const mine = [...P.tables].sort((a, b) => b.seats.length - a.seats.length);
    const pairsT = [], pairsP = [], used = new Set();
    mine.forEach((tb, i) => {
      const T = tt[i] || null;
      pairsT.push({ from: tb, to: T });
      const theirs = T ? tp.filter((q) => q.table === T.id) : [];
      tb.seats.forEach((seat, k) => { const q = theirs[k] || null; if (q) used.add(q); pairsP.push({ from: seat, to: q }); });
      theirs.slice(tb.seats.length).forEach((q) => { used.add(q); pairsP.push({ from: null, to: q }); });
    });
    tt.slice(mine.length).forEach((T) => pairsT.push({ from: null, to: T }));
    const solos = P.people.filter((p) => !p.table), rest = tp.filter((q) => !used.has(q));
    solos.forEach((p, k) => { const q = rest[k] || null; if (q) used.add(q); pairsP.push({ from: p, to: q }); });
    rest.filter((q) => !used.has(q)).forEach((q) => pairsP.push({ from: null, to: q }));
    return { tables: pairsT, people: pairsP };
  }
  function drawMorph(g, cam, P, K, M) {
    const at = (x, z) => cam.p(x, 0, z);
    for (const { from, to } of P.snap.tables) {
      const a = from && at(from.x, from.z), ar = a && from ? Math.hypot(at(from.x + from.r, from.z).x - a.x, at(from.x + from.r, from.z).y - a.y) : 0;
      const x = a && to ? lerp(a.x, to.x, M) : a ? a.x : to.x, y = a && to ? lerp(a.y, to.y, M) : a ? a.y : to.y;
      const r = a && to ? lerp(ar, to.r || ar, M) : a ? ar : (to.r || 20);
      const alpha = from && to ? 1 : from ? 1 - M : M;
      ring(g, x, y, Math.max(1, r), K.table, alpha, 1.5);
    }
    for (const tb of P.tables) {                    // the intro's own links let go as the page's take over
      for (const [a, b] of tb.pairs) {
        const pa = at(a.x, a.z), pb = at(b.x, b.z);
        if (pa && pb) { hairline(g, K.table, 0.8 * (1 - M)); g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke(); }
      }
    }
    for (const { from, to } of P.snap.people) {
      const a = from && at(from.x, from.z);
      const x = a && to ? lerp(a.x, to.x, M) : a ? a.x : to.x, y = a && to ? lerp(a.y, to.y, M) : a ? a.y : to.y;
      const alpha = from && to ? 1 : from ? 1 - M : M;
      dot(g, x, y, lerp(a ? Math.max(2, 0.16 * a.k) : 4, 5, M), from && !from.table ? K.solo : K.person, alpha);
    }
    g.globalAlpha = 1;
  }

  function drawRoom(g, L, cam, P, K, t) {
    const { W, D, DOOR, READER, tables, people } = P;
    const w = L.w, h = L.h;
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    g.globalAlpha = 1; g.fillStyle = K.bg; g.fillRect(0, 0, w, h);

    const k1 = easeInOut(seg(t, 0, 1900)), k2 = easeInOut(seg(t, 1500, P.tFade + 250));
    const PL = P.page && P.page.plan;
    Object.assign(cam, PL ? { cx: PL.x + PL.w / 2, cy: PL.y + PL.h * 0.52, f: Math.min(PL.h * 1.12, PL.w * 0.62) }
                          : { cx: w * 0.44, cy: h * 0.52, f: h * 1.05 });
    cam.pose(lerpPose(lerpPose(P.A, P.B, k1), P.C, k2));

    const front = (t - P.waves[0].t0) / 1000 * P.waves[0].v;
    const lightTap = Math.min(1, t / 250);
    drawFloor(g, cam, P.cells, P.PITCH, t, P.waves, { dot: mix(K.bg, K.text, 0.2), hot: K.accent, cool: K.lit || K.table },
      (c) => (Math.hypot(c.x - READER.x, c.z - READER.z) <= Math.max(front, 2.2 * lightTap) ? 1 : 0.25 * lightTap));

    // the room's edge, the door gap and the reader
    const ok = seg(t, 250, 1400);
    hairline(g, K.outline, ok);
    const per = [[DOOR.x - 1, 0, D / 2], [-W / 2, 0, D / 2], [-W / 2, 0, -D / 2], [W / 2, 0, -D / 2], [W / 2, 0, D / 2], [DOOR.x + 1, 0, D / 2]];
    path3(g, cam, per);
    let flash = 0;
    for (const p of people) flash = Math.max(flash, bump(seg(t, p.tap, p.tap + 260)));
    flash = Math.max(flash, bump(seg(t, P.TAP - 60, P.TAP + 400)));
    reader(g, cam, READER.x, READER.z, K.dim, flash, K.accent);
    text3(g, cam, typed("ENTRANCE", seg(t, 300, 800)), READER.x + 0.5, 0.05, READER.z + 0.2, 0.42, K.mono, K.dim, 1, "left");

    let linksNow = 0, hereNow = 0;
    if (P.target && !P.snap && t >= P.tMorph) {
      try { P.snap = matchTarget(P, P.target(), L); } catch (e) { P.target = null; }
    }
    const M = P.snap ? easeInOut(seg(t, P.tMorph, P.tFade)) : 0;
    if (M > 0) {            // the floor gives way to the page's ground, and the room glides onto the page's own plan
      g.globalAlpha = M; g.fillStyle = K.bg; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
      drawMorph(g, cam, P, K, M);
      hereNow = people.length; linksNow = tables.reduce((n, tb) => n + tb.pairs.length, 0) + P.cross.length;
    } else {
    // tables lift out of the floor as the wave reaches them, then settle; labels type in
    for (const tb of tables) {
      const k = easeInOut(seg(t, tb.tOn, tb.tOn + 550));
      if (k <= 0) continue;
      const y = 0.7 * bump(seg(t, tb.tOn, tb.tOn + 900));
      const lock = seg(t, tb.tLock, tb.tLock + 650);
      circle3(g, cam, tb.x, y, tb.z, tb.r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2, K.table, 1, 1.5);
      g.setLineDash([3, 6]); g.lineDashOffset = tb.spin * t * 0.02;
      circle3(g, cam, tb.x, y, tb.z, tb.r + 0.3, 0, Math.PI * 2, K.table, 0.5 * k);
      g.setLineDash([]);
      if (y > 0.04) { hairline(g, K.table, 0.5); path3(g, cam, [[tb.x - tb.r, 0, tb.z], [tb.x - tb.r, y, tb.z]]); path3(g, cam, [[tb.x + tb.r, 0, tb.z], [tb.x + tb.r, y, tb.z]]); }
      if (lock > 0 && lock < 1) circle3(g, cam, tb.x, 0, tb.z, tb.r + 0.3 + easeOut(lock) * 1.4, 0, Math.PI * 2, K.table, 0.9 * (1 - lock));
      text3(g, cam, typed(tb.label, seg(t, tb.tOn + 250, tb.tOn + 650)), tb.x, 0, tb.z - tb.r - 0.75, 0.5, K.mono, K.text, 1);
      tb.pairs.forEach(([a, b], i) => {
        const q = easeOut(seg(t, tb.tLines + i * 80, tb.tLines + i * 80 + 300));
        if (q >= 1) linksNow++;
        arc3(g, cam, { x: a.x, y: 0.85, z: a.z }, { x: b.x, y: 0.85, z: b.z }, 0.45, q, K.table, 0.95, 1.2);
      });
    }
    for (const c of P.cross) {
      const q = easeOut(seg(t, c.t0, c.t0 + 420));
      if (q >= 1) linksNow++;
      g.setLineDash([5, 5]);
      arc3(g, cam, { x: c.a.x, y: 0.85, z: c.a.z }, { x: c.b.x, y: 0.85, z: c.b.z }, 1.8, q, K.link, 1);
      g.setLineDash([]);
    }

    // people: tap, walk in with a trail, land with a ring on the floor
    const live = people.filter((p) => t >= p.t0).map((p) => {
      const k = easeOut(seg(t, p.t0, p.t1));
      return { p, k, q: walkAt(p, k) };
    });
    live.sort((a, b) => a.q.z - b.q.z);
    for (const { p, k, q } of live) {
      if (k < 1) trail3(g, cam, p, k, K.dim, 0.8); else hereNow++;
      pin(g, cam, q.x, q.z, 0, p.table ? K.person : K.solo, 1, 0.85);
      const pk = seg(t, p.t1, p.t1 + 600);
      if (pk > 0 && pk < 1) circle3(g, cam, p.x, 0, p.z, 0.15 + easeOut(pk) * 0.9, 0, Math.PI * 2, p.table ? K.table : K.solo, 0.9 * (1 - pk));
      if (p.table && pk >= 1) circle3(g, cam, p.x, 0, p.z, 0.22, 0, Math.PI * 2, K.table, 0.8);
    }
    }

    // the wall's big "here now" number, counting what actually walked in: top right, or in the page's side column
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    const s = Math.min(w / 1600, h / 900) * 1.15;
    const SD = P.page && P.page.side, ST = P.page && P.page.strip;
    if (SD) {                       // the side column and the strip, already in place, in the page's own colours
      g.globalAlpha = 1; g.fillStyle = SD.bg && SD.bg !== "rgba(0, 0, 0, 0)" ? SD.bg : K.bg;
      g.fillRect(SD.x, SD.y, SD.w, SD.h);
      hairline(g, SD.line || K.outline, 1); g.beginPath(); g.moveTo(SD.x + 0.5, SD.y); g.lineTo(SD.x + 0.5, SD.y + SD.h); g.stroke();
      if (ST) {
        g.globalAlpha = 1; g.fillStyle = ST.bg && ST.bg !== "rgba(0, 0, 0, 0)" ? ST.bg : K.bg; g.fillRect(ST.x, ST.y, ST.w, ST.h);
        hairline(g, ST.line || K.outline, 1); g.beginPath(); g.moveTo(ST.x, ST.y + 0.5); g.lineTo(ST.x + ST.w, ST.y + 0.5); g.stroke();
      }
    }
    if (SD) { g.globalAlpha = 1; return; }
    const HT = SD ? { text: SD.fg || K.text, dim: SD.muted || K.dim, line: SD.line || K.outline } : { text: K.text, dim: K.dim, line: K.outline };
    const hk = seg(t, 200, 600), rx = SD ? SD.x + SD.w - SD.w * 0.08 : w * 0.95, lx = SD ? SD.x + SD.w * 0.08 : w * 0.85;
    g.globalAlpha = hk; g.textAlign = "right";
    g.fillStyle = HT.text; g.font = `600 ${Math.max(30, 52 * s)}px ${K.mono}`;
    g.fillText(String(hereNow), rx, (SD ? SD.y : 0) + h * 0.13);
    g.fillStyle = HT.dim; g.font = `400 ${Math.max(13, 17 * s)}px ${K.sans}`;
    g.fillText("here now", rx, (SD ? SD.y : 0) + h * 0.13 + Math.max(18, 24 * s));
    const tablesNow = tables.filter((tb) => t >= tb.tOn + 300).length;
    g.font = `500 ${Math.max(11, 13 * s)}px ${K.mono}`;
    [["TABLES", tablesNow], ["LINKS", linksNow], ["TAPS", people.filter((p) => t >= p.tap).length + (t >= P.TAP ? 1 : 0)]].forEach(([label, v], i) => {
      const y = (SD ? SD.y : 0) + h * 0.27 + i * Math.max(22, 30 * s);
      g.fillStyle = HT.dim; g.textAlign = "left"; g.fillText(label, lx, y);
      g.fillStyle = HT.text; g.textAlign = "right"; g.fillText(String(v).padStart(2, "0"), rx, y);
      hairline(g, HT.line, 0.8 * hk); g.beginPath(); g.moveTo(lx, y + 9 * s); g.lineTo(rx, y + 9 * s); g.stroke();
    });
    g.textAlign = "left"; g.fillStyle = ST ? (ST.muted || HT.dim) : K.dim; g.font = `500 ${Math.max(11, 12 * s)}px ${K.mono}`;
    g.fillText(typed(P.spec.generic ? "TAP IN · ROOM" : "TAP IN · LIVE ROOM", seg(t, 150, 650)), ST ? ST.x + 24 : w * 0.05, ST ? ST.y + ST.h / 2 + 4 : h * 0.965);
    g.globalAlpha = 1;
  }

  global.TapInIntro = {
    signIn,
    map,
    // Demo-page helpers, not for production pages.
    _reset() { mapPlayed = false; try { sessionStorage.removeItem(SIGNIN_KEY); } catch (e) { /* ignore */ } },
  };
})(window);
