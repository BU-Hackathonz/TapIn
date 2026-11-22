// Sound for the host wall (host.html only; the room map keeps sound.js). Same calls as sound.js (start, arrive, links, setMuted, muted,
// started) plus one sound per thing that happens in the room. Each table has its own key (table id mod 5), so a busy room sounds like
// a few chords and you can hear which table moved. From the sound lab:
//   tap in      -> two falling tones, like the Green Line door chime
//   table forms -> the table's chord rolls up, then holds softly
//   joins table -> four plucks climbing that table's chord
//   mentor help -> a low warm chord in the table's key
//   help asked  -> two quiet rising notes (a raised hand)
//   every 10th person here -> a trolley bell, two dings
//   the room    -> a very quiet pad, one note when nearly empty, up to five as it fills
// Silent until the page gets a click or key press (browsers block sound before that).
const Sound = (() => {
  const KEYS = [["C4", "E4", "G4", "C5"], ["D4", "F#4", "A4", "D5"], ["F4", "A4", "C5", "F5"], ["G4", "B4", "D5", "G5"], ["A3", "C4", "E4", "A4"]];
  const BED = ["C3", "G3", "E4", "B4", "D5"];
  let on = false, muted = false, master, chime, mallet, pluck, warm, soft, trolley, pad, bedNotes = [], lastAt = 0;
  const keyOf = (gid) => KEYS[((Number(gid) || 0) % KEYS.length + KEYS.length) % KEYS.length];

  async function start() {
    if (on || typeof Tone === "undefined") return;
    await Tone.start();
    master = new Tone.Volume(-4).toDestination(); master.mute = muted;
    const limiter = new Tone.Limiter(-3).connect(master);
    const verb = new Tone.Reverb({ decay: 4, wet: 0.35 }).connect(limiter);
    chime = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.005, decay: 0.9, sustain: 0.05, release: 1.4 }, volume: -12 }).connect(verb);
    mallet = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.003, decay: 0.35, sustain: 0, release: 0.5 }, volume: -10 }).connect(verb);
    pluck = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3800, resonance: 0.9, volume: -8 }).connect(verb);
    warm = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 1.5, modulationIndex: 2, envelope: { attack: 0.02, decay: 2.5, sustain: 0.1, release: 3 }, volume: -16 }).connect(verb);
    soft = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.03, decay: 0.4, sustain: 0, release: 0.6 }, volume: -18 }).connect(verb);
    trolley = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.5, release: 0.3 }, harmonicity: 5.1, modulationIndex: 16, resonance: 3200, octaves: 1.2, volume: -26 }).connect(verb);
    trolley.frequency.value = 520;
    pad = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 2, envelope: { attack: 4, decay: 1, sustain: 0.8, release: 6 }, volume: -36 }).connect(verb);
    on = true;
    if (pendingCrowd != null) crowd(pendingCrowd);
  }

  // Sounds that land together are spread out a little, so two events never clash into one noise.
  const at = (gap = 0.35) => { const t = Math.max(Tone.now() + 0.03, lastAt + gap); lastAt = t; return t; };
  const ok = () => on && !muted;

  function arrive(gid) {
    if (!ok()) return;
    const t = at();
    if (gid != null) { const k = keyOf(gid); chime.triggerAttackRelease(k[3], 0.5, t); chime.triggerAttackRelease(k[2], 0.9, t + 0.32); }
    else { chime.triggerAttackRelease("E5", 0.5, t); chime.triggerAttackRelease("C5", 0.9, t + 0.32); }
  }
  function formed(gid) {
    if (!ok()) return;
    const t = at(0.5), k = keyOf(gid);
    k.forEach((note, i) => mallet.triggerAttackRelease(note, 0.6, t + i * 0.11));
    warm.triggerAttackRelease([k[0], k[2]], 2.2, t + 0.45);
  }
  function joined(gid, n = 1) {
    if (!ok()) return;
    const t = at(), k = keyOf(gid), steps = Math.min(4, 2 + n);
    for (let i = 0; i < steps; i++) pluck.triggerAttack(k[i], t + i * 0.08);
  }
  function help(gid) {
    if (!ok()) return;
    const k = keyOf(gid);
    warm.triggerAttackRelease([Tone.Frequency(k[0]).transpose(-12).toNote(), k[0], k[2]], 3, at(0.5));
  }
  function need() {
    if (!ok()) return;
    const t = at();
    soft.triggerAttackRelease("G4", 0.18, t); soft.triggerAttackRelease("C5", 0.35, t + 0.2);
  }
  function milestone() {
    if (!ok()) return;
    const t = at(0.5);
    trolley.triggerAttackRelease("C6", 0.3, t); trolley.triggerAttackRelease("C6", 0.3, t + 0.22);
  }
  // The room bed: holds 1 to 5 notes depending on how many people are here; changes only when the count of notes changes.
  let pendingCrowd = null;
  function crowd(here) {
    pendingCrowd = here;
    if (!on) return;
    const want = here > 0 ? BED.slice(0, Math.max(1, Math.min(5, Math.ceil(here / 4)))) : [];
    if (want.length === bedNotes.length) return;
    const t = Tone.now() + 0.05;
    const drop = bedNotes.filter((n) => !want.includes(n)), add = want.filter((n) => !bedNotes.includes(n));
    if (drop.length) pad.triggerRelease(drop, t);
    if (add.length) pad.triggerAttack(add, t);
    bedNotes = want;
  }
  // kept for callers written for sound.js
  function links(n) { if (ok() && n > 0) joined(null, Math.min(n, 2)); }

  function setMuted(m) {
    muted = m;
    if (master) master.mute = m;
  }
  return { start, arrive, formed, joined, help, need, milestone, crowd, links, setMuted, get muted() { return muted; }, get started() { return on; } };
})();
