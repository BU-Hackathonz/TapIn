// Sound for the host wall (host.html only; the room map keeps sound.js). Every note comes from one pentatonic scale (C D E G A over
// two octaves), as the spec asks, so overlapping sounds never clash however busy the room gets.
//   tap in      -> a bell in that person's note (person id % 10, the spec's rule), or a soft pluck in quiet mode
//   new link    -> a pluck of the two people's notes together
//   table forms / someone joins -> one pluck per new link, 120 ms apart, a quick rising run in that table's part of the scale
//   mentor help -> a low warm chord from the scale (one soft pluck in quiet mode)
//   help asked  -> two quiet rising notes (a raised hand)
//   every 10th person here -> a trolley bell, two dings (event mode only)
//   the room    -> a very quiet pad, one note when nearly empty, up to five as it fills (event mode only)
// Modes (spec: switched by Spark staff): "event" plays everything; "quiet" is for study hours: no bell on check-ins, plucks for groups.
// Silent until the page gets a click or key press (browsers block sound before that).
const Sound = (() => {
  const SCALE = ["C4", "D4", "E4", "G4", "A4", "C5", "D5", "E5", "G5", "A5"];          // ten notes, person id % 10
  const LOW = ["C3", "D3", "E3", "G3", "A3"];
  const BED = ["C3", "G3", "D4", "E4", "A4"];
  let on = false, muted = false, mode = "event", master, bell, chime, pluck, warm, soft, trolley, pad, bedNotes = [], lastAt = 0;
  const mod = (n, m) => ((Math.round(Number(n) || 0) % m) + m) % m;
  const noteOf = (pid) => SCALE[mod(pid, SCALE.length)];
  const tableRun = (gid, n) => { const s = mod(gid, 5); return Array.from({ length: n }, (_, i) => SCALE[Math.min(SCALE.length - 1, s + i)]); };

  async function start() {
    if (on || typeof Tone === "undefined") return;
    await Tone.start();
    master = new Tone.Volume(-4).toDestination(); master.mute = muted;
    const limiter = new Tone.Limiter(-3).connect(master);
    const verb = new Tone.Reverb({ decay: 4, wet: 0.35 }).connect(limiter);
    bell = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3, modulationIndex: 6, envelope: { attack: 0.002, decay: 1.2, sustain: 0, release: 1.6 },
      modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 }, volume: -12 }).connect(verb);
    chime = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.005, decay: 0.9, sustain: 0.05, release: 1.4 }, volume: -12 }).connect(verb);
    pluck = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.4 }, volume: -9 }).connect(verb);
    warm = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 1.5, modulationIndex: 2, envelope: { attack: 0.02, decay: 2.5, sustain: 0.1, release: 3 }, volume: -16 }).connect(verb);
    soft = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.03, decay: 0.4, sustain: 0, release: 0.6 }, volume: -18 }).connect(verb);
    trolley = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.5, release: 0.3 }, harmonicity: 5.1, modulationIndex: 16, resonance: 3200, octaves: 1.2, volume: -26 }).connect(verb);
    trolley.frequency.value = 520;
    pad = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 2, envelope: { attack: 4, decay: 1, sustain: 0.8, release: 6 }, volume: -36 }).connect(verb);
    on = true;
    if (pendingCrowd != null) crowd(pendingCrowd);
  }

  // Sounds that land together are spread out a little, so two events never blur into one noise.
  const at = (gap = 0.35) => { const t = Math.max(Tone.now() + 0.03, lastAt + gap); lastAt = t; return t; };
  const ok = () => on && !muted;
  const quiet = () => mode === "quiet";

  // Someone taps in: the bell in their own note (a soft pluck of it in quiet mode).
  function arrive(pid) {
    if (!ok()) return;
    const n = pid != null ? noteOf(pid) : "E5";
    if (quiet()) { pluck.triggerAttackRelease(n, 0.2, at(), 0.35); return; }
    bell.triggerAttackRelease(n, "2n", at());
  }
  // One pluck per new link, 120 ms apart; each link plays both people's notes when we know them.
  function linkRun(gid, links, pairs) {
    const t = at(0.5), count = Math.max(1, Math.min(links || 1, 8));
    const notes = tableRun(gid, count);
    for (let i = 0; i < count; i++) {
      const pair = pairs && pairs[i];
      pluck.triggerAttackRelease(pair ? [noteOf(pair[0]), noteOf(pair[1])] : notes[i], 0.25, t + i * 0.12);
    }
    return t + count * 0.12;
  }
  function formed(gid, links = 1, pairs) {
    if (!ok()) return;
    const end = linkRun(gid, links, pairs);
    if (!quiet()) { const s = mod(gid, 5); warm.triggerAttackRelease([LOW[s], SCALE[s + 2]], 2, end + 0.05); }   // the table settles in
  }
  function joined(gid, links = 1, pairs) { if (ok()) linkRun(gid, links, pairs); }
  function help(gid) {
    if (!ok()) return;
    const s = mod(gid, 5);
    if (quiet()) { pluck.triggerAttackRelease(SCALE[s], 0.3, at()); return; }
    warm.triggerAttackRelease([LOW[s], SCALE[s], SCALE[s + 2]], 3, at(0.5));
  }
  function need() {
    if (!ok()) return;
    const t = at();
    soft.triggerAttackRelease("G4", 0.18, t); soft.triggerAttackRelease("C5", 0.35, t + 0.2);
  }
  function milestone() {
    if (!ok() || quiet()) return;
    const t = at(0.5);
    trolley.triggerAttackRelease("C6", 0.3, t); trolley.triggerAttackRelease("C6", 0.3, t + 0.22);
  }
  // The room bed: holds 1 to 5 notes depending on how many people are here; off in quiet mode.
  let pendingCrowd = null;
  function crowd(here) {
    pendingCrowd = here;
    return;   // the room bed is off: its low pad buzzed on small speakers. Event sounds carry the room.
    // eslint-disable-next-line no-unreachable
    if (!on) return;
    const want = here > 0 && !quiet() ? BED.slice(0, Math.max(1, Math.min(5, Math.ceil(here / 4)))) : [];
    if (want.length === bedNotes.length) return;
    const t = Tone.now() + 0.05;
    const drop = bedNotes.filter((n) => !want.includes(n)), add = want.filter((n) => !bedNotes.includes(n));
    if (drop.length) pad.triggerRelease(drop, t);
    if (add.length) pad.triggerAttack(add, t);
    bedNotes = want;
  }
  // kept for callers written for sound.js
  function links(n) { if (ok() && n > 0) linkRun(0, n); }

  function setMuted(m) { muted = m; if (master) master.mute = m; }
  function setMode(m) { mode = m === "quiet" ? "quiet" : "event"; if (pendingCrowd != null) { bedNotes.length && on && pad.releaseAll(); bedNotes = []; crowd(pendingCrowd); } }
  return { start, arrive, formed, joined, help, need, milestone, crowd, links, setMuted, setMode,
           get mode() { return mode; }, get muted() { return muted; }, get started() { return on; } };
})();
