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

  // =================================================================================================================
  // 1. Sign-in landing: "you arrive"
  // =================================================================================================================
  const SIGNIN_KEY = "tapin.intro.signin.v1";

  function signIn(container, opts) {
    opts = opts || {};
    try { if (sessionStorage.getItem(SIGNIN_KEY)) return Promise.resolve("already-played"); } catch (e) { /* private mode */ }
    const reduced = prefersReduced(opts);
    const soundOn = opts.sound !== false && !opts.quiet && !reduced;

    return new Promise((resolve) => {
      const L = makeLayer(container, opts.zIndex);
      const { g } = L;

      // Calm first screen: wordmark, the line, one big button. Real DOM, so it reads and tabs properly.
      const ui = document.createElement("div");
      ui.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;" +
        "justify-content:space-between;padding:12vh 24px 7vh;box-sizing:border-box;pointer-events:none;";
      ui.innerHTML =
        `<div style="text-align:center">` +
        `<div style="font-family:${MONO};font-weight:600;font-size:15px;letter-spacing:0.42em;margin-right:-0.42em;color:${C.text}">TAP&nbsp;IN</div>` +
        `<div style="margin-top:14px;font-size:20px;line-height:1.35;font-weight:500;color:${C.text}">Tap in.<br>Find the table that needs you.</div>` +
        `</div>` +
        `<button type="button" style="pointer-events:auto;min-height:52px;width:min(320px,100%);border:1px solid ${C.mint};` +
        `border-radius:0;background:${C.mint};color:${C.bg};font:600 17px ${SANS};letter-spacing:0.02em;cursor:pointer">Tap in</button>`;
      L.root.appendChild(ui);
      const btn = ui.querySelector("button");

      // A faint room: an outline with a door at the bottom, three tables, a few people.
      let room;
      function layout() {
        const w = L.w, h = L.h, s = Math.min(w / 390, h / 760);
        const box = { x: w * 0.08, y: h * 0.30, x2: w * 0.92, y2: h * 0.74 };
        const door = { x: w * 0.5, y: box.y2, half: 16 * s };
        const tables = [
          { x: w * 0.27, y: h * 0.39, r: 26 * s }, { x: w * 0.74, y: h * 0.37, r: 30 * s }, { x: w * 0.63, y: h * 0.60, r: 24 * s },
        ];
        const people = [];
        tables.forEach((t, ti) => {
          const k = [3, 4, 3][ti];
          for (let i = 0; i < k; i++) {
            const a = -Math.PI / 2 + (i / k) * Math.PI * 2 + ti * 0.6;
            people.push({ x: t.x + Math.cos(a) * (t.r + 9 * s), y: t.y + Math.sin(a) * (t.r + 9 * s), table: ti });
          }
        });
        [[0.18, 0.62], [0.34, 0.55], [0.86, 0.52]].forEach(([fx, fy]) => people.push({ x: w * fx, y: h * fy, table: -1 }));
        const you = { x: door.x, y: door.y - 22 * s };
        // The people you'll meet: one from each table, nearest first, so the ripple reaches them in order.
        const pick = [0, 1, 2].map((ti) => people.filter((p) => p.table === ti)
          .sort((a, b) => Math.hypot(a.x - you.x, a.y - you.y) - Math.hypot(b.x - you.x, b.y - you.y))[0]);
        pick.forEach((p) => { p.d = Math.hypot(p.x - you.x, p.y - you.y); p.meet = true; });
        pick.sort((a, b) => a.d - b.d);
        room = { s, box, door, tables, people, you, pick, rmax: pick[pick.length - 1].d + 30 * s };
      }
      layout();

      function drawRoom(t) {   // t: ms since the press, or -1 before it
        const { s, box, door, tables, people, you, pick, rmax } = room;
        g.globalAlpha = 1; g.fillStyle = C.bg; g.fillRect(0, 0, L.w, L.h);
        // room outline with a gap for the door
        hairline(g, C.grey, 0.55);
        g.beginPath();
        g.moveTo(door.x - door.half, box.y2); g.lineTo(box.x, box.y2); g.lineTo(box.x, box.y); g.lineTo(box.x2, box.y);
        g.lineTo(box.x2, box.y2); g.lineTo(door.x + door.half, box.y2); g.stroke();
        // tables: dim mint; a table lights up when someone at it connects to you
        tables.forEach((tb, ti) => {
          const p = pick.find((q) => q.table === ti);
          const lit = t < 0 ? 0 : easeOut(seg(t, p.tPass, p.tPass + 260));
          hairline(g, C.mint, 0.22 + 0.5 * lit);
          g.beginPath(); g.arc(tb.x, tb.y, tb.r, 0, Math.PI * 2); g.stroke();
        });
        if (t >= 0) {
          // ripples from you (raspberry hairlines)
          for (const r0 of [120, 290, 460]) {
            const k = seg(t, r0, r0 + 900);
            if (k <= 0 || k >= 1) continue;
            hairline(g, C.you, 0.85 * (1 - k));
            g.beginPath(); g.arc(you.x, you.y, 12 * s + easeOut(k) * rmax, 0, Math.PI * 2); g.stroke();
          }
          // lines back to you, drawn from them towards you
          for (const p of pick) {
            const k = easeOut(seg(t, p.tPass, p.tPass + 300));
            if (k <= 0) continue;
            hairline(g, C.mint, 0.9);
            g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + (you.x - p.x) * k, p.y + (you.y - p.y) * k); g.stroke();
          }
        }
        // people: grey, the ones you'll meet turn mint as the ripple passes
        for (const p of people) {
          const k = p.meet && t >= 0 ? seg(t, p.tPass, p.tPass + 160) : 0;
          dot(g, p.x, p.y, 3.2 * s, C.grey, 1 - k);
          if (k > 0) dot(g, p.x, p.y, 3.2 * s + 0.8 * s * k, C.mint, k);
        }
        if (t >= 0) {
          // you: a raspberry dot with a ring, so it never relies on colour alone
          const k = easeOut(seg(t, 0, 220));
          dot(g, you.x, you.y, 5.5 * s * k, C.you, 1);
          hairline(g, C.you, k, 1.5);
          g.beginPath(); g.arc(you.x, you.y, 11 * s * k + 0.01, 0, Math.PI * 2); g.stroke();
        }
        g.globalAlpha = 1;
      }

      const onResize = () => { L.resize(); layout(); setTimes(); if (!started) drawRoom(-1); };
      global.addEventListener("resize", onResize);
      function setTimes() { for (const p of room.pick) p.tPass = 120 + 900 * (p.d / room.rmax); }
      setTimes();
      drawRoom(-1);
      if (soundOn) btn.addEventListener("pointerenter", () => Audio.warm(["bellC5"]), { once: true });

      let started = false, raf = 0, done = false, stopSkip = () => {};
      function finish(tag) {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf); stopSkip(); global.removeEventListener("resize", onResize);
        L.root.remove();
        resolve(tag || "done");
      }

      btn.addEventListener("click", () => {
        if (started) return;
        started = true;
        try { sessionStorage.setItem(SIGNIN_KEY, "1"); } catch (e) { /* ignore */ }
        btn.disabled = true;
        if (reduced) {           // 300 ms fade, nothing else
          L.root.style.transition = "opacity 300ms linear"; L.root.style.opacity = "0";
          setTimeout(() => finish("reduced"), 320);
          return;
        }
        if (soundOn) { Audio.unlock(); Audio.bell(); }
        setTimeout(() => { stopSkip = onSkip(() => finish("skipped")); }, 0);   // the press itself is not a skip
        const t0 = now(), plucked = new Set();
        const SLIDE = 1150, END = 1500;
        (function frame() {
          const t = now() - t0;
          ui.style.opacity = String(1 - easeOut(seg(t, 0, 180)));
          drawRoom(t);
          room.pick.forEach((p, i) => { if (t >= p.tPass && !plucked.has(i)) { plucked.add(i); if (soundOn) Audio.pluck(i * 2); } });
          const k = easeInOut(seg(t, SLIDE, END));
          L.root.style.transform = k > 0 ? `translate3d(0,${-k * 100}%,0)` : "";
          if (t >= END) return finish("done");
          raf = requestAnimationFrame(frame);
        })();
      });
    });
  }

  // =================================================================================================================
  // 2. Map opening: "the room fills up"
  // =================================================================================================================
  let mapPlayed = false;

  async function readRoom(url) {
    const generic = { tables: [4, 3, 3, 2], solos: 3, generic: true };
    if (!url) return generic;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 700);
    try {
      const r = await fetch(url, { signal: ctrl && ctrl.signal, cache: "no-store" });
      if (!r.ok) return generic;
      const data = await r.json();
      const here = (data.people || []).filter((p) => p.here);
      const sizes = {};
      let solos = 0;
      for (const p of here) { if (p.group_id != null) sizes[p.group_id] = (sizes[p.group_id] || 0) + 1; else solos++; }
      const tables = Object.values(sizes).sort((a, b) => b - a).slice(0, 8).map((n) => Math.min(n, 8));
      if (!tables.length && !solos) return generic;          // an empty room makes no intro: show a small one
      return { tables, solos: Math.min(solos, 12), generic: false };
    } catch (e) {
      return generic;
    } finally {
      clearTimeout(timer);
    }
  }

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

      readRoom(opts.graphUrl === undefined ? "/api/graph" : opts.graphUrl).then((spec) => {
        if (done) return;
        if (soundOn) Audio.warm(["pluckC4", "pluckD4", "pluckE4", "pluckG4", "pluckA4", "pluckC5"]);
        const P = plan(spec, L.w, L.h);
        const t0 = now(), belled = new Set(), ran = new Set();
        let lastBell = -1e9, bells = 0;
        (function frame() {
          if (done) return;
          const t = now() - t0;
          draw(g, L, P, t);
          for (const p of P.people) {            // one bell per arrival, thinned when a crowd walks in
            if (t >= p.t1 && !belled.has(p)) {
              belled.add(p);
              if (soundOn && t - lastBell > 140 && bells < 10) { Audio.bell(); lastBell = t; bells++; }
            }
          }
          for (const tb of P.tables) {            // each group's lines land as a quick rising run
            if (t >= tb.tLines && !ran.has(tb) && tb.pairs.length) { ran.add(tb); if (soundOn) Audio.run(tb.pairs.length, 0.09); }
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
    const area = { x: w * 0.12, y: h * 0.14, w: w * 0.76, h: h * 0.56 };
    const door = { x: w * 0.5, y: h * 0.9, half: 26 * s };
    const people = [];
    const tables = spec.tables.map((size, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const inRow = Math.min(cols, n - r * cols);
      const x = area.x + area.w * ((c + 0.5 + (cols - inRow) / 2) / cols);
      const y = area.y + area.h * ((r + 0.5) / rows);
      const rad = (30 + 5 * size) * s;
      const label = "TABLE " + String(i + 1).padStart(2, "0");
      const tb = { x, y, r: rad, label, tDraw: 150 + i * 120, seats: [], pairs: [] };
      for (let k = 0; k < size; k++) {
        const a = -Math.PI / 2 + (k / size) * Math.PI * 2 + i * 0.5;
        const seat = { x: x + Math.cos(a) * (rad + 14 * s), y: y + Math.sin(a) * (rad + 14 * s), table: tb };
        tb.seats.push(seat); people.push(seat);
      }
      return tb;
    });
    for (let k = 0; k < spec.solos; k++) {
      const side = k % 2 ? 1 : -1, j = Math.floor(k / 2);
      people.push({ x: w * 0.5 + side * (w * 0.12 + j * 46 * s), y: h * 0.8, table: null });
    }
    // Walk in from the door, one after another; the whole room is in by about 2.3 s.
    const start = 650, span = Math.min(1600, people.length * 110), stagger = people.length > 1 ? span / (people.length - 1) : 0;
    const order = people.map((p, i) => i).sort((a, b) => (people[a].y - people[b].y) || (people[a].x - people[b].x));
    order.forEach((idx, k) => {
      const p = people[idx];
      p.t0 = start + k * stagger; p.t1 = p.t0 + 620;
      p.cx = (door.x + p.x) / 2 + (p.x < door.x ? -1 : 1) * 40 * s;   // a gentle curve, not a straight line
      p.cy = (door.y + p.y) / 2 + 30 * s;
    });
    let last = 0;
    for (const tb of tables) {
      const arrived = Math.max(...tb.seats.map((p) => p.t1));
      tb.tLines = arrived + 80;
      for (let a = 0; a < tb.seats.length; a++) for (let b = a + 1; b < tb.seats.length; b++) tb.pairs.push([tb.seats[a], tb.seats[b]]);
      tb.pairs = tb.pairs.slice(0, 8);
      last = Math.max(last, tb.tLines + tb.pairs.length * 90 + 240);
    }
    last = Math.max(last, ...people.map((p) => p.t1));
    const tFade = Math.min(Math.max(last + 250, 2900), 3500);
    return { s, door, tables, people, tFade, tEnd: tFade + 450 };
  }

  function draw(g, L, P, t) {
    const { s, door, tables, people } = P;
    g.globalAlpha = 1; g.fillStyle = C.bg; g.fillRect(0, 0, L.w, L.h);
    // the room, with its door
    const inK = easeOut(seg(t, 0, 320));
    hairline(g, C.grey, 0.5 * inK);
    const bx = L.w * 0.06, by = L.h * 0.06, bx2 = L.w * 0.94;
    g.beginPath();
    g.moveTo(door.x - door.half, door.y); g.lineTo(bx, door.y); g.lineTo(bx, by); g.lineTo(bx2, by);
    g.lineTo(bx2, door.y); g.lineTo(door.x + door.half, door.y); g.stroke();
    // tables: the outline draws itself, then its label types in
    g.font = `500 ${Math.max(11, 13 * s)}px ${MONO}`; g.textAlign = "center"; g.textBaseline = "alphabetic";
    for (const tb of tables) {
      const k = easeInOut(seg(t, tb.tDraw, tb.tDraw + 450));
      if (k <= 0) continue;
      hairline(g, C.mint, 0.85);
      g.beginPath(); g.arc(tb.x, tb.y, tb.r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke();
      const chars = Math.floor(seg(t, tb.tDraw + 270, tb.tDraw + 270 + tb.label.length * 30) * tb.label.length);
      if (chars > 0) {
        g.globalAlpha = 0.85; g.fillStyle = C.mint;
        g.fillText(tb.label.slice(0, chars), tb.x, tb.y - tb.r - 24 * s);
      }
      // lines inside the group, drawn one by one as the run plays
      tb.pairs.forEach(([a, b], i) => {
        const q = easeOut(seg(t, tb.tLines + i * 90, tb.tLines + i * 90 + 220));
        if (q <= 0) return;
        hairline(g, C.mint, 0.75);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q); g.stroke();
      });
    }
    // people: they walk in through the door and settle; at a table they turn mint
    for (const p of people) {
      if (t < p.t0) continue;
      const k = easeOut(seg(t, p.t0, p.t1)), u = 1 - k;
      const x = u * u * door.x + 2 * u * k * p.cx + k * k * p.x;
      const y = u * u * door.y + 2 * u * k * p.cy + k * k * p.y;
      const settled = seg(t, p.t1, p.t1 + 180);
      const r = 4 * s;
      dot(g, x, y, r, C.walker, 1 - (p.table ? settled : 0));
      if (p.table && settled > 0) dot(g, x, y, r, C.mint, settled);
    }
    g.globalAlpha = 1;
  }

  global.TapInIntro = {
    signIn,
    map,
    // Demo-page helpers, not for production pages.
    _reset() { mapPlayed = false; try { sessionStorage.removeItem(SIGNIN_KEY); } catch (e) { /* ignore */ } },
  };
})(window);
