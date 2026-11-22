// Tap In wall: a full-screen 3D map of the room. Rebuilds from /api/graph and /api/needs, then follows /ws events.
// ?server=host:port points the wall at another server (default: same origin). ?kiosk skips sign-in (projector).
(() => {
  const qs = new URLSearchParams(location.search);
  // Sign in first. The venue projector has nobody to sign in, so it opens the wall with ?kiosk.
  let signedIn = false;
  try {
    // arriving from tapin.boston or the phone page: ?as=<person id>&name=<name> is who you are on this address
    if (/^\d+$/.test(qs.get("as") || "")) {
      const prev = JSON.parse(localStorage.getItem("wall.me") || "null") || {};
      localStorage.setItem("wall.me", JSON.stringify({ ...prev, person_id: +qs.get("as"), name: qs.get("name") || prev.name || "You", face: prev.face || `face-${qs.get("as")}` }));
      if (!localStorage.getItem("wall.room")) localStorage.setItem("wall.room", JSON.stringify({ status: "in", name: "This room", time: Date.now() }));
      history.replaceState(null, "", location.pathname);   // keep the address clean
    }
    signedIn = !!localStorage.getItem("wall.me");
  } catch { /* private mode: treat as signed out */ }
  if (qs.has("kiosk")) document.body.classList.add("kiosk");
  const peek = window.top !== window && qs.has("peek");   // the mockups gallery shows the room in a frame, signed out
  if (!signedIn && !qs.has("kiosk") && !peek) {
    location.replace(`join.html${location.search}`);
    return;
  }
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
    TableServer.applyEdits(S);   // table settings changed on this screen survive a refresh
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
    TableServer.applyEdits(S);
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
    // You are drawn once, as "you" (red, in the middle). A badge-linked you is also a person from the server: leave that copy out.
    let meNow = null;
    try { meNow = Corner.signedIn() && !mainScreen ? Corner.me() : null; } catch { /* still starting up */ }
    const myId = meNow && meNow.id >= 0 ? meNow.id : null;
    visible = [...S.people.values()].filter((p) => p.id !== myId && (p.here || (p.group_id && hereGroups.has(p.group_id))));
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
      if (!S.groups.get(d.group_id)?.muted) Sound.links(keys.length);
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
      if (!S.groups.get(d.group_id)?.muted) Sound.links(d.new_links.length);
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
      TableServer.applyEdits(S);
      Panels.needs(S.needs);
      render();
    },
    person_created(d) {
      toast(d.name);
      Panels.log(`${d.name} linked a badge`);
      syncSoon();
    },
    badges_changed() { syncSoon(); },   // the admin panel unlinked a badge or removed someone: redraw now
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

  Theme.set(Theme.initial());
  Corner.mount(() => S);
  Hub.mount(() => S);
  // Your own page is always the 3D map, also when you host: the room display for hosts is David's host screen
  // (host.html, linked from Settings). Only the projector (?kiosk) gets the flat 2D map with no personal layer.
  let mainScreen = false;
  const applyMainScreen = () => {
    mainScreen = qs.has("kiosk");
    document.body.classList.toggle("main-screen", mainScreen);
    View3D.setOption("flat", false);
    // Your page is the host wall's room plan (David's seating and look) with your own layer on it; ?view=3d or the
    // Settings switch brings back the 3D map.
    // You get the 3D map (in the host wall's frame); the projector (?kiosk) gets the flat room plan. ?view=plan or the
    // Settings switch puts the room plan on your page too.
    let plan = mainScreen || qs.get("view") === "plan";
    try { if (!mainScreen && !qs.has("view") && localStorage.getItem("wall.view") === "plan") plan = true; } catch { /* private mode */ }
    document.body.classList.toggle("plan", plan);
    document.body.classList.toggle("plan-side", true);
    document.body.classList.add("hw");                       // David's host wall frame (key, side column, bottom bar) on every view
    View3D.setOption("plan", plan);
  };
  // Keep the graph out from under the UI: measure what covers the map at the top and bottom, on load and on resize.
  function measurePad() {
    const map = document.getElementById("map3d").getBoundingClientRect();
    let top = 0, bottom = 0;
    for (const sel of [".me-tab", ".plan-key", ".count"]) {
      const e = document.querySelector(sel);
      if (!e || getComputedStyle(e).display === "none") continue;
      const r = e.getBoundingClientRect();
      if (r.width && r.left < map.right && r.right > map.left) top = Math.max(top, r.bottom + 34);   // + room for table labels
    }
    for (const sel of [".plan-bar", "#room-insights", "#wall-icebreaker:not([hidden])"]) {
      const e = document.querySelector(sel);
      if (!e || getComputedStyle(e).display === "none") continue;
      const r = e.getBoundingClientRect();
      if (r.width && r.left < map.right - 4 && r.right > map.left + 4 && r.top > innerHeight / 2) bottom = Math.max(bottom, innerHeight - r.top + 12);
    }
    const pad = { top: Math.round(top), bottom: Math.round(bottom) }, old = View3D.option("pad");
    if (!old || old.top !== pad.top || old.bottom !== pad.bottom) View3D.setOption("pad", pad);
  }
  addEventListener("resize", () => setTimeout(measurePad, 60));
  document.getElementById("room-insights")?.addEventListener("toggle", () => setTimeout(measurePad, 30));
  View3D.init(() => ({ visible, shownGroups, S, radius, needLine,
                       me: Corner.signedIn() && !mainScreen ? Corner.me() : null, known: mainScreen ? new Set() : Corner.known() }));
  applyMainScreen();
  requestAnimationFrame(measurePad); setTimeout(measurePad, 600);
  View3D.onMe(() => Corner.show("you"));
  Room.onChange(() => { Corner.refresh(); applyMainScreen(); });
  View3D.setActive(true);

  // ?demo, or no Tap In server behind this page (e.g. hosted on its own): run the built-in demo room.
  function startDemo() {
    demo = true;
    document.body.classList.add("demo");
    Demo.build();
    syncAll().catch((e) => console.error("demo", e));
    Demo.start(handle);
  }
  // ?open=card|server|you|settings (the mockups gallery): open a table card, a table server or the corner panel
  if (qs.get("open")) setTimeout(() => {
    const gid = [...S.groups.keys()][0], what = qs.get("open");
    if (what === "server" && gid !== undefined) TableServer.open(gid, "chat");
    else if (what === "card" && gid !== undefined) Hub.open(gid);
    else if (what === "you" || what === "settings") Corner.show(what);
  }, 1800);
  if (qs.has("demo")) startDemo();
  else {
    // No server behind this page (the public site keeps the room private): say so, never show a made-up room.
    const offline = () => {
      document.body.classList.add("no-room");
      const n = document.createElement("div"); n.className = "no-room-note"; n.setAttribute("role", "status");
      n.innerHTML = "<b>The room shows at the venue</b><span>The room is private to the venue network. On the venue Wi-Fi, open it there:</span>";   // static text
      // the public site never serves the room; on the venue Wi-Fi the venue address does, so link there with who you are
      const a = document.createElement("a"); a.className = "no-room-go"; a.textContent = "Open the room on the venue Wi-Fi";
      let me = null; try { me = JSON.parse(localStorage.getItem("wall.me") || "null"); } catch { /* private mode */ }
      a.href = "http://192.168.8.236:8000/wall/index.html" + (me && me.person_id != null ? `?as=${encodeURIComponent(me.person_id)}&name=${encodeURIComponent(me.name || "")}` : "");
      n.append(a);
      document.body.append(n);
    };
    fetch(HTTP + "/api/graph")
      .then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? connect() : offline()))
      .catch(offline);
  }
})();
