// Table card: tap a table's bubble for a small card in the corner: name and a short description, nothing else,
// and Join table, which opens the table's full server (server.js) right away.
const Hub = (() => {
  let scene = () => null, gid = null;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const members = (S, id) => [...S.people.values()].filter((p) => p.group_id === id);

  // Tables you've joined on this screen (mock). Joining opens the table's full server straight away.
  const joined = new Set();

  function render() {
    const S = scene(), g = S && S.groups.get(gid);
    if (!g) return;
    const ms = members(S, g.id);
    const needs = S.needs.filter((n) => n.group_id === g.id && !n.handled_by).map((n) => n.need);
    const card = el("div", "tc-card");
    card.append(el("h2", "", g.name));
    card.append(el("p", "tc-desc", g.working_on || "No description yet"));
    const state = g.mode === "heads_down" ? "heads-down" : needs.length ? `needs ${needs.join(", ")}` : "open";
    card.append(el("p", "tc-meta", `${ms.length} ${ms.length === 1 ? "person" : "people"} · ${state}${g.private ? " · private" : ""}`));
    const inIt = joined.has(g.id);
    const btn = el("button", "tc-join", inIt ? "Open server" : "Join table");
    btn.type = "button";
    btn.addEventListener("click", () => {
      if (!joined.has(g.id)) {
        joined.add(g.id);
        TableServer.note(g.id, `${Corner.me().name} joined the table`);
      }
      $("profile").hidden = true;
      TableServer.open(g.id, "chat");
    });
    card.append(btn);
    $("profile-body").replaceChildren(card);
    $("profile").hidden = false;
    $("profile").classList.add("hub", "compact");
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
