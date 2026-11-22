// Visual styles for the wall. CSS picks up body[data-theme]; the 3D canvas reads Theme.c (colours and stroke style).
// Minimal for now; ?theme=night|white|sketch|minimal|blueprint still switches for a look at the others.
const Theme = (() => {
  const HV = '"Helvetica Neue", Helvetica, Arial, sans-serif', SANS = '"IBM Plex Sans", sans-serif', MONO = '"IBM Plex Mono", monospace', HAND = '"Patrick Hand", "Comic Sans MS", cursive';
  const THEMES = {
    night: {
      label: "Night", swatch: ["#121212", "#7fe0bd", "#b8466f"],
      c: { regionFill: "rgba(127,224,189,0.05)", region: "#3a3a3a", link: "#8a8a8a", inner: "#7fe0bd", accent: "#b8466f",
           title: "#f2f2f2", need: "#7fe0bd", dim: "#8a8a8a", name: "#d6d6d6",
           student: "#f2f2f2", mentor: "#f2c46d", away: "#6b6b6b", join: "#7fe0bd", help: "#f2c46d",
           font: SANS, avatar: "face", rough: false, known: "#3ccf7e", linkAlpha: 1 },
    },
    white: {
      label: "White", swatch: ["#fafafa", "#1f9e7a", "#c2185b"],
      c: { regionFill: "rgba(31,158,122,0.06)", region: "#d4d4d4", link: "#9a9a9a", inner: "#1f9e7a", accent: "#c2185b",
           title: "#151515", need: "#1f8a6b", dim: "#8a8a8a", name: "#3a3a3a",
           student: "#262626", mentor: "#d08a00", away: "#c4c4c4", join: "#1f9e7a", help: "#d08a00",
           font: SANS, avatar: "face", rough: false, known: "#1f9e5a", linkAlpha: 1.2 },
    },
    sketch: {
      label: "Sketch", swatch: ["#f6f1e4", "#2b2b2b", "#d1495b"],
      c: { regionFill: "rgba(250,220,120,0.18)", region: "#4a4a4a", link: "#6d6d6d", inner: "#2b2b2b", accent: "#d1495b",
           title: "#1d1d1d", need: "#2f6f5e", dim: "#7a7a7a", name: "#333",
           student: "#2b2b2b", mentor: "#c9822b", away: "#b9b2a3", join: "#2f6f5e", help: "#c9822b",
           font: HAND, avatar: "pencil", rough: true, known: "#2f8a4e", linkAlpha: 1.3 },
    },
    minimal: {
      label: "Minimal", swatch: ["#ffffff", "#111111", "#bdbdbd"],
      c: { regionFill: "rgba(0,0,0,0)", region: "#e2e2e2", link: "#d0d0d0", inner: "#9a9a9a", accent: "#111111",
           title: "#111111", need: "#6b6b6b", dim: "#a8a8a8", name: "#555",
           student: "#111111", mentor: "#111111", away: "#d6d6d6", join: "#111111", help: "#111111",
           font: SANS, avatar: "face", rough: false, known: "#16a35a", linkAlpha: 1 },
    },
    blueprint: {
      label: "Blueprint", swatch: ["#123a6b", "#cfe8ff", "#ffd166"],
      c: { regionFill: "rgba(207,232,255,0.05)", region: "rgba(207,232,255,0.45)", link: "#9cc4ec", inner: "#e6f3ff", accent: "#ffd166",
           title: "#ffffff", need: "#ffd166", dim: "#9cc4ec", name: "#dcecff",
           student: "#e6f3ff", mentor: "#ffd166", away: "#5d82ad", join: "#e6f3ff", help: "#ffd166",
           font: MONO, avatar: "line", rough: false, known: "#7cfc9a", linkAlpha: 1.1 },
    },
    // The host screen's Boston T look, five mockups (tlook.js, tlook.css). Tables are dashed rings like the host screen's plan.
    t1: {
      label: "T · Platform", swatch: ["#ecd9d2", "#2f6d4e", "#DA291C"],
      c: { regionFill: "rgba(0,0,0,0)", region: "#1b4a33", link: "#8a7a7c", inner: "#1b4a33", accent: "#d4151b",
           title: "#2b1f23", need: "#7a6066", dim: "#a88f93", name: "#3a2b2b",
           student: "#2f6d4e", mentor: "#2f6d4e", away: "#c9a99f", join: "#2f6d4e", help: "#ED8B00",
           font: HV, avatar: "face", rough: false, known: "#00843D", linkAlpha: 1.3, ringDash: [7, 6], ringWidth: 2.4 },
    },
    t2: {
      label: "T · Wayfinding", swatch: ["#1b1b1c", "#ffffff", "#ff4b3e"],
      c: { regionFill: "rgba(255,255,255,0.02)", region: "#8a8a8a", link: "#6a6a6a", inner: "#bdbdbd", accent: "#ff4b3e",
           title: "#ffffff", need: "#c4c4c4", dim: "#7a7a7a", name: "#e6e6e6",
           student: "#ffffff", mentor: "#ffa21a", away: "#4a4a4a", join: "#ffffff", help: "#ffa21a",
           font: HV, avatar: "face", rough: false, known: "#3ec777", linkAlpha: 1.2, ringDash: [7, 6], ringWidth: 2 },
    },
    t3: {
      label: "T · Line colours", swatch: ["#f4f3ef", "#003DA5", "#ED8B00"],
      c: { regionFill: "rgba(0,0,0,0)", region: "#111111", link: "#b5b3ac", inner: "#555555", accent: "#DA291C",
           title: "#111111", need: "#555555", dim: "#9a978f", name: "#222222",
           student: "#111111", mentor: "#111111", away: "#cfccc4", join: "#111111", help: "#ED8B00",
           font: HV, avatar: "face", rough: false, known: "#00843D", linkAlpha: 1.2, ringDash: [8, 5], ringWidth: 3,
           lines: ["#DA291C", "#ED8B00", "#003DA5", "#00843D"] },
    },
    t4: {
      label: "T · Red line", swatch: ["#ffffff", "#111111", "#DA291C"],
      c: { regionFill: "rgba(218,41,28,0.03)", region: "#111111", link: "#c4c4c4", inner: "#111111", accent: "#DA291C",
           title: "#111111", need: "#DA291C", dim: "#9a9a9a", name: "#222222",
           student: "#111111", mentor: "#DA291C", away: "#d4d4d4", join: "#111111", help: "#DA291C",
           font: HV, avatar: "face", rough: false, known: "#00843D", linkAlpha: 1.1, ringDash: [6, 6], ringWidth: 2 },
    },
    t5: {
      label: "T · Quiet", swatch: ["#e9e7e1", "#111111", "#00843D"],
      c: { regionFill: "rgba(255,255,255,0.35)", region: "#b9b6ad", link: "#c9c6bd", inner: "#8f8c84", accent: "#DA291C",
           title: "#111111", need: "#555555", dim: "#9a978f", name: "#333333",
           student: "#111111", mentor: "#111111", away: "#cfccc4", join: "#111111", help: "#ED8B00",
           font: HV, avatar: "face", rough: false, known: "#00843D", linkAlpha: 1, ringDash: [3, 5], ringWidth: 2 },
    },
  };

  let current = "minimal";
  const listeners = [];

  function set(name) {
    current = THEMES[name] ? name : "minimal";
    document.body.dataset.theme = current;
    for (const fn of listeners) fn(current);
  }

  const initial = () => new URLSearchParams(location.search).get("theme") || (typeof TLook !== "undefined" && TLook.theme()) || "minimal";

  return {
    get c() { return THEMES[current].c; },
    get name() { return current; },
    set, initial,
    list: () => Object.entries(THEMES).map(([id, t]) => ({ id, label: t.label, swatch: t.swatch })),
    onChange: (fn) => listeners.push(fn),
  };
})();
