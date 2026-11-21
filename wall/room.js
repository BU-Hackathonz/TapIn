// The room you're in (prototype), kept in localStorage("wall.room").
// Room.chooser() shows two options, Join a room and Host an event, either inside a card you pass in (the sign-in
// page's All set step) or as a window over the page (Settings on the wall):
//   Join a room: a hand taps a badge on a station (tap the picture to "scan"), then "You can join <event>" and Join room.
//   Host an event: a short form (name, place, start time), then you're hosting. No join codes: people get in by scanning a card.
// opts.into: element to draw in (no window); opts.onDone(room): called once you've joined or are hosting.
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
  const JOIN_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="4" width="8" height="12" rx="2"/><path d="M15.5 1.8a4 4 0 0 1 3 0"/><path d="M3 18c3-1 6-3 8-5l1.5-.5"/><rect x="8.5" y="8" width="4" height="7" rx="1"/></svg>';
  const HOST_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>';
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
  let room = load();
  const listeners = [];
  const save = () => { try { localStorage.setItem("wall.room", JSON.stringify(room)); } catch { /* private mode */ } };
  // Hosts (and the projector, ?kiosk) see the head count and Room activity; everyone else gets a quieter wall.
  const markHost = () => document.body?.classList.toggle("host", room.status === "in" && !!room.host);
  const enter = (r) => { room = r; save(); markHost(); for (const fn of listeners) fn(room); };

  // ---------------------------------------------------------- the window
  function chooser(opts = {}) {
    const inline = !!opts.into;
    if (!inline && document.querySelector(".room-modal")) return;
    const shade = el("div", "room-modal"), win = inline ? opts.into : el("div", "room-window");
    const close = () => { if (!inline) { shade.remove(); removeEventListener("keydown", onKey); } };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const done = (r) => { close(); enter(r); opts.onDone?.(r); };
    if (!inline) {
      win.setAttribute("role", "dialog");
      win.setAttribute("aria-modal", "true");
      win.setAttribute("aria-label", "Join a room or host an event");
      addEventListener("keydown", onKey);
      shade.addEventListener("click", (e) => { if (e.target === shade) close(); });
    }
    const x = () => {
      if (inline) return document.createDocumentFragment();   // no close button inside a card
      const b = el("button", "room-x", "×");
      b.type = "button";
      b.setAttribute("aria-label", "Close");
      b.addEventListener("click", close);
      return b;
    };
    const back = (to) => {
      const b = el("button", "room-make", "Back");
      b.type = "button";
      b.addEventListener("click", to);
      return b;
    };
    const option = (icon, title, sub, go) => {
      const b = el("button", "room-option big");
      b.type = "button";
      const i = el("span", "room-option-icon");
      i.innerHTML = icon;   // static icon markup
      const t = el("span", "room-option-text");
      t.append(el("b", "", title), el("small", "", sub));
      b.append(i, t);
      b.addEventListener("click", go);
      return b;
    };

    const cls = (c) => { win.className = `${inline ? "room-inline" : "room-window"}${c ? ` ${c}` : ""}`; };
    const chooseStep = () => {
      cls("choose");
      const name = opts.name ? `, ${opts.name}` : "";
      const heading = opts.bare ? [] : [el("h2", "room-title big", opts.title || `Welcome${name}`), el("span", "room-sub", "What would you like to do?")];
      win.replaceChildren(x(), ...heading,
        option(JOIN_ICON, "Join a room", "Tap your badge at a station", tapStep),
        option(HOST_ICON, "Host an event", "Start a room others can join", makeStep),
        room.status === "in" ? el("span", "room-sub small", `You're in ${room.name} now`) : el("span"));
      win.querySelector(".room-option")?.focus();
    };
    const tapStep = () => {
      cls("");
      const art = el("button", "tap-btn");
      art.type = "button";
      art.setAttribute("aria-label", "Tap your badge at a station (demo: tap here)");
      art.innerHTML = TAP_ART;   // static illustration markup
      art.addEventListener("click", foundStep);
      win.replaceChildren(x(), art, el("b", "room-title", "Tap your badge at a station"),
                          el("span", "room-sub", "Hold it flat on the reader until the light blinks. Demo: tap the picture."), back(chooseStep));
      art.focus();
    };
    const foundStep = () => {
      const art = el("div", "done");
      art.innerHTML = DONE_ART;   // static illustration markup
      const join = el("button", "room-join", "Join room");
      join.type = "button";
      join.addEventListener("click", () => done({ status: "in", ...EVENT }));
      const here = opts.here ? opts.here() : 0;
      win.replaceChildren(x(), art, el("span", "room-kicker", "You can join"), el("b", "room-name", EVENT.name),
                          el("span", "room-sub", here ? `${EVENT.place} · ${here} here now` : EVENT.place), join, back(chooseStep));
      join.focus();
    };
    const makeStep = () => {
      cls("");
      const form = el("form", "room-form");
      const field = (label, name, ph, type = "text") => {
        const l = el("label", "", label), i = el("input");
        i.type = type; i.name = name; i.placeholder = ph; i.maxLength = 60;
        l.append(i);
        return l;
      };
      const create = el("button", "room-join", "Create event");
      create.type = "submit";
      form.append(el("b", "room-name", "Host an event"), field("Name", "name", "Friday build night"),
                  field("Where", "place", "Engineering lounge"), field("Starts", "time", "", "time"), create, back(chooseStep));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const f = form.elements;
        done({ status: "in", name: f.name.value.trim() || "My event", place: f.place.value.trim(), time: f.time.value, host: true });
      });
      win.replaceChildren(x(), form);
      form.elements.name.focus();
    };

    if (!inline) { shade.append(win); document.body.append(shade); }
    chooseStep();
  }

  function leave() {
    room = { status: "choose" };
    try { localStorage.removeItem("wall.room"); } catch { /* private mode */ }
    markHost();
    for (const fn of listeners) fn(room);
  }
  if (document.body) markHost(); else addEventListener("DOMContentLoaded", markHost);

  return { chooser, leave, onChange: (fn) => listeners.push(fn), get current() { return room; } };
})();
