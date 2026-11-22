// Interface sound for every Tap In page: plain Web Audio, no library, quiet on purpose. Browsers only allow sound after a click, tap
// or key press, so everything waits for the first one.
//
// What it does once a page loads it (UISound.setup is called for you with defaults; a page can call it again to change them):
//   - a very soft tick when the pointer moves onto a button or link, and a tick when one is clicked
//   - a soft tick when a text field is focused, and the faintest key click while typing
//   - a low soft note whenever an error message (role="alert") appears
//   - optional: a quiet city bed (a low warm hum and, now and then, a far-off trolley bell), with a small speaker button to turn
//     all sound off. The choice is remembered on this device (localStorage "tapin.uisound").
// Pages pick a sound for an element with data-snd="go|ok|end|tap|none", or with setup({ map: { selector: sound } }).
//   UISound.tap() / go() / ok() / no() / end() can also be called directly.
const UISound = (() => {
  let ctx = null, out = null, bed = null, unlocked = false, lastHover = 0, lastKey = 0;
  const cfg = { ambient: false, toggle: false, corner: "bottom-left", map: {} };
  const isOff = () => { try { return localStorage.getItem("tapin.uisound") === "off"; } catch { return false; } };
  const setOff = (v) => { try { localStorage.setItem("tapin.uisound", v ? "off" : "on"); } catch { /* private mode */ } };

  function audio() {
    if (isOff()) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain(); out.gain.value = 0.22; out.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  // one note: a quick attack and a soft tail
  function note(freq, at, len = 0.5, vol = 1, type = "sine") {
    const c = audio(); if (!c || !unlocked) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
  }
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note number to Hz
  const S = {
    hover: () => { const n = performance.now(); if (n - lastHover < 70) return; lastHover = n; note(hz(91), 0, 0.04, 0.08, "sine"); },
    key: () => { const n = performance.now(); if (n - lastKey < 35) return; lastKey = n; note(hz(96) + Math.random() * 60, 0, 0.025, 0.05, "triangle"); },
    focus: () => note(hz(86), 0, 0.07, 0.14, "sine"),
    tap: () => note(hz(84), 0, 0.08, 0.32, "triangle"),
    go: () => { note(hz(76), 0, 0.45, 0.8); note(hz(72), 0.26, 0.8, 0.8); },          // the Green Line door chime
    ok: () => { note(hz(72), 0, 0.25, 0.6); note(hz(79), 0.12, 0.5, 0.7); },
    no: () => note(hz(55), 0, 0.35, 0.5, "triangle"),
    end: () => { note(hz(79), 0, 0.35, 0.6); note(hz(72), 0.18, 0.4, 0.6); note(hz(67), 0.36, 0.8, 0.6); },
    none: () => {},
  };

  // ---------------------------------------------------------------- the quiet city bed
  function bedStart() {
    if (bed || !cfg.ambient) return;
    const c = audio(); if (!c || !unlocked) return;
    // No low hum any more (it buzzed on small speakers): the "city" is just a far-off trolley bell every 20 to 45 seconds.
    const g = { gain: { setTargetAtTime() {}, exponentialRampToValueAtTime() {} } }, oscs = [];
    const bell = () => {                                               // a far-off trolley bell every 20 to 45 seconds
      if (!bed) return;
      if (!document.hidden) { note(hz(88), 0, 0.5, 0.05); note(hz(88), 0.24, 0.6, 0.04); }
      bed.timer = setTimeout(bell, 20000 + Math.random() * 25000);
    };
    bed = { g, oscs, timer: setTimeout(bell, 9000) };
  }
  function bedStop() {
    if (!bed) return;
    const b = bed; bed = null; clearTimeout(b.timer);
    try { b.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8); } catch { /* closed */ }
    setTimeout(() => b.oscs.forEach(([o, l]) => { try { o.stop(); l.stop(); } catch { /* already stopped */ } }), 1000);
  }
  document.addEventListener("visibilitychange", () => { if (bed && ctx) bed.g.gain.setTargetAtTime(document.hidden ? 0.0001 : 0.16, ctx.currentTime, 0.4); });

  // ---------------------------------------------------------------- the speaker button
  let btn = null;
  const ICON_ON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  function drawToggle() {
    if (!btn) return;
    const off = isOff();
    btn.innerHTML = off ? ICON_OFF : ICON_ON;   // static icon markup
    btn.setAttribute("aria-pressed", String(!off));
    btn.setAttribute("aria-label", off ? "Sound is off. Turn sound on" : "Sound is on. Turn sound off");
    btn.title = off ? "Sound off" : "Sound on";
  }
  function makeToggle() {
    if (btn || !cfg.toggle) return;
    btn = document.createElement("button"); btn.type = "button"; btn.className = "uis-toggle"; btn.dataset.snd = "none";
    btn.addEventListener("click", () => {
      const off = !isOff(); setOff(off);
      if (off) bedStop(); else { unlocked = true; S.ok(); bedStart(); }
      drawToggle();
    });
    const pos = { "bottom-left": "left: max(14px, env(safe-area-inset-left, 0px)); bottom: max(14px, env(safe-area-inset-bottom, 0px));",
                  "bottom-right": "right: max(14px, env(safe-area-inset-right, 0px)); bottom: max(14px, env(safe-area-inset-bottom, 0px));",
                  "top-right": "right: max(12px, env(safe-area-inset-right, 0px)); top: max(10px, env(safe-area-inset-top, 0px));",
                  "top-left": "left: max(12px, env(safe-area-inset-left, 0px)); top: max(10px, env(safe-area-inset-top, 0px));" }[cfg.corner] || "";
    const css = document.createElement("style");
    css.textContent = `.uis-toggle { position: fixed; ${pos} z-index: 60; width: 36px; height: 36px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%;
      background: rgba(17, 17, 17, 0.55); color: #fff; cursor: pointer; transition: background .2s ease; }
      .uis-toggle:hover { background: rgba(17, 17, 17, 0.8); } .uis-toggle:focus-visible { outline: 2px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 4px #003DA5; }
      .uis-toggle[aria-pressed="false"] { background: rgba(17, 17, 17, 0.35); }`;
    document.head.append(css); document.body.append(btn); drawToggle();
  }

  // ---------------------------------------------------------------- wiring
  const INTERACTIVE = "a[href], button, [role=button], summary, label.choice, input[type=checkbox], input[type=radio], select";
  const soundFor = (el) => {
    const d = el.closest("[data-snd]"); if (d) return d.dataset.snd;
    for (const [sel, s] of Object.entries(cfg.map)) if (el.closest(sel)) return s;
    return "tap";
  };
  function unlock() {
    if (unlocked) return;
    unlocked = true; audio(); bedStart();
  }
  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener("pointerover", (e) => {
      if (e.pointerType === "touch") return;
      const t = e.target.closest && e.target.closest(INTERACTIVE);
      if (!t || t.disabled || (e.relatedTarget && t.contains(e.relatedTarget))) return;
      if (soundFor(t) !== "none") S.hover();
    });
    document.addEventListener("click", (e) => {
      const t = e.target.closest && e.target.closest(INTERACTIVE);
      if (!t || t.disabled) return;
      (S[soundFor(t)] || S.tap)();
    }, true);
    document.addEventListener("focusin", (e) => { if (e.target.matches && e.target.matches("input[type=text], input[type=email], input[type=password], input[type=number], input[type=date], input[type=time], input:not([type]), textarea")) S.focus(); });
    document.addEventListener("input", (e) => { if (e.target.matches && e.target.matches("input, textarea") && e.inputType && e.inputType.startsWith("insert")) S.key(); });
    // any error message that appears plays the soft low note
    const seen = new WeakMap();
    new MutationObserver(() => {
      for (const a of document.querySelectorAll('[role="alert"]')) {
        const txt = a.hidden ? "" : a.textContent.trim();
        if (txt && txt !== seen.get(a)) S.no();
        seen.set(a, txt);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
  }
  function setup(opts = {}) {
    Object.assign(cfg, opts, { map: { ...cfg.map, ...(opts.map || {}) } });
    const go = () => { wire(); makeToggle(); if (unlocked) bedStart(); };
    if (document.body) go(); else addEventListener("DOMContentLoaded", go);
  }
  setup();
  return { ...S, setup, hover: S.hover };
})();
