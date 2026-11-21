// Table hub: tap a table's bubble to open a small card for that table in the corner.
// Header (name, project, open/heads-down, needs, member faces), then Chat or Members.
// The chat is a mock: seeded from the members, messages you type stay on this screen, live events add lines.
const Hub = (() => {
  let scene = () => null, gid = null, tab = "chat", expanded = false;
  const PARTY_FACES = 5;   // the party tab shows this many faces, then "+N"
  const chats = new Map();   // table id -> [{ who: person id | "me" | null, text, at }]

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const members = (S, id) => [...S.people.values()].filter((p) => p.group_id === id);
  const ago = (at) => {
    const m = Math.round((Date.now() - at) / 60000);
    return m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
  };

  // A believable opening thread, picked from the table's own project and needs. Same table, same thread.
  function seed(S, g) {
    const ms = members(S, g.id), needs = S.needs.filter((n) => n.group_id === g.id && !n.handled_by).map((n) => n.need);
    if (!ms.length) return [];
    let h = g.id * 7919;
    const pick = (xs) => xs[(h = (h * 1103515245 + 12345) >>> 0) % xs.length];
    const lines = [
      `ok so we're doing ${g.working_on || "the idea from earlier"}, right?`,
      needs[0] ? `we really need someone on ${needs[0]}` : "I think we have everyone we need",
      "pushed the first version, pull before you change anything",
      "who's grabbing food? I can go",
      needs[1] ? `also could use help with ${needs[1]} if anyone walks by` : "demo at 9, let's freeze features at 8",
      "the station by the entrance has the mentor list btw",
      "nice, it works on my phone now",
    ];
    const out = [], start = Date.now() - 42 * 60000;
    for (let i = 0; i < Math.min(lines.length, 3 + ms.length); i++) {
      out.push({ who: pick(ms).id, text: lines[i], at: start + i * 6 * 60000 });
    }
    return out;
  }

  function thread(S, g) {
    if (!chats.has(g.id)) chats.set(g.id, seed(S, g));
    return chats.get(g.id);
  }

  function face(person, cls) {
    const img = el("img", cls);
    img.src = View3D.avatar(person).toDataURL();
    img.alt = "";
    return img;
  }

  // Party tab: table name, the faces of who's in it (+N past five), and two buttons. Opens first; small.
  function party(S, g, ms, needs) {
    const card = el("div", "party");
    card.append(el("h2", "", g.name));
    const line = g.mode === "heads_down" ? "heads-down" : needs.length ? `needs ${needs[0]}${needs.length > 1 ? ` +${needs.length - 1}` : ""}` : "open";
    card.append(el("p", "h-sub", line));
    const row = el("div", "party-faces");
    for (const p of ms.slice(0, PARTY_FACES)) {
      const b = el("button", "party-face");
      b.type = "button";
      b.title = p.name;
      b.setAttribute("aria-label", p.name);
      b.append(face(p, ""));
      b.addEventListener("click", () => View3D.focusPerson(p.id));
      row.append(b);
    }
    if (ms.length > PARTY_FACES) row.append(el("span", "party-more", `+${ms.length - PARTY_FACES}`));
    if (!ms.length) row.append(el("span", "p-muted", "Nobody here yet"));
    const actions = el("div", "party-actions");
    for (const [id, label] of [["chat", "Chat"], ["members", "Members"]]) {
      const b = el("button", "", label);
      b.type = "button";
      b.addEventListener("click", () => { tab = id; expanded = true; render(); });
      actions.append(b);
    }
    card.append(row, actions);
    return card;
  }

  function render() {
    const S = scene(), g = S && S.groups.get(gid);
    if (!g) return;
    const ms = members(S, g.id);
    const needs = S.needs.filter((n) => n.group_id === g.id && !n.handled_by).map((n) => n.need);
    if (!expanded) {
      $("profile-body").replaceChildren(party(S, g, ms, needs));
      $("profile").hidden = false;
      $("profile").classList.add("hub", "compact");
      return;
    }
    $("profile").classList.remove("compact");

    const head = el("div", "h-head");
    head.append(el("h2", "", g.name));
    if (g.working_on) head.append(el("p", "h-sub", g.working_on));
    const tags = el("div", "p-tags");
    tags.append(el("span", `p-state${g.mode === "open" ? " here" : ""}`, g.mode === "heads_down" ? "heads-down" : "open"));
    tags.append(el("span", "p-role", `${ms.length} ${ms.length === 1 ? "person" : "people"}`));
    tags.append(el("span", "p-role", `${g.points || 0} pts`));
    head.append(tags);
    if (needs.length) {
      const row = el("div", "p-chips h-needs");
      for (const n of needs) row.append(el("span", "p-chip want", `needs ${n}`));
      head.append(row);
    }
    const stack = el("div", "h-faces");
    for (const p of ms.slice(0, 7)) stack.append(face(p, "h-face"));
    if (ms.length > 7) stack.append(el("span", "h-more", `+${ms.length - 7}`));
    head.append(stack);

    const tabs = el("nav", "me-tabs h-tabs");
    for (const [id, label] of [["chat", "Chat"], ["members", "Members"]]) {
      const b = el("button", tab === id ? "on" : "", label);
      b.type = "button";
      b.addEventListener("click", () => { tab = id; render(); });
      tabs.append(b);
    }

    const body = tab === "chat" ? chatView(S, g) : membersView(ms);
    $("profile-body").replaceChildren(head, tabs, body);
    $("profile").hidden = false;
    $("profile").classList.add("hub");
    const log = $("profile-body").querySelector(".h-log");
    if (log) log.scrollTop = log.scrollHeight;
  }

  function chatView(S, g) {
    const wrap = el("div", "h-chat"), log = el("div", "h-log");
    for (const m of thread(S, g)) {
      if (m.who === null) { log.append(el("p", "h-sys", m.text)); continue; }
      const mine = m.who === "me", who = mine ? Corner.me() : S.people.get(m.who);
      if (!who) continue;
      const row = el("div", `h-msg${mine ? " mine" : ""}`);
      const bubble = el("div", "h-bubble");
      if (!mine) bubble.append(el("b", "", who.name));
      bubble.append(el("span", "", m.text), el("time", "", ago(m.at)));
      if (!mine) row.append(face(who, "h-av"));
      row.append(bubble);
      log.append(row);
    }
    const form = el("form", "h-send");
    const input = el("input");
    input.type = "text";
    input.placeholder = `Message ${g.name}`;
    input.maxLength = 200;
    input.setAttribute("aria-label", `Message ${g.name}`);
    const send = el("button", "", "Send");
    send.type = "submit";
    form.append(input, send);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      thread(S, g).push({ who: "me", text, at: Date.now() });
      render();
      $("profile-body").querySelector(".h-send input")?.focus();
    });
    wrap.append(log, form, el("p", "p-foot", "Mock chat · messages stay on this screen"));
    return wrap;
  }

  function membersView(ms) {
    const list = el("div", "h-members");
    if (!ms.length) list.append(el("p", "p-muted", "Nobody at this table yet"));
    for (const p of ms) {
      const b = el("button", "h-member");
      b.type = "button";
      b.append(face(p, "h-av"), el("span", "", p.name), el("small", "", p.here ? (p.role === "student" ? "here" : p.role) : "away"));
      b.addEventListener("click", () => View3D.focusPerson(p.id));
      list.append(b);
    }
    return list;
  }

  function open(id) { gid = id; tab = "chat"; expanded = false; render(); }

  // A live event about a table: add a line to its chat, and refresh if that hub is open.
  function note(id, text) {
    const S = scene(), g = S && S.groups.get(id);
    if (!g) return;
    thread(S, g).push({ who: null, text, at: Date.now() });
    if (gid === id && isOpen()) render();
  }
  const isOpen = () => !$("profile").hidden && $("profile").classList.contains("hub");

  function mount(sceneFn) {
    scene = sceneFn;
    View3D.onTable(open);
    // the profile card is shared: anything that shows a person's profile is no longer the hub
    new MutationObserver(() => { if ($("profile").hidden) gid = null; }).observe($("profile"), { attributes: true, attributeFilter: ["hidden"] });
  }

  return { mount, open, note, close: () => { gid = null; } };
})();
