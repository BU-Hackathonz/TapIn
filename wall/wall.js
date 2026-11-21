// Tap In wall: a full-screen map of the room. Rebuilds from /api/graph and /api/needs, then follows /ws events.
// ?server=host:port points the wall at another server (default: same origin). ?silent skips the Start screen.
(() => {
  const qs = new URLSearchParams(location.search);
  const host = qs.get("server") || location.host;
  const HTTP = `${location.protocol === "https:" ? "https" : "http"}://${host}`;
  const WS = `${location.protocol === "https:" ? "wss" : "ws"}://${host}/ws`;
  const COLOR = { student: "#f2f2f2", mentor: "#f2c46d", staff: "#f2c46d", away: "#6b6b6b",
                  raspberry: "#b8466f", mint: "#7fe0bd" };

  const S = { people: new Map(), groups: new Map(), links: new Map(), needs: [], fresh: new Map(), hints: [] };
  const lk = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const $ = (id) => document.getElementById(id);

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
  }

  // ------------------------------------------------------------ map

  const svg = d3.select("#map");
  const gHulls = svg.append("g");
  const gLinks = svg.append("g");
  const gHints = svg.append("g");
  const gNodes = svg.append("g");
  const gLabels = svg.append("g");
  const gFx = svg.append("g");

  let lastSig = "", visible = [], shownGroups = [], centers = new Map(), lobby = { x: 0, y: 0 };

  const radius = (p) => Math.min(16, 8 + Math.sqrt(p.points || 0) * 0.8);

  const sim = d3.forceSimulation()
    .alphaDecay(0.025)
    .force("charge", d3.forceManyBody().strength(-45))
    .force("collide", d3.forceCollide((d) => radius(d) + 22))
    .force("x", d3.forceX((d) => d.tx).strength(0.16))
    .force("y", d3.forceY((d) => d.ty).strength(0.16))
    .on("tick", tick);

  function layout(W, H) {
    // Top band for brand and count, bottom band for the arrival line.
    const top = 90, bottom = H - 110, n = shownGroups.length;
    lobby = { x: W / 2, y: (top + bottom) / 2 };
    centers = new Map();
    if (n <= 10) {
      // Tables on a ring, new arrivals in the middle.
      const rx = W * 0.36, ry = (bottom - top) * 0.36;
      shownGroups.forEach((g, i) => {
        const a = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2;
        centers.set(g.id, { x: lobby.x + rx * Math.cos(a), y: lobby.y + ry * Math.sin(a) });
      });
    } else {
      // Too many for a ring: grid on the right, arrivals in a column on the left.
      lobby = { x: W * 0.1, y: lobby.y };
      const cols = Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols);
      const x0 = W * 0.2, y0 = top + 50, cw = (W - x0) / cols, ch = (bottom - y0) / rows;
      shownGroups.forEach((g, i) => centers.set(g.id, {
        x: x0 + cw * (i % cols + 0.5), y: y0 + ch * (Math.floor(i / cols) + 0.5) }));
    }
  }

  function render() {
    // A table shows while anyone in it is here; its away members show dimmed inside it.
    const hereGroups = new Set();
    for (const p of S.people.values()) if (p.here && p.group_id) hereGroups.add(p.group_id);
    shownGroups = [...S.groups.values()].filter((g) => hereGroups.has(g.id));
    visible = [...S.people.values()].filter((p) => p.here || (p.group_id && hereGroups.has(p.group_id)));
    const { width: W, height: H } = svg.node().getBoundingClientRect();
    layout(W, H);
    for (const p of visible) {
      const c = (p.group_id && centers.get(p.group_id)) || lobby;
      p.tx = c.x; p.ty = c.y;
      if (p.x === undefined) { p.x = c.x + (Math.random() - 0.5) * 40; p.y = c.y + (Math.random() - 0.5) * 40; }
    }

    gNodes.selectAll("g.node").data(visible, (d) => d.id).join((enter) => {
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
      .call((g) => g.select("text").attr("y", (d) => radius(d) + 16).text((d) => d.name));

    const ids = new Set(visible.map((p) => p.id));
    const links = [...S.links.entries()].filter(([, l]) => ids.has(l.a) && ids.has(l.b));
    gLinks.selectAll("line").data(links, ([k]) => k).join("line")
      .attr("class", ([k, l]) => {
        const a = S.people.get(l.a), b = S.people.get(l.b);
        return `link${a.group_id && a.group_id === b.group_id ? " inner" : ""}${S.fresh.has(k) ? " fresh" : ""}`;
      })
      .attr("stroke-width", ([, l]) => Math.min(1.5 + (l.strength - 1) * 0.8, 5));

    gHulls.selectAll("circle").data(shownGroups, (g) => g.id).join("circle")
      .attr("class", (g) => `hull ${g.mode}${g.glow ? " glow" : ""}`);

    const labels = gLabels.selectAll("g.glabel").data(shownGroups, (g) => g.id).join((enter) => {
      const g = enter.append("g").attr("class", "glabel").attr("text-anchor", "middle");
      g.append("text").attr("class", "name");
      g.append("text").attr("class", "need").attr("dy", "1.3em");
      return g;
    });
    labels.select(".name").text((g) => g.name);
    labels.select(".need").attr("class", (g) => `need${g.mode === "heads_down" ? " hd" : ""}`).text(needLine);

    // Only reheat when someone moved table or the screen changed; style-only renders (glows) stay still.
    const sig = `${W}x${H}|` + visible.map((p) => `${p.id}:${p.group_id || 0}`).join(",");
    if (sig !== lastSig) {
      lastSig = sig;
      sim.nodes(visible);
      sim.alpha(Math.max(sim.alpha(), 0.5)).restart();
    } else tick();
    $("here").textContent = [...S.people.values()].filter((p) => p.here).length;
  }

  function needLine(g) {
    if (g.mode === "heads_down") return "heads-down";
    const open = S.needs.filter((n) => n.group_id === g.id && !n.handled_by).map((n) => n.need);
    return open.length ? `needs ${open.join(", ")}` : "";
  }

  function hullOf(gid) {
    const ms = visible.filter((p) => p.group_id === gid);
    if (!ms.length) return null;
    const cx = d3.mean(ms, (p) => p.x), cy = d3.mean(ms, (p) => p.y);
    const r = d3.max(ms, (p) => Math.hypot(p.x - cx, p.y - cy) + radius(p)) + 30;
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
      return h ? `translate(${h.cx},${h.cy - h.r - 30})` : null;
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
      .transition().duration(1400).ease(d3.easeCubicOut).attr("r", 80).style("opacity", 0).remove();
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

  // ------------------------------------------------------------ arrival line

  // Template line right away, swapped for the Gemini icebreaker if it lands while the line is still up.
  let arrivalTimer = null, arrivalKey = "";
  function arrival(p, sugg) {
    const box = $("arrival");
    box.replaceChildren();
    const b = document.createElement("b");
    b.textContent = p.name;
    box.append(b);
    arrivalKey = "";
    if (sugg.length) {
      const top = sugg[0], g = S.groups.get(top.group_id);
      arrivalKey = `${p.id}-${top.group_id}`;
      const table = g?.name || `Table ${top.group_id}`;
      if (top.reason?.startsWith("needs ")) {
        const em = document.createElement("em");
        em.textContent = top.reason.slice(6);
        box.append(`: ${table} needs `, em);
      } else {
        box.append(`: try ${table} (${top.reason})`);
      }
    } else {
      box.append(" is here");
    }
    box.classList.add("on");
    clearTimeout(arrivalTimer);
    arrivalTimer = setTimeout(() => box.classList.remove("on"), 10000);
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
      arrival(p, sugg);
    },
    icebreaker(d) {
      if (arrivalKey !== `${d.person_id}-${d.group_id}`) return;
      $("arrival").textContent = d.text;
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
    },
    help(d) {
      ripple(d.mentor_id, COLOR.mentor);
      glow(d.group_id);
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
      render();
    },
    needs_updated(d) {
      S.needs = d.needs || [];
      render();
    },
    person_created() {
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
    const conn = $("conn");
    const ws = new WebSocket(WS);
    ws.onopen = () => {
      backoff = 1000;
      conn.className = "conn live";
      syncAll().catch((e) => console.error("sync", e));  // catch up on anything missed while down
    };
    ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => {
      conn.className = "conn down";
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
  window.addEventListener("resize", () => render());
  connect();
})();
