// A table's own sub-server: channels on the left, the conversation in the middle, members on the right
// (one column with a channel strip and a members toggle on phones). Everything here is a mock kept in memory:
// threads are seeded from the table's people, project and needs; what you send stays on this screen.
const TableServer = (() => {
  const CHANNELS = [
    { id: "general", topic: "Everything about the build" },
    { id: "help", topic: "Ask for a hand; mentors watch this one" },
    { id: "ideas", topic: "Half-baked is fine" },
    { id: "links", topic: "Repos, docs, demos" },
  ];
  const REPLIES = ["on it", "nice, pulling now", "can you push that?", "+1, let's do that", "I'll take that after food",
                   "looks good to me", "wait, which branch?", "ok trying it on my phone"];
  const SKILLS = ["hardware", "firmware", "frontend", "backend", "design", "ml", "data", "mobile", "pitch", "research"];
  let scene = () => null, gid = null, channel = "general", showMembers = false, root = null, typingTimer = null, view = "chat";
  // Your edits to a table (name, project, private, heads-down, looking for, muted). Mock: kept on this screen and
  // re-applied whenever the room data refreshes, never sent to the server.
  const edits = new Map();
  function applyEdits(S) {
    for (const [id, e] of edits) {
      const g = S.groups.get(id);
      if (!g) continue;
      for (const k of ["name", "working_on", "mode", "private", "muted"]) if (e[k] !== undefined) g[k] = e[k];
      if (e.looking_for) {
        g.looking_for = e.looking_for;
        S.needs = S.needs.filter((n) => n.group_id !== id || n.handled_by)
          .concat(e.looking_for.map((need) => ({ group_id: id, table: g.name, need, since: e.at, handled_by: null })));
      }
    }
  }
  const threads = new Map();   // "gid:channel" -> [{ who: id | "me" | null, text, at, re: { "+1": n, "✓": n }, mine: Set }]

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const members = (S, id) => [...S.people.values()].filter((p) => p.group_id === id);
  const clock = (at) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const face = (person, cls) => { const i = el("img", cls); i.src = View3D.avatar(person).toDataURL(); i.alt = ""; return i; };

  function seed(S, g, ch) {
    const ms = members(S, g.id);
    if (!ms.length) return [];
    const needs = S.needs.filter((n) => n.group_id === g.id && !n.handled_by).map((n) => n.need);
    let h = g.id * 7919 + ch.length * 131;
    const pick = (xs) => xs[(h = (h * 1103515245 + 12345) >>> 0) % xs.length];
    const lines = {
      general: [`ok so we're doing ${g.working_on || "the idea from earlier"}, right?`, "yes. first demo by 9?",
                "pushed the first version, pull before you change anything", "who's grabbing food? I can go",
                "nice, it works on my phone now"],
      help: needs.length ? [`we really need someone on ${needs[0]}`, "asked at the mentor table, someone's coming over",
                            needs[1] ? `also stuck on ${needs[1]}` : "the station by the entrance lists the mentors"]
                         : ["nothing blocking right now", "ping here if you get stuck"],
      ideas: ["what if the wall shows who's free?", "could add a QR to the table sign", "stretch goal: dark mode"],
      links: ["repo: (pinned in #general)", "slides draft is in the shared drive", "demo video goes here when it exists"],
    }[ch];
    const start = Date.now() - 50 * 60000;
    return lines.map((text, i) => ({ who: pick(ms).id, text, at: start + i * 7 * 60000 + ch.length * 60000,
                                     re: i % 3 === 1 ? { "+1": 1 + (i % 2) } : {}, mine: new Set() }));
  }
  function thread(S, g, ch) {
    const key = `${g.id}:${ch}`;
    if (!threads.has(key)) threads.set(key, seed(S, g, ch));
    return threads.get(key);
  }

  // ---------------------------------------------------------------- render

  function render() {
    const S = scene(), g = S && S.groups.get(gid);
    if (!g || !root) return;
    const ms = members(S, g.id), needs = S.needs.filter((n) => n.group_id === g.id && !n.handled_by).map((n) => n.need);
    root.classList.toggle("members-open", showMembers);

    // header
    const head = el("header", "sv-head");
    const title = el("div", "sv-title");
    title.append(el("h2", "", g.name), el("span", `sv-mode ${g.mode}`, g.mode === "heads_down" ? "heads-down" : "open"));
    if (g.private) title.append(el("span", "sv-mode private", "private"));
    const sub = el("p", "sv-sub", [g.working_on, `${ms.length} ${ms.length === 1 ? "person" : "people"}`, `${g.points || 0} pts`].filter(Boolean).join(" · "));
    const gear = el("button", "sv-icon", "Settings");
    gear.type = "button";
    gear.setAttribute("aria-pressed", String(view === "settings"));
    gear.addEventListener("click", () => { view = view === "settings" ? "chat" : "settings"; render(); });
    const mBtn = el("button", "sv-icon", "Members");
    mBtn.type = "button";
    mBtn.setAttribute("aria-pressed", String(showMembers));
    mBtn.addEventListener("click", () => { showMembers = !showMembers; render(); });
    const x = el("button", "sv-icon sv-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", close);
    const tools = el("div", "sv-tools");
    tools.append(gear, mBtn, x);
    head.append(title, tools, sub);

    // channels
    const nav = el("nav", "sv-channels");
    nav.setAttribute("aria-label", "Channels");
    nav.append(el("span", "sv-label", "Channels"));
    for (const c of CHANNELS) {
      const b = el("button", c.id === channel ? "on" : "");
      b.type = "button";
      b.append(el("span", "sv-hash", "#"), c.id);
      const unread = c.id !== channel && thread(S, g, c.id).some((m) => m.who === null && Date.now() - m.at < 60000);
      if (unread) b.append(el("span", "sv-dot"));
      b.addEventListener("click", () => { channel = c.id; render(); });
      nav.append(b);
    }
    if (needs.length) {
      nav.append(el("span", "sv-label", "Needs"));
      for (const n of needs) nav.append(el("span", "sv-need", n));
    }

    // conversation (or the table's settings)
    const main = el("section", "sv-main");
    if (view === "settings") {
      main.append(settingsView(S, g));
      root.querySelector(".sv-window").replaceChildren(head, nav, main, membersSide(ms));
      return;
    }
    const ch = CHANNELS.find((c) => c.id === channel);
    const top = el("div", "sv-topic");
    top.append(el("b", "", `# ${ch.id}`), el("span", "", ch.topic));
    const log = el("div", "sv-log");
    if (channel === "general") {
      const pin = el("div", "sv-pin");
      pin.append(el("b", "", "Pinned"), el("span", "", `${g.working_on || "Project TBD"}${needs.length ? ` · needs ${needs.join(", ")}` : ""}`));
      log.append(pin);
    }
    let last = null;
    for (const m of thread(S, g, channel)) {
      if (m.who === null) { log.append(el("p", "sv-sys", m.text)); last = null; continue; }
      const who = m.who === "me" ? Corner.me() : S.people.get(m.who);
      if (!who) continue;
      const grouped = last && last.who === m.who && m.at - last.at < 5 * 60000;
      const row = el("div", `sv-msg${grouped ? " cont" : ""}${m.who === "me" ? " mine" : ""}`);
      if (!grouped) {
        row.append(face(who, "sv-av"));
        const meta = el("div", "sv-meta");
        meta.append(el("b", "", m.who === "me" ? `${who.name} (you)` : who.name), el("time", "", clock(m.at)));
        row.append(meta);
      }
      row.append(el("p", "sv-text", m.text));
      const re = el("div", "sv-re");
      for (const r of ["+1", "✓"]) {
        const n = m.re[r] || 0;
        const b = el("button", `${n ? "has" : ""}${m.mine.has(r) ? " mine" : ""}`, n ? `${r} ${n}` : r);
        b.type = "button";
        b.setAttribute("aria-label", `React ${r}`);
        b.addEventListener("click", () => {
          if (m.mine.has(r)) { m.mine.delete(r); m.re[r] = Math.max(0, (m.re[r] || 1) - 1); }
          else { m.mine.add(r); m.re[r] = (m.re[r] || 0) + 1; }
          render();
        });
        re.append(b);
      }
      row.append(re);
      log.append(row);
      last = m;
    }
    const typing = el("p", "sv-typing", "");
    typing.id = "sv-typing";
    const form = el("form", "sv-send");
    const input = el("input");
    input.type = "text";
    input.maxLength = 300;
    input.placeholder = `Message #${channel}`;
    input.setAttribute("aria-label", `Message #${channel}`);
    const send = el("button", "", "Send");
    send.type = "submit";
    form.append(input, send);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      thread(S, g, channel).push({ who: "me", text, at: Date.now(), re: {}, mine: new Set() });
      render();
      root.querySelector(".sv-send input").focus();
      reply(g.id, channel);
    });
    main.append(top, log, typing, form, el("p", "sv-foot", "Mock sub-server · messages stay on this screen"));

    root.querySelector(".sv-window").replaceChildren(head, nav, main, membersSide(ms));
    log.scrollTop = log.scrollHeight;
  }

  function membersSide(ms) {
    const side = el("aside", "sv-members");
    for (const [label, list] of [["Here", ms.filter((p) => p.here)], ["Away", ms.filter((p) => !p.here)]]) {
      if (!list.length) continue;
      side.append(el("span", "sv-label", `${label} · ${list.length}`));
      for (const p of list) {
        const b = el("button", `sv-member${p.here ? "" : " away"}`);
        b.type = "button";
        const av = el("span", "sv-av-wrap");
        av.append(face(p, "sv-av sm"), el("span", `sv-online${p.here ? " on" : ""}`));
        b.append(av, el("span", "", p.name));
        if (p.role !== "student") b.append(el("small", "", p.role));
        b.addEventListener("click", () => { close(); View3D.focusPerson(p.id); });
        side.append(b);
      }
    }

    return side;
  }

  function settingsView(S, g) {
    const e = { ...(edits.get(g.id) || {}) };
    const form = el("form", "sv-settings");
    const text = (label, name, value, max) => {
      const l = el("label", "sv-field", label), i = el("input");
      i.type = "text"; i.name = name; i.value = value || ""; i.maxLength = max;
      l.append(i);
      return l;
    };
    const toggle = (label, hint, name, on) => {
      const l = el("label", "set-row sv-toggle");
      const t = el("span", "");
      t.append(el("b", "", label), el("small", "", hint));
      const i = el("input");
      i.type = "checkbox"; i.name = name; i.checked = !!on;
      l.append(t, i, el("span", "switch"));
      return l;
    };
    const wants = new Set(g.looking_for || []);
    const chips = el("div", "sv-chips");
    for (const k of SKILLS) {
      const b = el("button", wants.has(k) ? "on" : "", k);
      b.type = "button";
      b.addEventListener("click", () => {
        if (wants.has(k)) wants.delete(k); else if (wants.size < 2) wants.add(k);
        for (const c of chips.children) { c.classList.toggle("on", wants.has(c.textContent)); c.disabled = !wants.has(c.textContent) && wants.size >= 2; }
      });
      b.disabled = !wants.has(k) && wants.size >= 2;
      chips.append(b);
    }
    const save = el("button", "room-join", "Save changes");
    save.type = "submit";
    const done = el("span", "set-saved", "");
    const row = el("div", "set-actions");
    row.append(save, done);
    form.append(
      el("h3", "sv-h", "Table settings"),
      text("Table name", "name", g.name, 30),
      text("What you're building", "working_on", g.working_on, 80),
      el("span", "sv-field", "Looking for (up to 2)"), chips,
      toggle("Private party", "Hidden from suggestions; people join only by tapping in with someone already here", "private", g.private),
      toggle("Heads-down", "Off the needs board and out of suggestions while you focus", "heads", g.mode === "heads_down"),
      toggle("Mute this table", "No join lines or sounds from this table", "muted", g.muted),
      row,
      el("p", "sv-foot", "Mock settings · saved on this screen only"));
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const f = form.elements;
      Object.assign(e, {
        name: f.name.value.trim() || g.name, working_on: f.working_on.value.trim(), private: f.private.checked,
        mode: f.heads.checked ? "heads_down" : "open", muted: f.muted.checked, looking_for: [...wants], at: new Date().toISOString(),
      });
      edits.set(g.id, e);
      applyEdits(S);
      View3D.relayout();
      note(g.id, `Table settings updated: ${[e.private ? "private" : "public", e.mode === "heads_down" ? "heads-down" : "open"].join(", ")}`);
      done.textContent = "Saved";
      render();
    });
    return form;
  }

  // After you post, someone at the table "types" and answers.
  function reply(id, ch) {
    clearTimeout(typingTimer);
    const S = scene(), g = S && S.groups.get(id), ms = g ? members(S, id) : [];
    if (!ms.length) return;
    const who = ms[Math.floor(Math.random() * ms.length)];
    typingTimer = setTimeout(() => {
      const t = document.getElementById("sv-typing");
      if (t && gid === id && channel === ch) t.textContent = `${who.name} is typing…`;
      const c = document.querySelector(".tc-chat .tc-label");
      if (c) c.textContent = `# general · ${who.name} is typing…`;
      typingTimer = setTimeout(() => {
        thread(S, g, ch).push({ who: who.id, text: REPLIES[Math.floor(Math.random() * REPLIES.length)], at: Date.now(), re: {}, mine: new Set() });
        if (gid === id) render();
        if (typeof Hub !== "undefined") Hub.refresh();   // the corner card shows #general too
      }, 1400);
    }, 700);
  }

  // ---------------------------------------------------------------- open / close

  const onKey = (e) => { if (e.key === "Escape") close(); };
  function open(id, how = "chat") {
    gid = id;
    channel = "general";
    view = how === "settings" ? "settings" : "chat";
    showMembers = how === "members";
    if (!root) {
      root = el("div", "sv-shade");
      root.append(el("div", "sv-window"));
      root.addEventListener("click", (e) => { if (e.target === root) close(); });
      root.querySelector(".sv-window").setAttribute("role", "dialog");
      root.querySelector(".sv-window").setAttribute("aria-modal", "true");
      document.body.append(root);
      addEventListener("keydown", onKey);
    }
    root.querySelector(".sv-window").setAttribute("aria-label", `${scene()?.groups.get(id)?.name || "Table"} server`);
    render();
    root.querySelector(".sv-send input")?.focus();
  }
  function close() {
    clearTimeout(typingTimer);
    root?.remove();
    root = null;
    gid = null;
    removeEventListener("keydown", onKey);
  }

  // A live event about a table lands in its #general.
  function note(id, text) {
    const S = scene(), g = S && S.groups.get(id);
    if (!g) return;
    thread(S, g, "general").push({ who: null, text, at: Date.now(), re: {}, mine: new Set() });
    if (gid === id) render();
  }

  // For the corner card: the last few lines of #general, and posting to it.
  function recent(id, n = 4) {
    const S = scene(), g = S && S.groups.get(id);
    return g ? thread(S, g, "general").slice(-n) : [];
  }
  function post(id, text) {
    const S = scene(), g = S && S.groups.get(id);
    if (!g || !text) return;
    thread(S, g, "general").push({ who: "me", text, at: Date.now(), re: {}, mine: new Set() });
    if (gid === id) render();
    reply(id, "general");
  }

  return { mount: (fn) => { scene = fn; }, open, close, note, recent, post, applyEdits, get openTable() { return gid; } };
})();
