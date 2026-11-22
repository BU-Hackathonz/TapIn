// Visual styles for the wall. CSS picks up body[data-theme]; the 3D canvas reads Theme.c (colours and stroke style).
// Minimal for now; ?theme=night|white|sketch|minimal|blueprint still switches for a look at the others.
const Theme = (() => {
  const SANS = '"IBM Plex Sans", sans-serif', MONO = '"IBM Plex Mono", monospace', HAND = '"Patrick Hand", "Comic Sans MS", cursive';
  const THEMES = {
    night: {
      label: "Night", swatch: ["#121212", "#7fe0bd", "#b8466f"],
      c: { regionFill: "rgba(127,224,189,0.05)", region: "#3a3a3a", link: "#8a8a8a", inner: "#7fe0bd", accent: "#b8466f",
           title: "#f2f2f2", need: "#7fe0bd", dim: "#8a8a8a", name: "#d6d6d6",
           student: "#f2f2f2", mentor: "#f2c46d", away: "#6b6b6b", join: "#7fe0bd", help: "#f2c46d",
           font: SANS, avatar: "face", rough: false, linkAlpha: 1 },
    },
    white: {
      label: "White", swatch: ["#fafafa", "#1f9e7a", "#c2185b"],
      c: { regionFill: "rgba(31,158,122,0.06)", region: "#d4d4d4", link: "#9a9a9a", inner: "#1f9e7a", accent: "#c2185b",
           title: "#151515", need: "#1f8a6b", dim: "#8a8a8a", name: "#3a3a3a",
           student: "#262626", mentor: "#d08a00", away: "#c4c4c4", join: "#1f9e7a", help: "#d08a00",
           font: SANS, avatar: "face", rough: false, linkAlpha: 1.2 },
    },
    sketch: {
      label: "Sketch", swatch: ["#f6f1e4", "#2b2b2b", "#d1495b"],
      c: { regionFill: "rgba(250,220,120,0.18)", region: "#4a4a4a", link: "#6d6d6d", inner: "#2b2b2b", accent: "#d1495b",
           title: "#1d1d1d", need: "#2f6f5e", dim: "#7a7a7a", name: "#333",
           student: "#2b2b2b", mentor: "#c9822b", away: "#b9b2a3", join: "#2f6f5e", help: "#c9822b",
           font: HAND, avatar: "pencil", rough: true, linkAlpha: 1.3 },
    },
    minimal: {
      label: "Minimal", swatch: ["#ffffff", "#111111", "#bdbdbd"],
      c: { regionFill: "rgba(0,0,0,0)", region: "#e2e2e2", link: "#d0d0d0", inner: "#9a9a9a", accent: "#111111",
           title: "#111111", need: "#6b6b6b", dim: "#a8a8a8", name: "#555",
           student: "#111111", mentor: "#111111", away: "#d6d6d6", join: "#111111", help: "#111111",
           font: SANS, avatar: "face", rough: false, linkAlpha: 1 },
    },
    tin: {
      label: "Tin", swatch: ["#f3ece1", "#2f6d4e", "#e0367f"],
      c: { regionFill: "rgba(47,109,78,0.07)", region: "#2f6d4e", link: "#7d8f80", inner: "#2f6d4e", accent: "#e0367f",
           title: "#1d1a16", need: "#b4531f", dim: "#8c8579", name: "#3a352d",
           student: "#2f6d4e", mentor: "#c9822b", away: "#c9c0b0", join: "#2f6d4e", help: "#c9822b",
           font: SANS, avatar: "face", rough: false, linkAlpha: 1.25 },
    },
    blueprint: {
      label: "Blueprint", swatch: ["#123a6b", "#cfe8ff", "#ffd166"],
      c: { regionFill: "rgba(207,232,255,0.05)", region: "rgba(207,232,255,0.45)", link: "#9cc4ec", inner: "#e6f3ff", accent: "#ffd166",
           title: "#ffffff", need: "#ffd166", dim: "#9cc4ec", name: "#dcecff",
           student: "#e6f3ff", mentor: "#ffd166", away: "#5d82ad", join: "#e6f3ff", help: "#ffd166",
           font: MONO, avatar: "line", rough: false, linkAlpha: 1.1 },
    },
  };

  let current = "tin";
  const listeners = [];

  function set(name) {
    current = THEMES[name] ? name : "tin";
    document.body.dataset.theme = current;
    for (const fn of listeners) fn(current);
  }

  const initial = () => new URLSearchParams(location.search).get("theme") || "tin";

  return {
    get c() { return THEMES[current].c; },
    get name() { return current; },
    set, initial,
    list: () => Object.entries(THEMES).map(([id, t]) => ({ id, label: t.label, swatch: t.swatch })),
    onChange: (fn) => listeners.push(fn),
  };
})();
