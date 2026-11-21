// One corner tab for "you" and settings. Three placements to compare: ?corner=pill (default) | avatar | dock.
//   pill:   top-left pill with your face, name and a gear; the panel drops down under it.
//   avatar: round face with a small gear badge, bottom-left; the panel opens upward.
//   dock:   slim tab on the left edge; the panel slides out as a drawer.
// "You" is the profile saved by login.html, or a mock (the first person in the room) when there isn't one.
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
  // Read on every frame by the map, so parse only when the stored text changes.
  let rawCache = null, meCache = null, meObj = null;
  function saved() {
    let raw = null;
    try { raw = localStorage.getItem("wall.me"); } catch { return null; }
    if (raw !== rawCache) {
      rawCache = raw;
      try { meCache = raw ? JSON.parse(raw) : null; } catch { meCache = null; }
    }
    return meCache;
  }
  function me() {
    const p = saved();
    if (p) return (meObj && meObj.src === p) ? meObj.person
      : (meObj = { src: p, person: { id: -1, role: "student", points: 0, here: true, group_id: null, ...p } }).person;
    const S = getS();
    const people = S ? [...S.people.values()].filter((p) => p.role === "student") : [];
    return people.sort((a, b) => a.id - b.id)[0] || { id: 0, name: "You", role: "student", points: 0, here: true, group_id: null };
  }

  // ---------------------------------------------------------- the room you're in (prototype)
  // out:   not in a room; the You tab shows a hand tapping a badge on a station. Tap it to "scan".
  // found: the scan found the room; Join room, or make your own event instead.
  // make:  a tiny form to start your own event.
  // in:    you're in; Leave room sits in Settings.
  const EVENT = { name: "BostonHacks 2026", place: "GSU Metcalf Ballroom" };
  const DOOR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4H6v16h8"/><path d="M14 4l5 2v12l-5 2z"/><path d="M3 12h7M7 9l3 3-3 3"/></svg>';
  const TAP_ART = `<svg class="tap-art" viewBox="0 0 220 120" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="128" y="22" width="64" height="80" rx="14"/>
    <circle cx="160" cy="54" r="12"/><path d="M152 34a24 24 0 0 1 16 0M147 29a32 32 0 0 1 26 0"/>
    <circle class="tap-led" cx="160" cy="86" r="3.5" fill="currentColor" stroke="none"/>
    <circle class="tap-ring" cx="160" cy="54" r="12"/>
    <g class="tap-hand">
      <rect x="72" y="40" width="40" height="27" rx="5"/><path d="M80 50h12M80 57h18"/>
      <path d="M40 92c0-14 6-22 16-26l16-4c5-1 8 2 8 6s-3 6-7 7l-8 2"/><path d="M46 70c-6-4-6-12 0-14l12-2"/>
    </g>
  </svg>`;
  const DONE_ART = `<svg class="done-art" viewBox="0 0 120 120" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <circle class="done-ring" cx="60" cy="60" r="40"/><path class="done-check" d="M42 61l12 12 25-27"/></svg>`;

  const loadRoom = () => { try { return JSON.parse(localStorage.getItem("wall.room") || "null") || { status: "out" }; } catch { return { status: "out" }; } };
  let room = loadRoom();
  const saveRoom = () => { try { localStorage.setItem("wall.room", JSON.stringify(room)); } catch { /* private mode */ } };
  const hereCount = () => { const S = getS(); return S ? [...S.people.values()].filter((p) => p.here).length : 0; };

  function roomCard() {
    const card = el("section", `room-card ${room.status}`);
    if (room.status === "out") {
      const art = el("button", "tap-btn");
      art.type = "button";
      art.setAttribute("aria-label", "Tap your badge at a station (demo: tap here)");
      art.innerHTML = TAP_ART;   // static illustration markup
      art.addEventListener("click", () => { room = { status: "found" }; renderBody(); });
      card.append(art, el("b", "", "Tap your badge at a station"), el("span", "room-sub", "to find the room you're in. Demo: tap the picture."));
    } else if (room.status === "found") {
      const art = el("div", "done");
      art.innerHTML = DONE_ART;   // static illustration markup
      const join = el("button", "room-join", "Join room");
      join.type = "button";
      join.addEventListener("click", () => { room = { status: "in", ...EVENT }; saveRoom(); renderBody(); });
      const make = el("button", "room-make", "or make your own event");
      make.type = "button";
      make.addEventListener("click", () => { room = { status: "make" }; renderBody(); });
      card.append(art, el("span", "room-kicker", "You can join"), el("b", "room-name", EVENT.name),
                  el("span", "room-sub", `${EVENT.place} · ${hereCount()} here now`), join, make);
    } else if (room.status === "make") {
      const form = el("form", "room-form");
      const field = (label, id, ph, type = "text") => {
        const l = el("label", "", label), i = el("input");
        i.type = type; i.id = id; i.placeholder = ph; i.maxLength = 60;
        l.append(i);
        return l;
      };
      const create = el("button", "room-join", "Create event");
      create.type = "submit";
      const back = el("button", "room-make", "Back");
      back.type = "button";
      back.addEventListener("click", () => { room = { status: "found" }; renderBody(); });
      form.append(el("b", "room-name", "Make an event"), field("Name", "ev-name", "Friday build night"),
                  field("Where", "ev-place", "Engineering lounge"), field("Starts", "ev-time", "", "time"), create, back);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = $("ev-name").value.trim() || "My event";
        const code = Math.random().toString(36).slice(2, 6).toUpperCase();
        room = { status: "in", name, place: $("ev-place").value.trim(), time: $("ev-time").value, host: true, code };
        saveRoom();
        renderBody();
      });
      card.append(form);
    } else {
      card.append(el("span", "room-kicker", room.host ? "You're hosting" : "You're in"), el("b", "room-name", room.name));
      const bits = [room.place, room.time && `starts ${room.time}`, room.host && `code ${room.code}`].filter(Boolean).join(" · ");
      if (bits) card.append(el("span", "room-sub", bits));
    }
    return card;
  }

  function leaveButton() {
    const b = el("button", "me-edit leave");
    b.type = "button";
    const icon = el("span", "leave-icon");
    icon.innerHTML = DOOR;   // static icon markup
    b.append(icon, room.status === "in" ? `Leave ${room.name}` : "Not in a room");
    b.disabled = room.status !== "in";
    b.addEventListener("click", () => { room = { status: "out" }; saveRoom(); show("you"); });
    return b;
  }

  // People you're connected to, for the green highlight on the map. A saved profile has no real links yet,
  // so it gets a stable handful of people in the room; the mock "you" uses its real links.
  let knownKey = "", knownSet = new Set();
  function known() {
    const S = getS();
    if (!S) return knownSet;
    const p = me(), key = `${p.id}:${p.name}:${S.people.size}:${S.links.size}`;
    if (key === knownKey) return knownSet;
    knownKey = key;
    if (p.id >= 0) {
      knownSet = new Set([...S.links.values()].filter((l) => l.a === p.id || l.b === p.id).map((l) => (l.a === p.id ? l.b : l.a)));
    } else {
      let h = 0;
      for (const ch of p.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const here = [...S.people.values()].filter((q) => q.here).sort((a, b) => ((a.id * 2654435761) ^ h) % 997 - ((b.id * 2654435761) ^ h) % 997);
      knownSet = new Set(here.slice(0, 4).map((q) => q.id));
    }
    return knownSet;
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
      link.href = saved() ? "login.html?edit" : "login.html";
      body.replaceChildren(roomCard(), el("p", "me-note", saved() ? `Signed in as ${p.name}` : `Signed in as ${p.name} (mock)`), link,
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
      el("h3", "set-h", "Room"),
      leaveButton(),
      el("h3", "set-h", "Account"),
      signOutButton(),
      el("h3", "set-h", "Sound"),
      toggleRow("Bell and plucks", Sound.started && !Sound.muted, async (v) => {
        if (v) { try { await Sound.start(); } catch { /* no audio */ } }
        Sound.setMuted(!v);
      }),
    );
  }

  function signOutButton() {
    const b = el("button", "me-edit", saved() ? "Sign out" : "Sign in");
    b.type = "button";
    b.addEventListener("click", () => {
      try { localStorage.removeItem("wall.me"); } catch { /* private mode */ }
      location.href = "login.html";
    });
    return b;
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
    // a tap on "You" in the map opens the panel; the click from that same tap must not close it again
    addEventListener("click", () => { if (performance.now() - openedAt > 400) open(false); });
    addEventListener("keydown", (e) => { if (e.key === "Escape") open(false); });
    renderTrigger();
  }

  let openedAt = 0;
  const show = (which) => { tab = which; openedAt = performance.now(); open(true); };
  return { mount, me, show, known, signedIn: () => !!saved(), refresh: renderTrigger, get joins() { return state.joins; } };
})();
