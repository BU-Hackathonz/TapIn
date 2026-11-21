// The room you're in (prototype), shared by the sign-in page and the wall's You tab. Kept in localStorage("wall.room").
//   choose: not in a room; the card offers Join a room or Host an event.
//   Join a room opens a small window: a hand taps a badge on a station (tap the picture to "scan"),
//   then "You can join <event>" with Join room.
//   make:   the card turns into a short form to host your own event.
//   in:     you're in; the card still offers Join another room or Host an event.
const Room = (() => {
  const EVENT = { name: "BostonHacks 2026", place: "GSU Metcalf Ballroom" };
  const TAP_ART = `<svg class="tap-art" viewBox="0 0 220 120" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="142" y="22" width="56" height="78" rx="13"/>
    <circle cx="170" cy="54" r="11"/><path d="M162 35a22 22 0 0 1 16 0M157 30a30 30 0 0 1 26 0"/>
    <circle class="tap-led" cx="170" cy="86" r="3.4" fill="currentColor" stroke="none"/>
    <circle class="tap-ring" cx="170" cy="54" r="11"/>
    <g class="tap-hand">
      <rect class="tap-card" x="100" y="44" width="23" height="50" rx="4"/>
      <path d="M107 53h9M107 59h6" stroke-width="2"/>
      <path fill="currentColor" stroke="none" d="M0 120 L0 99 C14 95 27 88 39 81 C50 74 61 68 73 65 C82 63 91 61 99 59.2 C104.5 58 107.5 59.6 106.6 62.4 C105.8 64.6 102 65.6 97 66.4 C91 67.4 86 68.6 82.5 69.8 C87.5 71.4 91.4 73.6 91.2 77.2 C91 80.4 87.4 81.6 83 81.2 C86.4 83.4 87.4 86.2 85 88.4 C82.6 90.4 78.6 90.2 75.6 88.8 C81.6 90.6 89 90 96.4 87 C100.6 85.4 104.4 86.4 104.2 89.4 C104 92.4 99.4 94.8 92.6 96.8 C79 100.8 64 104.8 51 107.4 C37 110.2 22 114.4 12 120 Z"/>
      <path class="tap-crease" stroke-width="1.1" d="M80 71.6c4.4 1.2 7.6 3 8.4 5.6M78.6 82c3.2.8 5.2 2.4 5.4 4.6M66 92.6c4-.6 7.6-1.6 10-2.8"/>
    </g>
  </svg>`;
  const JOIN_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="4" width="8" height="12" rx="2"/><path d="M15.5 1.8a4 4 0 0 1 3 0"/><path d="M3 18c3-1 6-3 8-5l1.5-.5"/><rect x="8.5" y="8" width="4" height="7" rx="1"/></svg>';
  const HOST_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>';
  const DONE_ART = `<svg class="done-art" viewBox="0 0 120 120" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <circle class="done-ring" cx="60" cy="60" r="40"/><path class="done-check" d="M42 61l12 12 25-27"/></svg>`;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const load = () => {
    let r = null;
    try { r = JSON.parse(localStorage.getItem("wall.room") || "null"); } catch { /* private mode */ }
    return r && r.status === "in" ? r : { status: "choose" };
  };
  let room = load(), node = null, opts = {}, prev = null;   // prev: the room to go back to from the form
  const save = () => { try { localStorage.setItem("wall.room", JSON.stringify(room)); } catch { /* private mode */ } };
  const set = (r) => { room = r; if (r.status === "in") save(); draw(); if (r.status === "in") opts.onChange?.(room); };

  function option(icon, title, sub, go) {
    const b = el("button", "room-option");
    b.type = "button";
    const i = el("span", "room-option-icon");
    i.innerHTML = icon;   // static icon markup
    const t = el("span", "room-option-text");
    t.append(el("b", "", title), el("small", "", sub));
    b.append(i, t);
    b.addEventListener("click", go);
    return b;
  }
  const joinOpt = (label) => option(JOIN_ICON, label, "Tap your badge at a station", openTap);
  const hostOpt = () => option(HOST_ICON, "Host an event", "Start a room others can join", () => {
    prev = room.status === "in" ? room : null;
    room = { status: "make" };
    draw();
  });

  // The card: drawn into the same element each time so the page keeps its place.
  function draw() {
    if (!node) return;
    node.className = `room-card ${room.status}`;
    node.replaceChildren();
    if (room.status === "choose") {
      node.append(el("span", "room-kicker", opts.kicker || "Not in a room"), joinOpt("Join a room"), hostOpt());
    } else if (room.status === "make") {
      const form = el("form", "room-form");
      const field = (label, name, ph, type = "text") => {
        const l = el("label", "", label), i = el("input");
        i.type = type; i.name = name; i.placeholder = ph; i.maxLength = 60;
        l.append(i);
        return l;
      };
      const create = el("button", "room-join", "Create event");
      create.type = "submit";
      const back = el("button", "room-make", "Back");
      back.type = "button";
      back.addEventListener("click", () => { room = prev || { status: "choose" }; draw(); });
      form.append(el("b", "room-name", "Host an event"), field("Name", "name", "Friday build night"),
                  field("Where", "place", "Engineering lounge"), field("Starts", "time", "", "time"), create, back);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const f = form.elements;
        set({ status: "in", name: f.name.value.trim() || "My event", place: f.place.value.trim(), time: f.time.value, host: true,
              code: Math.random().toString(36).slice(2, 6).toUpperCase() });
      });
      node.append(form);
      form.elements.name.focus();
    } else {
      node.append(el("span", "room-kicker", room.host ? "You're hosting" : "You're in"), el("b", "room-name", room.name));
      const bits = [room.place, room.time && `starts ${room.time}`, room.host && `code ${room.code}`].filter(Boolean).join(" · ");
      if (bits) node.append(el("span", "room-sub", bits));
      const more = el("div", "room-more");
      more.append(joinOpt("Join another room"), hostOpt());
      node.append(more);
    }
  }

  // Join a room: a small window over the page. Tap the picture (standing in for a real badge tap), then Join.
  function openTap() {
    const shade = el("div", "room-modal"), win = el("div", "room-window");
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-modal", "true");
    win.setAttribute("aria-label", "Join a room");
    const close = () => { shade.remove(); removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    shade.addEventListener("click", (e) => { if (e.target === shade) close(); });
    const x = el("button", "room-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", close);

    const tapStep = () => {
      const art = el("button", "tap-btn");
      art.type = "button";
      art.setAttribute("aria-label", "Tap your badge at a station (demo: tap here)");
      art.innerHTML = TAP_ART;   // static illustration markup
      art.addEventListener("click", foundStep);
      win.replaceChildren(x, art, el("b", "room-title", "Tap your badge at a station"),
                          el("span", "room-sub", "Hold it flat on the reader until the light blinks. Demo: tap the picture."));
      art.focus();
    };
    const foundStep = () => {
      const art = el("div", "done");
      art.innerHTML = DONE_ART;   // static illustration markup
      const join = el("button", "room-join", "Join room");
      join.type = "button";
      join.addEventListener("click", () => { close(); set({ status: "in", ...EVENT }); });
      const host = el("button", "room-make", "or host your own event instead");
      host.type = "button";
      host.addEventListener("click", () => { close(); prev = room.status === "in" ? room : null; room = { status: "make" }; draw(); });
      const here = opts.here ? opts.here() : 0;
      win.replaceChildren(x, art, el("span", "room-kicker", "You can join"), el("b", "room-name", EVENT.name),
                          el("span", "room-sub", here ? `${EVENT.place} · ${here} here now` : EVENT.place), join, host);
      join.focus();
    };
    shade.append(win);
    document.body.append(shade);
    tapStep();
  }

  // opts: here() for the "N here now" count, onChange(room) once you're in a room, kicker for the first line.
  function card(o = {}) {
    opts = o;
    node = el("section");
    draw();
    return node;
  }
  function leave() { room = { status: "choose" }; try { localStorage.removeItem("wall.room"); } catch { /* private mode */ } draw(); }

  return { card, leave, get current() { return room; } };
})();
