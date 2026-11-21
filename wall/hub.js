// Table card: tap a table's bubble for its card in the corner: name, project, tags, needs, the faces of who's in
// it (+N past seven), the latest lines of #general with a box to answer, and buttons into the full sub-server.
const Hub = (() => {
  let scene = () => null, gid = null;
  const PARTY_FACES = 7;   // faces shown before "+N"

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const members = (S, id) => [...S.people.values()].filter((p) => p.group_id === id);

  function face(person) {
    const img = el("img", "");
    img.src = View3D.avatar(person).toDataURL();
    img.alt = "";
    return img;
  }

  function render() {
    const S = scene(), g = S && S.groups.get(gid);
    if (!g) return;
    const ms = members(S, g.id);
    const needs = S.needs.filter((n) => n.group_id === g.id && !n.handled_by).map((n) => n.need);

    const head = el("div", "tc-head");
    head.append(el("h2", "", g.name));
    if (g.working_on) head.append(el("p", "h-sub", g.working_on));
    const tags = el("div", "p-tags");
    tags.append(el("span", `p-state${g.mode === "open" ? " here" : ""}`, g.mode === "heads_down" ? "heads-down" : "open"));
    if (g.private) tags.append(el("span", "p-role", "private"));
    tags.append(el("span", "p-role", `${ms.length} ${ms.length === 1 ? "person" : "people"}`), el("span", "p-role", `${g.points || 0} pts`));
    head.append(tags);
    if (needs.length) {
      const row = el("div", "p-chips tc-needs");
      for (const n of needs) row.append(el("span", "p-chip want", `needs ${n}`));
      head.append(row);
    }

    const row = el("div", "party-faces");
    for (const p of ms.slice(0, PARTY_FACES)) {
      const b = el("button", "party-face");
      b.type = "button";
      b.title = p.name;
      b.setAttribute("aria-label", p.name);
      b.append(face(p));
      b.addEventListener("click", () => View3D.focusPerson(p.id));
      row.append(b);
    }
    if (ms.length > PARTY_FACES) row.append(el("span", "party-more", `+${ms.length - PARTY_FACES}`));
    if (!ms.length) row.append(el("span", "p-muted", "Nobody here yet"));

    // a window into #general: the last few lines and a box to answer
    const chat = el("div", "tc-chat");
    chat.append(el("span", "tc-label", "# general"));
    const log = el("div", "tc-log");
    for (const m of TableServer.recent(g.id, 4)) {
      if (m.who === null) { log.append(el("p", "tc-sys", m.text)); continue; }
      const who = m.who === "me" ? Corner.me() : S.people.get(m.who);
      if (!who) continue;
      const line = el("div", `tc-msg${m.who === "me" ? " mine" : ""}`);
      const img = face(who);
      img.className = "tc-av";
      const bubble = el("div", "tc-bubble");
      if (m.who !== "me") bubble.append(el("b", "", who.name));
      bubble.append(el("span", "", m.text));
      if (m.who !== "me") line.append(img);
      line.append(bubble);
      log.append(line);
    }
    const form = el("form", "tc-send");
    const input = el("input");
    input.type = "text"; input.maxLength = 300; input.placeholder = `Message ${g.name}`;
    input.setAttribute("aria-label", `Message ${g.name}`);
    const send = el("button", "", "Send");
    send.type = "submit";
    form.append(input, send);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      TableServer.post(g.id, text);
      render();
      $("profile-body").querySelector(".tc-send input")?.focus();
    });
    chat.append(log, form);

    const actions = el("div", "party-actions");
    for (const [how, label] of [["chat", "Open full server"], ["members", "Members"], ["settings", "Settings"]]) {
      const b = el("button", how === "chat" ? "primary" : "", label);
      b.type = "button";
      b.addEventListener("click", () => TableServer.open(g.id, how));
      actions.append(b);
    }

    $("profile-body").replaceChildren(head, row, chat, actions);
    $("profile").hidden = false;
    $("profile").classList.add("hub");
    $("profile").classList.remove("compact");
    log.scrollTop = log.scrollHeight;
  }

  function open(id) { gid = id; render(); }

  // Live events about a table go to its sub-server's #general; the party tab refreshes if it's showing.
  const refresh = () => { if (gid !== null && !$("profile").hidden && $("profile").classList.contains("hub")) render(); };
  function note(id, text) {
    TableServer.note(id, text);
    if (gid === id && !$("profile").hidden && $("profile").classList.contains("hub")) render();
  }

  function mount(sceneFn) {
    scene = sceneFn;
    TableServer.mount(sceneFn);
    View3D.onTable(open);
    new MutationObserver(() => { if ($("profile").hidden) gid = null; }).observe($("profile"), { attributes: true, attributeFilter: ["hidden"] });
  }

  return { mount, open, note, refresh };
})();
