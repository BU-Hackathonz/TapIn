// Bell on arrival, pluck per new link. Silent until Start is clicked (browsers block audio before a gesture).
const Sound = (() => {
  const PENTA = ["C5", "D5", "E5", "G5", "A5", "C6"];
  let bell, pluck, on = false, lastPluck = 0;

  async function start() {
    if (on || typeof Tone === "undefined") return;
    await Tone.start();
    const verb = new Tone.Reverb({ decay: 4, wet: 0.35 }).toDestination();
    bell = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3, modulationIndex: 6,
      envelope: { attack: 0.002, decay: 1.2, sustain: 0, release: 1.6 },
      modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 },
      volume: -14,
    }).connect(verb);
    pluck = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3800, resonance: 0.9, volume: -8 }).connect(verb);
    on = true;
  }

  const pick = () => PENTA[Math.floor(Math.random() * PENTA.length)];

  function arrive() {
    if (!on) return;
    bell.triggerAttackRelease(pick(), "2n");
  }

  // Several links land at once on a join: stagger them so they read as a little run, not a clash.
  function links(n) {
    if (!on || n <= 0) return;
    const t0 = Math.max(Tone.now(), lastPluck + 0.09);
    for (let i = 0; i < Math.min(n, 8); i++) {
      lastPluck = t0 + i * 0.09;
      pluck.triggerAttack(PENTA[(i * 2) % PENTA.length].replace("5", "4").replace("6", "5"), lastPluck);
    }
  }

  return { start, arrive, links };
})();
