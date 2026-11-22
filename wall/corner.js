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
  // ?peek inside a frame (the mockups gallery): a sample you, nothing saved
  const PEEK = window.top !== window && new URLSearchParams(location.search).has("peek")
    ? { name: "Jun", school: "Boston University", major: "Computer Engineering", role: "student", skills: ["frontend", "design"], looking_for: ["hardware"], face: "face-peek" } : null;
  function saved() {
    let raw = null;
    try { raw = localStorage.getItem("wall.me"); } catch { return PEEK; }
    if (!raw && PEEK) return PEEK;
    if (raw !== rawCache) {
      rawCache = raw;
      try { meCache = raw ? JSON.parse(raw) : null; } catch { meCache = null; }
    }
    return meCache;
  }
  function me() {
    const p = saved();
    // a badge-linked profile (person_id, from a badge tap or the phone) is the real person in the room: their links, table and points
    const real = p && p.person_id != null && getS() ? getS().people.get(p.person_id) : null;
    // The graph refresh updates `real` in place (table, points, here), so refresh our copy every time, or your own
    // profile keeps its old table and never moves to the one you just formed or joined.
    if (real) {
      if (!(meObj && meObj.src === p && meObj.real === real)) meObj = { src: p, real, person: {} };
      return Object.assign(meObj.person, p, real, { id: real.id });
    }
    if (p) return (meObj && meObj.src === p) ? meObj.person
      : (meObj = { src: p, person: { id: -1, role: "student", points: 0, here: true, group_id: null, ...p } }).person;
    const S = getS();
    const people = S ? [...S.people.values()].filter((p) => p.role === "student") : [];
    return people.sort((a, b) => a.id - b.id)[0] || { id: 0, name: "You", role: "student", points: 0, here: true, group_id: null };
  }

  // ---------------------------------------------------------- the room you're in (room.js draws the card)
  const DOOR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4H6v16h8"/><path d="M14 4l5 2v12l-5 2z"/><path d="M3 12h7M7 9l3 3-3 3"/></svg>';
  const hereCount = () => { const S = getS(); return S ? [...S.people.values()].filter((p) => p.here).length : 0; };

  function leaveButton() {
    const b = el("button", "me-edit leave");
    b.type = "button";
    const icon = el("span", "leave-icon");
    icon.innerHTML = DOOR;   // static icon markup
    const room = Room.current;
    b.append(icon, room.status === "in" ? `Leave ${room.name}` : "Not in a room");
    b.disabled = room.status !== "in";
    b.addEventListener("click", () => { Room.leave(); show("settings"); });
    return b;
  }
  function chooseButton() {
    const b = el("button", "me-edit", Room.current.status === "in" ? "Join or host another" : "Join a room or host an event");
    b.type = "button";
    b.addEventListener("click", () => { open(false); Room.chooser({ here: hereCount, name: me().name }); });
    return b;
  }

  // hosts open the room display (David's host screen) on the projector computer; this page stays their own 3D map
  function displayLink() {
    const a = el("a", "me-edit", "Open the room display");
    a.href = "host.html"; a.target = "_blank"; a.rel = "noopener";
    return a;
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
      link.href = saved() ? "join.html?edit" : "join.html";
      const r = Room.current;
      const status = el("p", "me-room", r.status === "in" ? `${r.host ? "Hosting" : "In"} ${r.name}` : "Not in a room");
      const mine = saved();
      const page = mine && mine.person_id != null ? Object.assign(el("a", "me-edit", "Your suggestions and table"), { href: "/phone/me.html?id=" + encodeURIComponent(mine.person_id) }) : null;
      body.replaceChildren(status, el("p", "me-note", mine ? `Signed in as ${p.name}` : "Not signed in"), ...(page ? [page] : []), link,
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
      el("h3", "set-h", "Profile"), profileForm(),
      el("h3", "set-h", "Style"), styles,
      el("h3", "set-h", "Display"),
      toggleRow("Room plan (the host wall)", !!View3D.option("plan"), (v) => {
        View3D.setOption("plan", v);
        document.body.classList.toggle("plan", v);
        try { localStorage.setItem("wall.view", v ? "plan" : "3d"); } catch { /* private mode */ }
      }),
      toggleRow("2D map", !!View3D.option("flat"), (v) => View3D.setOption("flat", v)),
      toggleRow("Names on the map", state.names !== false, (v) => { state.names = v; View3D.setOption("names", v); }),
      toggleRow("Spin when idle", state.spin !== false, (v) => { state.spin = v; View3D.setOption("spin", v); }),
      toggleRow("Join messages", state.joins, (v) => { state.joins = v; }),
      el("h3", "set-h", "Room"),
      leaveButton(), chooseButton(), ...(Room.current.status === "in" && Room.current.host ? [displayLink()] : []),
      el("h3", "set-h", "Account"),
      ...(saved() && saved().person_id != null ? [Object.assign(el("a", "me-edit", "Your suggestions and table"), { href: "/phone/me.html?id=" + encodeURIComponent(saved().person_id) })] : []),
      signOutButton(),
      el("h3", "set-h", "Sound"),
      toggleRow("Bell and plucks", Sound.started && !Sound.muted, async (v) => {
        if (v) { try { await Sound.start(); } catch { /* no audio */ } }
        Sound.setMuted(!v);
      }),
    );
  }

  // Quick edits without leaving the room; photo, skills and apps live on the full editor.
  function profileForm() {
    const p = me(), mine = saved() || {};
    const form = el("form", "set-profile");
    const field = (label, name, value, ph, max) => {
      const l = el("label", "", label), i = el("input");
      i.type = "text"; i.name = name; i.value = value || ""; i.placeholder = ph; i.maxLength = max;
      l.append(i);
      return l;
    };
    const saveBtn = el("button", "room-join", "Save");
    saveBtn.type = "submit";
    const more = el("a", "set-more", "Photo, skills and apps");
    more.href = "join.html?edit";
    const done = el("span", "set-saved", "");
    form.append(field("Name", "name", mine.name || p.name, "First name", 30), field("School", "school", mine.school, "Boston University", 60),
                field("Major", "major", mine.major, "Computer Engineering", 40), field("One line about you", "bio", mine.bio, "Likes soldering more than slides.", 80));
    const row = el("div", "set-actions");
    row.append(saveBtn, more, done);
    form.append(row);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = form.elements, next = { ...(saved() || { role: "student", skills: [], looking_for: [], links: {}, socials: [] }) };
      next.name = f.name.value.trim() || "Guest";
      for (const k of ["school", "major", "bio"]) { const v = f[k].value.trim(); if (v) next[k] = v; else delete next[k]; }
      try { localStorage.setItem("wall.me", JSON.stringify(next)); } catch { done.textContent = "Couldn't save in this browser"; return; }
      renderTrigger();
      View3D.relayout();
      done.textContent = "Saved";
      setTimeout(() => { done.textContent = ""; }, 1800);
    });
    return form;
  }

  function signOutButton() {
    const b = el("button", "me-edit", saved() ? "Sign out" : "Sign in");
    b.type = "button";
    b.addEventListener("click", () => {
      try { localStorage.removeItem("wall.me"); } catch { /* private mode */ }
      location.href = "join.html";
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
