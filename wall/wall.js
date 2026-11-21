// Tap In wall: a full-screen 3D map of the room. Rebuilds from /api/graph and /api/needs, then follows /ws events.
// ?server=host:port points the wall at another server (default: same origin). ?silent skips the Start screen.
(() => {
  const qs = new URLSearchParams(location.search);
  const host = qs.get("server") || location.host;
  const HTTP = `${location.protocol === "https:" ? "https" : "http"}://${host}`;
  const WS = `${location.protocol === "https:" ? "wss" : "ws"}://${host}/ws`;

  const S = { people: new Map(), groups: new Map(), links: new Map(), needs: [], fresh: new Map(), hints: [] };
  const lk = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ data

  let demo = false;   // true: no server, the in-browser Demo room answers instead
  async function getJSON(path) {
    if (demo) return Demo.snapshot(path);
    const r = await fetch(HTTP + path);
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
  }

  function applyGraph(g) {
    const seen = new Set();
    for (const p of g.people) {
      seen.add(p.id);
      S.people.set(p.id, Object.assign(S.people.get(p.id) || {}, p));  // keep x/y so nodes don't jump
    }
    for (const id of [...S.people.keys()]) if (!seen.has(id)) S.people.delete(id);
    S.groups = new Map(g.groups.map((x) => [x.id, x]));
    S.links = new Map(g.links.map((l) => [lk(l.a, l.b), { ...l }]));
  }

  async function syncGraph() {
    applyGraph(await getJSON("/api/graph"));
    render();
  }

  let syncTimer = null;
  function syncSoon() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncGraph().catch(() => {}), 400);
  }

  async function syncAll() {
    const [g, needs] = await Promise.all([getJSON("/api/graph"), getJSON("/api/needs")]);
    applyGraph(g);
    S.needs = needs;
    render();
    Panels.needs(S.needs);
    Panels.tables(rankedTables());
    Corner.refresh();
    if (!demo) {
      const statsVersion = statsRevision;
      void getJSON("/api/stats").then(data => {
        if (statsVersion === statsRevision) Panels.stats(data);
      }).catch(() => {});
      const revision = tableRevision;
      void getJSON("/api/leaderboard").then(data => {
        if (revision === tableRevision) Panels.tables(data.groups);
      }).catch(() => {});
    }
  }

  // ------------------------------------------------------------ room state for the 3D view

  let visible = [], shownGroups = [];
  let tableRevision = 0;
  let statsRevision = 0;
  const rankedTables = () => [...S.groups.values()].sort((a, b) => b.points - a.points || a.id - b.id);
  function updateTables() {
    tableRevision++;
    Panels.tables(rankedTables());
  }
  const radius = (p) => Math.min(16, 8 + Math.sqrt(p.points || 0) * 0.8);

  function render() {
    // A table shows while anyone in it is here; its away members show dimmed inside it.
    const hereGroups = new Set();
    for (const p of S.people.values()) if (p.here && p.group_id) hereGroups.add(p.group_id);
    shownGroups = [...S.groups.values()].filter((g) => hereGroups.has(g.id));
    visible = [...S.people.values()].filter((p) => p.here || (p.group_id && hereGroups.has(p.group_id)));
    View3D.relayout();
    $("here").textContent = [...S.people.values()].filter((p) => p.here).length;
  }

  function needLine(g) {
    if (!g) return "";
    if (g.mode === "heads_down") return "heads-down";
    const open = S.needs.filter((n) => n.group_id === g.id && !n.handled_by).map((n) => n.need);
    return open.length ? `needs ${open.join(", ")}` : "";
  }

  function pruneHints() {
    const now = Date.now();
    S.hints = S.hints.filter((h) => h.until > now && S.people.has(h.pid));
  }

  const ripple = (pid, kind = "accent") => View3D.pulse(pid, kind);   // accent | join | help, coloured by the theme

  function glow(gid, ms = 2500) {
    const g = S.groups.get(gid);
    if (!g) return;
    g.glow = true;
    setTimeout(() => { g.glow = false; }, ms);
  }

  function freshen(keys, ms = 3000) {
    const until = Date.now() + ms;
    for (const k of keys) S.fresh.set(k, until);
    setTimeout(() => {
      const now = Date.now();
      for (const [k, t] of S.fresh) if (t <= now) S.fresh.delete(k);
    }, ms + 50);
  }

  // ------------------------------------------------------------ side notifications

  // Just text, no box: "Hana joined" fades in on the left when someone arrives or claims a badge, then fades out.
  const TOAST_MS = 4000, TOAST_MAX = 5;
  function toast(name) {
    if (!name || !Corner.joins) return;
    const box = $("toasts"), line = document.createElement("p"), inner = document.createElement("span");
    const b = document.createElement("b");
    line.className = "toast";
    b.textContent = name;
    inner.append(b, " joined");
    line.append(inner);
    box.prepend(line);
    while (box.children.length > TOAST_MAX) box.lastChild.remove();
    setTimeout(() => { line.classList.add("out"); setTimeout(() => line.remove(), 650); }, TOAST_MS);
  }

  // ------------------------------------------------------------ events

  const on = {
    async checked_in(d) {
      if (!S.people.has(d.person_id)) await syncGraph();
      const p = S.people.get(d.person_id);
      if (!p) return;
      p.here = true;
      const sugg = d.suggested_groups || [];
      S.hints.push(...sugg.slice(0, 1).map((s) => ({ pid: p.id, gid: s.group_id, until: Date.now() + 10000 })));
      render();
      setTimeout(pruneHints, 10100);
      setTimeout(() => ripple(p.id), 60);
      Sound.arrive();
      toast(p.name);
      Panels.checkIn(p, S.groups.get(sugg[0]?.group_id), sugg[0]);
    },
    async group_formed(d) {
      await syncGraph();
      const keys = [];
      for (let i = 0; i < d.member_ids.length; i++)
        for (let j = i + 1; j < d.member_ids.length; j++) keys.push(lk(d.member_ids[i], d.member_ids[j]));
      freshen(keys);
      glow(d.group_id);
      d.member_ids.forEach((id) => ripple(id, "join"));
      Hub.note(d.group_id, `${d.member_ids.map((id) => S.people.get(id)?.name).filter(Boolean).join(", ")} started the table`);
      Sound.links(keys.length);
      const group = S.groups.get(d.group_id);
      if (group) Panels.log(`${group.name} formed`);
      updateTables();
    },
    async group_joined(d) {
      if (!S.groups.has(d.group_id)) await syncGraph();
      for (const id of d.new_member_ids) {
        const p = S.people.get(id);
        if (p) { p.group_id = d.group_id; p.here = true; }
      }
      for (const [a, b] of d.new_links) if (!S.links.has(lk(a, b))) S.links.set(lk(a, b), { a, b, strength: 1 });
      freshen(d.new_links.map(([a, b]) => lk(a, b)));
      glow(d.group_id);
      d.new_member_ids.forEach((id) => ripple(id, "join"));
      Hub.note(d.group_id, `${d.new_member_ids.map((id) => S.people.get(id)?.name).filter(Boolean).join(", ")} joined the table`);
      Sound.links(d.new_links.length);
      const group = S.groups.get(d.group_id);
      if (group) Panels.log(`${group.name} welcomed ${d.new_member_ids.length === 1 ? "a member" : "new members"}`);
    },
    help(d) {
      ripple(d.mentor_id, "help");
      Hub.note(d.group_id, `${S.people.get(d.mentor_id)?.name || "A mentor"} came over to help`);
      glow(d.group_id);
      const mentor = S.people.get(d.mentor_id), group = S.groups.get(d.group_id);
      if (mentor && group) Panels.log(`${mentor.name} helped ${group.name}`);
      syncSoon();
    },
    link_strengthened(d) {
      const k = lk(d.a, d.b);
      const l = S.links.get(k);
      if (l) l.strength = d.strength; else S.links.set(k, { a: d.a, b: d.b, strength: d.strength });
      freshen([k], 1500);
    },
    points_updated(d) {
      for (const x of d.people || []) {
        const p = S.people.get(x.id);
        if (p) p.points = x.points;
      }
      for (const entry of d.groups || []) {
        const group = S.groups.get(entry.id);
        if (group) group.points = entry.points;
      }
      updateTables();
      render();
    },
    stats_updated(d) {
      statsRevision++;
      Panels.stats(d);
    },
    icebreaker: Panels.icebreaker,
    needs_updated(d) {
      S.needs = d.needs || [];
      Panels.needs(S.needs);
      render();
    },
    person_created(d) {
      toast(d.name);
      Panels.log(`${d.name} linked a badge`);
      syncSoon();
    },
  };

  // Events run one at a time so a group_formed that re-reads the graph can't race the next event.
  let queue = Promise.resolve();
  function handle(msg) {
    const fn = on[msg.type];
    if (!fn) return;
    queue = queue.then(() => fn(msg.data)).catch((e) => console.error(msg.type, e));
  }

  let backoff = 1000;
  function connect() {
    const ws = new WebSocket(WS);
    ws.onopen = () => {
      backoff = 1000;
      queue = queue.then(syncAll).catch((e) => console.error("sync", e));  // catch up before processing new events
    };
    ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => {
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 8000);
    };
  }

  // ------------------------------------------------------------ boot

  if (qs.has("silent")) $("start").classList.add("gone");
  $("start-btn").addEventListener("click", async () => {
    $("start").classList.add("gone");
    try { await Sound.start(); } catch (e) { console.error("sound", e); }
  });
  Theme.set(Theme.initial());
  Corner.mount(() => S);
  Hub.mount(() => S);
  View3D.init(() => ({ visible, shownGroups, S, radius, needLine }));
  View3D.setActive(true);

  // ?demo, or no Tap In server behind this page (e.g. hosted on its own): run the built-in demo room.
  function startDemo() {
    demo = true;
    document.body.classList.add("demo");
    Demo.build();
    syncAll().catch((e) => console.error("demo", e));
    Demo.start(handle);
  }
  if (qs.has("demo")) startDemo();
  else {
    fetch(HTTP + "/api/graph")
      .then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? connect() : startDemo()))
      .catch(startDemo);
  }
})();
