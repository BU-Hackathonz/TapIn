// One corner tab for "you" and settings. Three placements to compare: ?corner=pill (default) | avatar | dock.
//   pill:   top-left pill with your face, name and a gear; the panel drops down under it.
//   avatar: round face with a small gear badge, bottom-left; the panel opens upward.
//   dock:   slim tab on the left edge; the panel slides out as a drawer.
// The wall has no sign-in, so "you" is a mock: the first person in the room.
const Corner = (() => {
  const GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  const state = { joins: true };
  let getS = () => null, tab = "you";

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // The profile saved by login.html, if this browser has one; otherwise the first person in the room.
  function saved() {
    try { return JSON.parse(localStorage.getItem("wall.me") || "null"); } catch { return null; }
  }
  function me() {
    const p = saved();
    if (p) return { id: -1, role: "student", points: 0, here: true, group_id: null, ...p };
    const S = getS();
    const people = S ? [...S.people.values()].filter((p) => p.role === "student") : [];
    return people.sort((a, b) => a.id - b.id)[0] || { id: 0, name: "You", role: "student", points: 0, here: true, group_id: null };
  }

  function renderTrigger() {
    const p = me(), btn = $("me-tab");
    btn.replaceChildren();
    const img = el("img", "me-pic");
    img.src = View3D.avatar(p).toDataURL();
    img.alt = "";
    const gear = el("span", "me-gear");
    gear.innerHTML = GEAR;   // static icon markup
    btn.append(img, el("span", "me-name", p.name), gear);
    btn.setAttribute("aria-label", `${p.name}: profile and settings`);
  }

  function toggleRow(label, value, onChange) {
    const row = el("label", "set-row");
    const input = el("input");
    input.type = "checkbox";
    input.checked = value;
    input.addEventListener("change", () => onChange(input.checked));
    row.append(el("span", "", label), input, el("span", "switch"));
    return row;
  }

  function renderBody() {
    const body = $("me-body");
    for (const b of document.querySelectorAll(".me-tabs button")) b.classList.toggle("on", b.dataset.tab === tab);
    if (tab === "you") {
      const p = me();
      const link = el("a", "me-edit", saved() ? "Edit your profile" : "Set up your profile");
      link.href = "login.html";
      body.replaceChildren(el("p", "me-note", saved() ? `Signed in as ${p.name}` : `Signed in as ${p.name} (mock)`), link,
                           ...View3D.buildProfile(p));
      return;
    }
    const styles = el("div", "set-styles");
    for (const t of Theme.list()) {
      const b = el("button", `set-style${t.id === Theme.name ? " on" : ""}`);
      b.type = "button";
      const sw = el("span", "sw");
      sw.style.background = `linear-gradient(135deg, ${t.swatch[0]} 0 50%, ${t.swatch[1]} 50% 80%, ${t.swatch[2]} 80%)`;
      b.append(sw, el("span", "", t.label));
      b.addEventListener("click", () => { Theme.set(t.id); renderTrigger(); renderBody(); });
      styles.append(b);
    }
    body.replaceChildren(
      el("h3", "set-h", "Style"), styles,
      el("h3", "set-h", "Display"),
      toggleRow("Names on the map", state.names !== false, (v) => { state.names = v; View3D.setOption("names", v); }),
      toggleRow("Spin when idle", state.spin !== false, (v) => { state.spin = v; View3D.setOption("spin", v); }),
      toggleRow("Join messages", state.joins, (v) => { state.joins = v; }),
      el("h3", "set-h", "Sound"),
      toggleRow("Bell and plucks", Sound.started && !Sound.muted, async (v) => {
        if (v) { try { await Sound.start(); } catch { /* no audio */ } }
        Sound.setMuted(!v);
      }),
    );
  }

  function open(v) {
    const panel = $("me-panel");
    panel.hidden = !v;
    $("me-tab").setAttribute("aria-expanded", String(v));
    if (v) renderBody();
  }

  function mount(stateFn) {
    getS = stateFn;
    const variant = new URLSearchParams(location.search).get("corner") || "pill";
    document.body.dataset.corner = ["pill", "avatar", "dock"].includes(variant) ? variant : "pill";
    $("me-tab").addEventListener("click", (e) => { e.stopPropagation(); open($("me-panel").hidden); });
    for (const b of document.querySelectorAll(".me-tabs button"))
      b.addEventListener("click", () => { tab = b.dataset.tab; renderBody(); });
    $("me-panel").addEventListener("click", (e) => e.stopPropagation());
    addEventListener("click", () => open(false));
    addEventListener("keydown", (e) => { if (e.key === "Escape") open(false); });
    renderTrigger();
  }

  return { mount, me, refresh: renderTrigger, get joins() { return state.joins; } };
})();
