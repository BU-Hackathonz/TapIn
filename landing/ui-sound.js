// Small interface sounds for the front door, the join steps and the host panel. Plain Web Audio, no library; every sound starts from a
// click or key press, so browsers allow it. Quiet on purpose.
//   UISound.tap()  a soft tick for choices and Back
//   UISound.go()   the Green Line door chime, for Join / Host / Create event / Join room
//   UISound.ok()   two rising notes, for a right PIN or a saved form
//   UISound.no()   one low soft note, for a wrong PIN or a missing field
//   UISound.end()  two falling notes, for End room and Leave room
const UISound = (() => {
  let ctx = null, out = null;
  const off = () => { try { return localStorage.getItem("tapin.uisound") === "off"; } catch { return false; } };
  function audio() {
    if (off()) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain(); out.gain.value = 0.22; out.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  // one note: a sine with a quick attack and a soft tail
  function note(freq, at, len = 0.5, vol = 1, type = "sine") {
    const c = audio(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
  }
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note to Hz
  return {
    tap: () => note(hz(84), 0, 0.08, 0.35, "triangle"),
    go: () => { note(hz(76), 0, 0.45, 0.8); note(hz(72), 0.26, 0.8, 0.8); },
    ok: () => { note(hz(72), 0, 0.25, 0.6); note(hz(79), 0.12, 0.5, 0.7); },
    no: () => note(hz(55), 0, 0.35, 0.5, "triangle"),
    end: () => { note(hz(79), 0, 0.35, 0.6); note(hz(72), 0.18, 0.4, 0.6); note(hz(67), 0.36, 0.8, 0.6); },
  };
})();
