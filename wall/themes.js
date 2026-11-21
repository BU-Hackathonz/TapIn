// Visual styles for the wall. CSS picks up body[data-theme]; the 3D canvas reads Theme.c (colours and stroke style).
// ?theme=night|white|sketch|minimal|blueprint wins, then the last choice on this device, then night.
const Theme = (() => {
  const SANS = '"IBM Plex Sans", sans-serif', MONO = '"IBM Plex Mono", monospace', HAND = '"Patrick Hand", "Comic Sans MS", cursive';
  const THEMES = {
    night: {
      label: "Night", swatch: ["#121212", "#7fe0bd", "#b8466f"],
      c: { regionFill: "rgba(127,224,189,0.05)", region: "#3a3a3a", link: "#8a8a8a", inner: "#7fe0bd", accent: "#b8466f",
           title: "#f2f2f2", need: "#7fe0bd", dim: "#8a8a8a", name: "#d6d6d6",
           student: "#f2f2f2", mentor: "#f2c46d", away: "#6b6b6b", join: "#7fe0bd", help: "#f2c46d",
           font: SANS, avatar: "color", rough: false, linkAlpha: 1 },
    },
    white: {
      label: "White", swatch: ["#fafafa", "#1f9e7a", "#c2185b"],
      c: { regionFill: "rgba(31,158,122,0.06)", region: "#d4d4d4", link: "#9a9a9a", inner: "#1f9e7a", accent: "#c2185b",
           title: "#151515", need: "#1f8a6b", dim: "#8a8a8a", name: "#3a3a3a",
           student: "#262626", mentor: "#d08a00", away: "#c4c4c4", join: "#1f9e7a", help: "#d08a00",
           font: SANS, avatar: "color", rough: false, linkAlpha: 1.2 },
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
           font: SANS, avatar: "mono", rough: false, linkAlpha: 1 },
    },
    blueprint: {
      label: "Blueprint", swatch: ["#123a6b", "#cfe8ff", "#ffd166"],
      c: { regionFill: "rgba(207,232,255,0.05)", region: "rgba(207,232,255,0.45)", link: "#9cc4ec", inner: "#e6f3ff", accent: "#ffd166",
           title: "#ffffff", need: "#ffd166", dim: "#9cc4ec", name: "#dcecff",
           student: "#e6f3ff", mentor: "#ffd166", away: "#5d82ad", join: "#e6f3ff", help: "#ffd166",
           font: MONO, avatar: "line", rough: false, linkAlpha: 1.1 },
    },
  };

  let current = "night";
  const listeners = [];

  function set(name) {
    current = THEMES[name] ? name : "night";
    document.body.dataset.theme = current;
    try { localStorage.setItem("wall.theme", current); } catch { /* private mode */ }
    for (const fn of listeners) fn(current);
  }

  function initial() {
    const q = new URLSearchParams(location.search).get("theme");
    let saved = null;
    try { saved = localStorage.getItem("wall.theme"); } catch { /* private mode */ }
    return q || saved || "night";
  }

  // Small picker: a button in the top-left corner that opens a list of swatches.
  function mountPicker() {
    const btn = document.getElementById("theme-btn"), menu = document.getElementById("theme-menu");
    for (const [id, t] of Object.entries(THEMES)) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.theme = id;
      const sw = document.createElement("span");
      sw.className = "sw";
      sw.style.background = `linear-gradient(135deg, ${t.swatch[0]} 0 50%, ${t.swatch[1]} 50% 80%, ${t.swatch[2]} 80%)`;
      b.append(sw, t.label);
      b.addEventListener("click", () => { set(id); menu.hidden = true; mark(); });
      menu.append(b);
    }
    const mark = () => { for (const b of menu.children) b.classList.toggle("on", b.dataset.theme === current); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; mark(); });
    addEventListener("click", (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
    mark();
  }

  return {
    get c() { return THEMES[current].c; },
    get name() { return current; },
    set, initial, mountPicker,
    onChange: (fn) => listeners.push(fn),
  };
})();
