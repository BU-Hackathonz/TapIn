// Tap In wall: rebuilds from /api/graph and /api/needs, then follows /ws events ({type, ts, data}).
// ?server=host:port points the wall at another server (default: same origin).
(() => {
  const qs = new URLSearchParams(location.search);
  const host = qs.get("server") || location.host;
  const HTTP = `${location.protocol === "https:" ? "https" : "http"}://${host}`;
  const WS = `${location.protocol === "https:" ? "wss" : "ws"}://${host}/ws`;
  const STATIONS = { 1: "Entrance", 2: "Table 2" };
  const COLOR = { student: "#f2f2f2", mentor: "#f2c46d", staff: "#f2c46d", away: "#6b6b6b",
                  raspberry: "#b8466f", mint: "#7fe0bd" };

  const S = { people: new Map(), groups: new Map(), links: new Map(), needs: [], stats: null,
              fresh: new Map(), hints: [], bumped: new Set() };
  const lk = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const station = (id) => STATIONS[id] || `Station ${id}`;
  const nameOf = (id) => S.people.get(id)?.name || "Someone";
  const groupName = (id) => S.groups.get(id)?.name || `Table ${id}`;

  // ------------------------------------------------------------ data

  async function getJSON(path) {
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
    renderPanels();
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
    try { S.stats = await getJSON("/api/stats"); } catch { /* stats arrive later via stats_updated */ }
    render();
    renderPanels();
  }

  // ------------------------------------------------------------ room view

  const svg = d3.select("#room");
  const gHulls = svg.append("g");
  const gLinks = svg.append("g");
  const gHints = svg.append("g");
  const gNodes = svg.append("g");
  const gLabels = svg.append("g");
  const gFx = svg.append("g");
  const lobbyLabel = svg.append("text").attr("class", "lobby").attr("text-anchor", "middle").text("Just arrived");

  let lastSig = "", W = 0, H = 0, visible = [], shownGroups = [], centers = new Map(), lobby = { x: 0, y: 0 };

  const radius = (p) => Math.min(14, 6 + Math.sqrt(p.points || 0) * 0.9);

  const sim = d3.forceSimulation()
    .alphaDecay(0.025)
    .force("charge", d3.forceManyBody().strength(-40))
    .force("collide", d3.forceCollide((d) => radius(d) + 20))
    .force("x", d3.forceX((d) => d.tx).strength(0.16))
    .force("y", d3.forceY((d) => d.ty).strength(0.16))
    .on("tick", tick);

  function layout() {
    const box = svg.node().getBoundingClientRect();
    W = box.width; H = box.height;
    // Bottom band stays clear for the arrival cards.
    const top = 70, bottom = H - 150, n = shownGroups.length;
    lobby = { x: W / 2, y: top + (bottom - top) / 2 };
    centers = new Map();
    if (n <= 10) {
      // Tables on a ring, new arrivals in the middle.
      const rx = W * 0.37, ry = (bottom - top) * 0.36;
      shownGroups.forEach((g, i) => {
        const a = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2;
        centers.set(g.id, { x: lobby.x + rx * Math.cos(a), y: lobby.y + ry * Math.sin(a) });
      });
    } else {
      // Too many for a ring: grid on the right, arrivals in a column on the left.
      lobby = { x: W * 0.12, y: lobby.y };
      const cols = Math.ceil(Math.sqrt(n * 1.4)), rows = Math.ceil(n / cols);
      const x0 = W * 0.26, cw = (W - x0) / cols, ch = (bottom - top) / rows;
      shownGroups.forEach((g, i) => centers.set(g.id, {
        x: x0 + cw * (i % cols + 0.5), y: top + ch * (Math.floor(i / cols) + 0.5) }));
    }
    lobbyLabel.attr("x", lobby.x).attr("y", lobby.y - 95);
  }

  function render() {
    // A table shows while anyone in it is here; its away members show dimmed inside it.
    const hereGroups = new Set();
    for (const p of S.people.values()) if (p.here && p.group_id) hereGroups.add(p.group_id);
    shownGroups = [...S.groups.values()].filter((g) => hereGroups.has(g.id));
    visible = [...S.people.values()].filter((p) => p.here || (p.group_id && hereGroups.has(p.group_id)));
    layout();
    for (const p of visible) {
      const c = (p.group_id && centers.get(p.group_id)) || lobby;
      p.tx = c.x; p.ty = c.y;
      if (p.x === undefined) { p.x = c.x + (Math.random() - 0.5) * 40; p.y = c.y + (Math.random() - 0.5) * 40; }
    }

    gNodes.selectAll("g.node").data(visible, (d) => d.id).join(
      (enter) => {
        const g = enter.append("g").attr("class", "node");
        g.append("circle");
        g.append("text").attr("text-anchor", "middle");
        return g;
      })
      .attr("class", (d) => `node${d.here ? "" : " away"}${d.focus ? " focus" : ""}`)
      .call((g) => g.select("circle")
        .attr("r", radius)
        .attr("fill", (d) => (d.here ? COLOR[d.role] || COLOR.student : COLOR.away))
        .style("color", (d) => COLOR[d.role] || COLOR.student))
      .call((g) => g.select("text").attr("y", (d) => radius(d) + 14).text((d) => d.name));

    const ids = new Set(visible.map((p) => p.id));
    const links = [...S.links.entries()].filter(([, l]) => ids.has(l.a) && ids.has(l.b));
    gLinks.selectAll("line").data(links, ([k]) => k).join("line")
      .attr("class", ([k, l]) => {
        const a = S.people.get(l.a), b = S.people.get(l.b);
        const inner = a.group_id && a.group_id === b.group_id;
        return `link${inner ? " inner" : ""}${S.fresh.has(k) ? " fresh" : ""}`;
      })
      .attr("stroke-width", ([, l]) => Math.min(1 + (l.strength - 1) * 0.8, 5));

    gHulls.selectAll("circle").data(shownGroups, (g) => g.id).join("circle")
      .attr("class", (g) => `hull ${g.mode}${g.glow ? " glow" : ""}`);

    const labels = gLabels.selectAll("g.glabel").data(shownGroups, (g) => g.id).join((enter) => {
      const g = enter.append("g").attr("class", "glabel").attr("text-anchor", "middle");
      g.append("text").attr("class", "name");
      g.append("text").attr("class", "sub").attr("dy", "1.25em");
      g.append("text").attr("class", "pts").attr("dy", "-1.2em");
      return g;
    });
    labels.select(".name").text((g) => g.name);
    labels.select(".sub").text(groupLine);
    labels.select(".pts").text((g) => `${g.points || 0} pts${g.mode === "heads_down" ? " · heads-down" : ""}`);

    // Only reheat when someone moved table or the screen changed; style-only renders (glows, points) stay still.
    const sig = `${W}x${H}|` + visible.map((p) => `${p.id}:${p.group_id || 0}`).join(",");
    if (sig !== lastSig) {
      lastSig = sig;
      sim.nodes(visible);
      sim.alpha(Math.max(sim.alpha(), 0.5)).restart();
    } else tick();
    renderCounters();
  }

  function groupLine(g) {
    const open = S.needs.filter((n) => n.group_id === g.id && !n.handled_by).map((n) => n.need);
    const bits = [];
    if (g.working_on) bits.push(g.working_on);
    if (open.length) bits.push(`needs ${open.join(", ")}`);
    return bits.join(" · ");
  }

  function hullOf(gid) {
    const ms = visible.filter((p) => p.group_id === gid);
    if (!ms.length) return null;
    const cx = d3.mean(ms, (p) => p.x), cy = d3.mean(ms, (p) => p.y);
    const r = d3.max(ms, (p) => Math.hypot(p.x - cx, p.y - cy) + radius(p)) + 26;
    return { cx, cy, r };
  }

  function tick() {
    gNodes.selectAll("g.node").attr("transform", (d) => `translate(${d.x},${d.y})`);
    gLinks.selectAll("line")
      .attr("x1", ([, l]) => S.people.get(l.a).x).attr("y1", ([, l]) => S.people.get(l.a).y)
      .attr("x2", ([, l]) => S.people.get(l.b).x).attr("y2", ([, l]) => S.people.get(l.b).y);
    const hulls = new Map(shownGroups.map((g) => [g.id, hullOf(g.id)]));
    gHulls.selectAll("circle").each(function (g) {
      const h = hulls.get(g.id);
      if (h) d3.select(this).attr("cx", h.cx).attr("cy", h.cy).attr("r", h.r);
    });
    gLabels.selectAll("g.glabel").attr("transform", (g) => {
      const h = hulls.get(g.id);
      return h ? `translate(${h.cx},${h.cy - h.r - 26})` : null;
    });
    gHints.selectAll("line")
      .attr("x1", (h) => S.people.get(h.pid)?.x).attr("y1", (h) => S.people.get(h.pid)?.y)
      .attr("x2", (h) => hulls.get(h.gid)?.cx).attr("y2", (h) => hulls.get(h.gid)?.cy);
  }

  function drawHints() {
    const now = Date.now();
    S.hints = S.hints.filter((h) => h.until > now && S.people.has(h.pid) && shownGroups.some((g) => g.id === h.gid));
    gHints.selectAll("line").data(S.hints, (h) => `${h.pid}-${h.gid}`).join("line").attr("class", "hint");
    tick();
  }

  function ripple(pid, color = COLOR.raspberry) {
    const p = S.people.get(pid);
    if (!p || p.x === undefined) return;
    gFx.append("circle").attr("class", "ripple").attr("cx", p.x).attr("cy", p.y).attr("r", radius(p))
      .style("stroke", color)
      .transition().duration(1400).ease(d3.easeCubicOut).attr("r", 70).style("opacity", 0).remove();
  }

  function glow(gid, ms = 2500) {
    const g = S.groups.get(gid);
    if (!g) return;
    g.glow = true;
    render();
    setTimeout(() => { g.glow = false; render(); }, ms);
  }

  function freshen(keys, ms = 3000) {
    const until = Date.now() + ms;
    for (const k of keys) S.fresh.set(k, until);
    render();
    setTimeout(() => {
      const now = Date.now();
      for (const [k, t] of S.fresh) if (t <= now) S.fresh.delete(k);
      render();
    }, ms + 50);
  }

  // ------------------------------------------------------------ side panels

  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderCounters() {
    $("c-here").textContent = [...S.people.values()].filter((p) => p.here).length;
    $("c-groups").textContent = shownGroups.length;
    $("c-links").textContent = S.stats?.links_today ?? S.links.size;
  }

  function minutesSince(iso) {
    return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  }

  function renderNeeds() {
    const ol = $("needs");
    ol.replaceChildren();
    const open = S.needs.filter((n) => !n.handled_by).sort((a, b) => a.since.localeCompare(b.since));
    const done = S.needs.filter((n) => n.handled_by).slice(-3);
    if (!open.length && !done.length) ol.append(el("li", "empty", "No open needs right now."));
    for (const n of open.slice(0, 6)) {
      const li = el("li");
      const what = el("span", "what", `${n.table} `);
      what.append(el("em", "", n.need));
      const m = minutesSince(n.since);
      li.append(what, el("span", `wait${m >= 15 ? " long" : ""}`, `${m} min`));
      ol.append(li);
    }
    for (const n of done) {
      const li = el("li", "handled");
      const what = el("span", "what", `${n.table} `);
      what.append(el("em", "", n.need));
      li.append(what, el("span", "wait", `${nameOf(n.handled_by)} on it`));
      ol.append(li);
    }
  }

  function renderLeaderboard() {
    const top = (xs) => [...xs].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 5);
    const fill = (ol, rows, kind) => {
      ol.replaceChildren();
      for (const x of rows) {
        const li = el("li", S.bumped.has(`${kind}${x.id}`) ? "bump" : "");
        li.append(el("span", "n", x.name), el("b", "", x.points || 0));
        ol.append(li);
      }
    };
    fill($("lb-groups"), top(S.groups.values()), "g");
    fill($("lb-people"), top([...S.people.values()].filter((p) => p.role === "student")), "p");
  }

  function renderStats() {
    const buckets = S.stats?.scans_10min;
    $("stats-panel").hidden = !buckets?.length;
    if (!buckets?.length) return;
    const s = d3.select("#stats");
    const w = s.node().clientWidth, h = 90, pad = 16;
    const x = d3.scaleBand().domain(buckets.map((b) => b.bucket)).range([0, w]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(buckets, (b) => b.count) || 1]).range([h - pad, 4]);
    s.selectAll("rect").data(buckets, (b) => b.bucket).join("rect")
      .attr("class", (_, i) => (i === buckets.length - 1 ? "now" : null))
      .attr("x", (b) => x(b.bucket)).attr("width", x.bandwidth())
      .attr("y", (b) => y(b.count)).attr("height", (b) => h - pad - y(b.count));
    const fmt = d3.timeFormat("%-I:%M");
    const ticks = [buckets[0], buckets[Math.floor(buckets.length / 2)], buckets[buckets.length - 1]];
    s.selectAll("text").data(ticks).join("text")
      .attr("x", (b) => x(b.bucket) + x.bandwidth() / 2).attr("y", h - 2).attr("text-anchor", "middle")
      .text((b) => fmt(new Date(b.bucket)));
  }

  function renderPanels() {
    renderNeeds();
    renderLeaderboard();
    renderStats();
    renderCounters();
  }

  function log(kind, text) {
    const ol = $("log");
    const li = el("li");
    li.append(el("time", "", d3.timeFormat("%-I:%M")(new Date())), el("span", `k-${kind}`, text));
    ol.prepend(li);
    while (ol.children.length > 40) ol.lastChild.remove();
  }

  // Arrival card: template line now, swapped for the Gemini icebreaker if it arrives.
  function arrival(p, stationId, sugg, known) {
    const box = $("arrivals");
    const card = el("div", `arrival s${stationId}`);
    card.dataset.pid = p.id;
    const head = el("div");
    head.append(el("span", "who", p.name), document.createTextNode(` checked in at ${station(stationId)}`));
    let line;
    if (sugg.length) {
      const top = sugg[0];
      card.dataset.gid = top.group_id;
      const t = groupName(top.group_id);
      line = top.reason?.startsWith("needs ") ? `${p.name}: ${t} ${top.reason}` : `${p.name}: try ${t} (${top.reason})`;
    } else if (known.length) {
      line = `Knows ${known.length} ${known.length === 1 ? "person" : "people"} here: ${known.slice(0, 3).map(nameOf).join(", ")}`;
    } else {
      line = "Welcome! Find a table and tap in together.";
    }
    card.append(head, el("span", "line", line));
    box.prepend(card);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => { card.classList.add("out"); setTimeout(() => card.remove(), 700); }, 10000);
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
      drawHints();
      setTimeout(drawHints, 10100);
      setTimeout(() => ripple(p.id), 60);
      Sound.arrive();
      arrival(p, d.station_id, sugg, d.known_here || []);
      log("arrive", `${p.name} arrived at ${station(d.station_id)}`);
    },
    icebreaker(d) {
      const card = document.querySelector(`.arrival[data-pid="${d.person_id}"][data-gid="${d.group_id}"] .line`);
      if (card) { card.textContent = d.text; card.classList.add("ai"); }
    },
    async group_formed(d) {
      await syncGraph();
      const keys = [];
      for (let i = 0; i < d.member_ids.length; i++)
        for (let j = i + 1; j < d.member_ids.length; j++) keys.push(lk(d.member_ids[i], d.member_ids[j]));
      freshen(keys);
      glow(d.group_id);
      d.member_ids.forEach((id) => ripple(id, COLOR.mint));
      Sound.links(keys.length);
      log("new", `New table: ${groupName(d.group_id)} (${d.member_ids.map(nameOf).join(", ")})`);
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
      d.new_member_ids.forEach((id) => ripple(id, COLOR.mint));
      Sound.links(d.new_links.length);
      log("join", `${d.new_member_ids.map(nameOf).join(", ")} joined ${groupName(d.group_id)}`);
    },
    help(d) {
      ripple(d.mentor_id, COLOR.mentor);
      glow(d.group_id);
      log("help", `${nameOf(d.mentor_id)} is helping ${groupName(d.group_id)}`);
      syncSoon();
    },
    link_strengthened(d) {
      const k = lk(d.a, d.b);
      const l = S.links.get(k);
      if (l) l.strength = d.strength; else S.links.set(k, { a: d.a, b: d.b, strength: d.strength });
      freshen([k], 1500);
    },
    points_updated(d) {
      S.bumped.clear();
      for (const x of d.people || []) {
        const p = S.people.get(x.id);
        if (p) { p.points = x.points; S.bumped.add(`p${x.id}`); }
      }
      for (const x of d.groups || []) {
        const g = S.groups.get(x.id);
        if (g) { g.points = x.points; S.bumped.add(`g${x.id}`); }
      }
      render();
      renderLeaderboard();
    },
    needs_updated(d) {
      S.needs = d.needs || [];
      renderNeeds();
      render();
    },
    person_created(d) {
      log("arrive", `${d.name} claimed a badge`);
      syncSoon();
    },
    unknown_badge(d) {
      log("unknown", `Unknown badge at ${station(d.station_id)}. Sign up on your phone first.`);
    },
    stats_updated(d) {
      S.stats = d;
      renderStats();
      renderCounters();
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
    const conn = $("conn");
    const ws = new WebSocket(WS);
    ws.onopen = () => {
      backoff = 1000;
      conn.textContent = "live"; conn.className = "conn live";
      syncAll().catch((e) => console.error("sync", e));  // catch up on anything missed while down
    };
    ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => {
      conn.textContent = "reconnecting"; conn.className = "conn down";
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 8000);
    };
  }

  // ------------------------------------------------------------ boot

  if (qs.has("silent")) $("start").classList.add("gone");  // second screens: no sound, no Start click
  $("start-btn").addEventListener("click", async () => {
    $("start").classList.add("gone");
    try { await Sound.start(); } catch (e) { console.error("sound", e); }
  });
  window.addEventListener("resize", () => render());
  setInterval(renderNeeds, 30000);
  connect();
})();
