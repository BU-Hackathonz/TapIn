// Host screen: a static, flat room plan for the wall. Display only. Loads the same snapshots as the wall (/api/graph,
// /api/needs, /api/stats, /api/leaderboard), follows /ws, and never shows demo data: if the server is gone it says so and
// keeps retrying. Needs: vendor/d3-force.min.js, room_layout.js, sound.js (Tone).
//   ?server=host:port   point at another server (testing against tools/fake_taps.py --events)
//   ?silent             skip the Start screen (no sound)
//   ?venue=Name         small text next to the wordmark
(() => {
  "use strict";
  const qs = new URLSearchParams(location.search);
  const HOST = qs.get("server") || location.host;
  const HTTP = `${location.protocol}//${HOST}`;
  const WSURL = `${location.protocol === "https:" ? "wss" : "ws"}://${HOST}/ws`;
  const $ = (id) => document.getElementById(id);
  const canvas = $("room"), ctx = canvas.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const C = { bg: v("--bg"), fg: v("--fg"), muted: v("--muted"), dim: v("--dim"), pink: v("--pink"), green: v("--green"), forest: v("--forest") };
  const SANS = v("--sans"), MONO = v("--mono");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const low = (s) => String(s ?? "").toLowerCase();
  const clock = (d = new Date()) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

  if (qs.get("venue")) $("venue").textContent = qs.get("venue");

  // ------------------------------------------------------------ state
  const S = { people: new Map(), groups: new Map(), links: [], needs: [], stats: null, board: null };
  let graphRaw = null, layout = null, W = 0, H = 0, K = 1, TOP = 0, BOT = 0;   // TOP and BOT keep the plan clear of the wordmark and the strip
  const born = new Map();          // person id -> time first seen live (fade-in)
  const activity = [];
  const ice = new Map();           // person id -> Gemini line (kept briefly)

  const fs = (px) => Math.max(18, Math.round(px * K));   // nothing under 18 px
  const font = (px, weight = 400, mono = false) => `${weight} ${fs(px)}px ${mono ? MONO : SANS}`;

  function buildLayout() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(400, r.width); H = Math.max(300, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    K = Math.max(0.8, H / 1000);
    TOP = 96 * K; BOT = 40 * K;
    layout = RoomLayout.create(d3, { width: W, height: H - TOP - BOT, seed: 7, radiusScale: K * 1.15, labelPxPerChar: 12 * K, collidePad: 28 * K, boxX: 70 * K, boxTop: 100 * K, boxBottom: 74 * K });
    if (graphRaw) layout.setData(graphRaw);
  }

  // ------------------------------------------------------------ data
  async function getJSON(path) {
    const r = await fetch(HTTP + path, { cache: "no-store" });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
  }
  const labelOf = (p) => (p.role !== "student" ? `${p.name}, ${p.role}` : p.focus ? `${p.name} (focus)` : p.name);

  function applyGraph(g) {
    graphRaw = { ...g, people: g.people.map((p) => ({ ...p, label: labelOf(p) })) };
    S.people = new Map(g.people.map((p) => [p.id, p]));
    S.groups = new Map(g.groups.map((x) => [x.id, x]));
    S.links = g.links;
    const before = new Set(layout.positions().map((p) => p.id));
    layout.setData(graphRaw);
    const now = performance.now();
    if (before.size) for (const p of layout.positions()) if (!before.has(p.id)) born.set(p.id, now);   // a live arrival fades in
  }
  async function syncGraph() { applyGraph(await getJSON("/api/graph")); renderSide(); }
  async function syncAll() {
    const [g, n, s, b] = await Promise.allSettled([getJSON("/api/graph"), getJSON("/api/needs"), getJSON("/api/stats"), getJSON("/api/leaderboard")]);
    if (g.status !== "fulfilled") throw g.reason;
    applyGraph(g.value);
    if (n.status === "fulfilled") S.needs = n.value;
    if (s.status === "fulfilled") S.stats = s.value;
    if (b.status === "fulfilled") S.board = b.value;
    renderSide();
  }
  let soonTimer = 0;
  const syncSoon = (ms = 350) => { clearTimeout(soonTimer); soonTimer = setTimeout(() => syncAll().catch((e) => console.error("sync", e)), ms); };

  // ------------------------------------------------------------ right column
  const mins = (iso) => {
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  function renderSide() {
    const st = S.stats;
    $("statline").innerHTML = st ? `<b>${st.here}</b> here · <b>${st.groups}</b> groups · <b>${st.links_today}</b> links today` : "";

    const top = (S.board?.groups || []).slice(0, 4);
    $("groups").innerHTML = top.length
      ? top.map((g, i) => {
        const full = S.groups.get(g.id);
        return `<li class="${i === 0 && g.points > 0 ? "top" : ""}"><span class="t">${esc(g.name + (full?.working_on ? ", " + full.working_on : ""))}</span><span class="v">${g.points}</span></li>`;
      }).join("")
      : `<li class="empty">No tables yet</li>`;

    const open = S.needs.filter((n) => n.handled_by == null).sort((a, b) => new Date(a.since) - new Date(b.since)).slice(0, 4);
    const done = S.needs.filter((n) => n.handled_by != null).slice(0, Math.max(0, 5 - open.length));
    $("needs").innerHTML = (open.length || done.length)
      ? open.map((n, i) => `<li class="wait ${i === 0 ? "top" : ""}"><span class="t">${esc(n.table)} · ${esc(n.need)}</span><span class="v">${mins(n.since)}</span></li>`).join("")
        + done.map((n) => `<li class="done"><span class="t">${esc(n.table)} · ${esc(n.need)}</span><span class="v">${esc(S.people.get(n.handled_by)?.name || "")}</span></li>`).join("")
      : `<li class="empty">No table is asking for help</li>`;

    $("activity").innerHTML = activity.slice(0, 5).map((a) => `<li><span class="tm">${esc(a.t)}</span>${a.html}</li>`).join("")
      || `<li class="empty">Nothing yet</li>`;

    const buckets = st?.scans_10min || [];
    const max = Math.max(1, ...buckets.map((b) => b.count));
    $("bars").innerHTML = buckets.map((b, i) => `<i class="${i === buckets.length - 1 ? "now" : ""}" style="height:${Math.max(3, Math.round((b.count / max) * 100))}%"></i>`).join("");
  }
  const addLog = (html) => { activity.unshift({ t: clock().replace(/ ?[ap]m/, ""), html }); activity.length = Math.min(activity.length, 12); };

  // ------------------------------------------------------------ moments (one at a time, about 8 s each)
  const queue = [];
  let cur = null;
  const stripHTML = (m) => {
    const tail = m.ice || m.tail;
    return m.main + (tail ? ` <span>${esc(tail)}</span>` : "");
  };
  function show(m, now) {
    m.until = now + (queue.length > 1 ? 4500 : 8000);
    m.start = now;
    if (!m.ice && m.person != null && ice.has(m.person)) m.ice = ice.get(m.person);
    $("mtime").textContent = clock();
    $("mtext").innerHTML = stripHTML(m);
    if (typeof Sound !== "undefined" && Sound.started) {
      if (m.sound === "arrive") Sound.arrive();
      if (m.links) Sound.links(m.links);
    }
  }
  function pump(now) {
    if (cur && now < cur.until) return;
    cur = null;
    if (!queue.length) return;
    cur = queue.shift();
    show(cur, now);
  }
  const enqueue = (m) => { if (queue.length >= 4) queue.shift(); queue.push(m); };
  const table = (gid) => S.groups.get(gid)?.name || "a table";
  const first = (ids) => ids.map((id) => S.people.get(id)?.name).filter(Boolean);

  // ------------------------------------------------------------ events
  const on = {
    async checked_in(d) {
      await syncGraph().catch((e) => console.error("sync", e));       // they are "here" now; the layout spawns them at the Entrance
      const p = S.people.get(d.person_id);
      if (!p) return;
      const known = first(d.known_here || []);
      const sg = (d.suggested_groups || [])[0];
      const g = sg && S.groups.get(sg.group_id);
      const tail = g ? (/^needs/.test(sg.reason || "") ? `${g.name} ${sg.reason}.` : `${g.name}: ${sg.reason}.`) : "";
      addLog(`${esc(low(p.name))} checked in`);
      enqueue({ kind: "checkin", person: p.id, known: d.known_here || [], group: g ? g.id : null, sound: "arrive",
        main: `<b>${esc(p.name)}</b> checked in.` + (known.length ? ` Knows ${esc(list(known))}.` : ""), tail });
      syncSoon(600);
    },
    async group_formed(d) {
      await syncGraph().catch((e) => console.error("sync", e));
      const names = first(d.member_ids || []);
      const n = (d.member_ids || []).length;
      addLog(`<em>${esc(low(table(d.group_id)))}</em> formed`);
      enqueue({ kind: "formed", group: d.group_id, known: [], links: (n * (n - 1)) / 2, main: `<b>${esc(table(d.group_id))}</b> formed: ${esc(list(names))}.`, tail: "" });
      syncSoon(600);
    },
    async group_joined(d) {
      await syncGraph().catch((e) => console.error("sync", e));
      const names = first(d.new_member_ids || []);
      addLog(`${esc(low(list(names)))} joined <em>${esc(low(table(d.group_id)))}</em>`);
      enqueue({ kind: "joined", group: d.group_id, known: [], links: (d.new_links || []).length, main: `<b>${esc(list(names))}</b> joined ${esc(table(d.group_id))}.`, tail: "" });
      syncSoon(600);
    },
    help(d) {
      const mentor = S.people.get(d.mentor_id);
      addLog(`${esc(low(mentor?.name || "a mentor"))} helped <em>${esc(low(table(d.group_id)))}</em>`);
      enqueue({ kind: "help", person: d.mentor_id, group: d.group_id, known: [], links: 1, main: `<b>${esc(mentor?.name || "A mentor")}</b> is helping ${esc(table(d.group_id))}.`, tail: "" });
      syncSoon(600);
    },
    link_strengthened() { syncSoon(800); },
    points_updated() { syncSoon(500); },
    needs_updated(d) { S.needs = d.needs || []; renderSide(); },
    stats_updated(d) { S.stats = d; renderSide(); },
    icebreaker(d) {
      ice.set(d.person_id, d.text);
      if (cur && cur.kind === "checkin" && cur.person === d.person_id) { cur.ice = d.text; $("mtext").innerHTML = stripHTML(cur); }
      setTimeout(() => ice.delete(d.person_id), 120000);
    },
    person_created() { syncSoon(500); },
  };

  // ------------------------------------------------------------ drawing
  function clusters(pos) {
    const by = new Map();
    for (const p of pos) if (p.gid != null) (by.get(p.gid) ?? by.set(p.gid, []).get(p.gid)).push(p);
    const out = new Map();
    for (const [gid, ms] of by) {
      const x = ms.reduce((s, p) => s + p.x, 0) / ms.length, y = ms.reduce((s, p) => s + p.y, 0) / ms.length;
      out.set(gid, { x, y, r: Math.max(...ms.map((p) => Math.hypot(p.x - x, p.y - y) + p.r)), n: ms.length });
    }
    return out;
  }

  // Which links to draw. The physics uses every link; the picture does not need them all.
  //  - inside a table: a minimum spanning tree (n - 1 lines), plus any link that has been scanned again and again
  //  - a mentor or staff member: one line per table helped, to the nearest member (a bridge, not a fan)
  //  - everything else (between tables, solo people): drawn faintly
  function visibleLinks(byId) {
    const out = [], sameBy = new Map(), bridge = new Map();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    for (const l of S.links) {
      const a = byId.get(l.a), b = byId.get(l.b);
      if (!a || !b) continue;
      const ha = a.role !== "student", hb = b.role !== "student";
      if (ha && hb) { out.push({ a, b, kind: "helper", strength: l.strength }); continue; }
      if (ha || hb) {
        const h = ha ? a : b, p = ha ? b : a;
        if (p.gid == null) { out.push({ a: h, b: p, kind: "helper", strength: l.strength }); continue; }
        const key = `${h.id}:${p.gid}`, d = dist(h, p), best = bridge.get(key);
        if (!best || d < best.d) bridge.set(key, { a: h, b: p, d, strength: l.strength });
        continue;
      }
      if (a.gid != null && a.gid === b.gid) { (sameBy.get(a.gid) ?? sameBy.set(a.gid, []).get(a.gid)).push({ a, b, strength: l.strength }); continue; }
      out.push({ a, b, kind: "cross", strength: l.strength });
    }
    for (const x of bridge.values()) out.push({ a: x.a, b: x.b, kind: "helper", strength: x.strength });
    for (const ls of sameBy.values()) {
      const parent = new Map();
      for (const l of ls) { parent.set(l.a.id, l.a.id); parent.set(l.b.id, l.b.id); }
      const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
      for (const l of ls.sort((p, q) => dist(p.a, p.b) - dist(q.a, q.b))) {
        const ra = find(l.a.id), rb = find(l.b.id);
        if (ra !== rb) { parent.set(ra, rb); out.push({ ...l, kind: "same" }); }
        else if ((l.strength || 1) >= 3) out.push({ ...l, kind: "same" });
      }
    }
    return out;
  }

  // A quiet grid of small square dots behind the plan. It never reacts to a mouse (this screen is display only); instead
  // the grid lights up where something just happened: pink under the person who just checked in, green under a table
  // that just formed, grew or got help. The glow fades in and out over the moment.
  function drawGrid(t, m, byId, cl) {
    const step = Math.max(22, 28 * K), s = Math.max(2, 2.2 * K);
    let spot = null;
    if (m) {
      const k = Math.min(1, (t - m.start) / 450) * Math.max(0, Math.min(1, (m.until - t) / 1400));
      const target = m.kind === "checkin" ? byId.get(m.person) : cl.get(m.group);
      if (target && k > 0) spot = { x: target.x, y: target.y + TOP, k, color: m.kind === "checkin" ? C.pink : C.green };
    }
    const R = 260 * K;
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        let boost = 0;
        if (spot) { const d = Math.hypot(x - spot.x, y - spot.y); if (d < R) boost = (1 - d / R) ** 2 * spot.k; }
        if (boost > 0.02) {
          const g = s * (1 + boost * 1.6);
          ctx.globalAlpha = 0.25 + 0.75 * boost; ctx.fillStyle = spot.color;
          ctx.fillRect(x - g / 2, y - g / 2, g, g);
        } else {
          ctx.globalAlpha = 0.5; ctx.fillStyle = C.forest;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
  function halo(text, x, y, fill) {      // text with a thin background-colored outline, so lines never hide it
    ctx.lineJoin = "round"; ctx.lineWidth = 5 * K; ctx.strokeStyle = C.bg;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const pos = layout.positions();
    if (!pos.length) {
      ctx.fillStyle = C.dim; ctx.font = font(28); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Waiting for people to tap in", W / 2, H / 2);
      return;
    }
    const byId = new Map(pos.map((p) => [p.id, p]));
    const cl = clusters(pos);
    const m = cur && t < cur.until ? cur : null;
    drawGrid(t, m, byId, cl);
    ctx.save();
    ctx.translate(0, TOP);                         // the plan sits below the wordmark and above the strip
    const hiGroup = m && m.group != null ? m.group : null;
    const hiColor = m && m.kind === "checkin" ? C.pink : C.green;

    // links
    ctx.lineCap = "round";
    for (const l of visibleLinks(byId)) {
      ctx.globalAlpha = l.kind === "same" ? 0.55 : l.kind === "helper" ? 0.6 : 0.28;
      ctx.strokeStyle = l.kind === "cross" ? C.muted : C.green;
      ctx.lineWidth = 1.5 * K + Math.min(3, Math.max(0, (l.strength || 1) - 1)) * 0.5;
      ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the moment: lines from the newest person to the people they know
    if (m && m.kind === "checkin") {
      const me = byId.get(m.person);
      if (me) {
        ctx.strokeStyle = C.pink; ctx.lineWidth = 2.6 * K;
        for (const id of m.known) {
          const o = byId.get(id);
          if (o) { ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(o.x, o.y); ctx.stroke(); }
        }
      }
    }

    // table labels, and the dashed ring around the table the moment is about
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    for (const [gid, c] of cl) {
      const g = S.groups.get(gid);
      if (!g) continue;
      const needs = S.needs.filter((n) => n.group_id === gid && n.handled_by == null).map((n) => n.need);
      // Two short lines above the cluster: "table 2 · robot arm" and "needs firmware" (or "heads-down").
      const l1 = trunc(low(g.name) + (g.working_on ? " · " + low(g.working_on) : ""), 30);
      const l2 = g.mode === "heads_down" ? "heads-down" : needs.length ? trunc("needs " + low(needs.join(", ")), 32) : "";
      const hi = gid === hiGroup;
      ctx.font = font(18, hi ? 600 : 500, true);
      const half = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) / 2;
      const x = Math.min(W - half - 12, Math.max(half + 12, c.x));
      const lineH = fs(18) * 1.3;
      const bottom = Math.max(lineH * 2 + 4, c.y - c.r - (hi ? 44 : 20) * K);   // above the ring when there is one
      const col = g.mode === "heads_down" ? C.dim : hi ? hiColor : C.green;
      if (l2) halo(l2, x, bottom, col);
      halo(l1, x, bottom - (l2 ? lineH : 0), col);
      if (hi) {
        ctx.save();
        ctx.setLineDash([7 * K, 7 * K]); ctx.strokeStyle = hiColor; ctx.lineWidth = 2 * K;
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t / 380);
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 16 * K, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    // people
    const order = [...pos].sort((p, q) => (m && p.id === m.person ? 1 : 0) - (m && q.id === m.person ? 1 : 0));
    for (const p of order) {
      const g = p.gid != null ? S.groups.get(p.gid) : null;
      const quiet = p.focus || (g && g.mode === "heads_down");
      const newest = m && m.kind === "checkin" && m.person === p.id;
      const known = m && m.kind === "checkin" && m.known.includes(p.id);
      const helper = p.role !== "student";
      const age = born.has(p.id) ? Math.min(1, (t - born.get(p.id)) / 700) : 1;
      ctx.globalAlpha = 0.2 + 0.8 * age;
      const r = p.r * (newest ? 1.6 : 1) * (0.6 + 0.4 * age);
      const col = newest ? C.pink : quiet ? C.dim : C.green;
      ctx.lineWidth = 2 * K;
      if (helper) {
        ctx.strokeStyle = col; ctx.fillStyle = C.bg;
        ctx.beginPath(); ctx.rect(p.x - r, p.y - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
      } else if (quiet) {
        ctx.strokeStyle = col; ctx.fillStyle = C.bg;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
      if (newest) {                                          // the ring means "newest" without relying on color alone
        ctx.strokeStyle = C.pink; ctx.lineWidth = 2.4 * K;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t / 300);
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 9 * K, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 0.2 + 0.8 * age;
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      const label = labelOf({ name: p.name, role: p.role, focus: p.focus });
      ctx.font = newest ? font(24, 600) : font(20, known || helper ? 500 : 400);
      const lw = ctx.measureText(label).width / 2;
      const lx = Math.min(W - lw - 8, Math.max(lw + 8, p.x));                  // keep names inside the plan
      halo(label, lx, p.y + r + fs(newest ? 24 : 20) + 2, newest || known ? C.fg : quiet ? C.dim : "#d4cebf");
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  let last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    pump(t);
    const moving = layout && !layout.isSettled();
    if (!moving && !(cur && t < cur.until) && t - last < 500) return;     // idle: two redraws a second
    last = t;
    if (moving) layout.step(1);
    draw(t);
  }

  // ------------------------------------------------------------ connection (never falls back to demo data)
  const conn = $("conn");
  let backoff = 1000, queueP = Promise.resolve(), everOpen = false;
  function connect() {
    let ws;
    try { ws = new WebSocket(WSURL); } catch (e) { retry(); return; }
    ws.onopen = () => {
      backoff = 1000; everOpen = true; conn.hidden = true;
      queueP = queueP.then(syncAll).catch((e) => console.error("sync", e));      // catch up before handling new events
    };
    ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      const fn = on[msg.type];
      if (fn) queueP = queueP.then(() => fn(msg.data)).catch((err) => console.error(msg.type, err));
    };
    ws.onclose = retry;
    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
  }
  function retry() {
    conn.textContent = everOpen ? "Reconnecting…" : "Waiting for the server…";
    conn.hidden = false;
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 5000);
  }

  // ------------------------------------------------------------ boot
  if (qs.has("silent")) $("start").classList.add("gone");
  $("start-btn").addEventListener("click", async () => {
    $("start").classList.add("gone");
    try { await Sound.start(); } catch (e) { console.error("sound", e); }
  });
  buildLayout();
  let rt = 0;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(buildLayout, 250); }).observe($("stage"));
  renderSide();
  connect();
  setInterval(renderSide, 30000);                                               // minutes waiting tick forward
  setInterval(() => { if (everOpen) syncAll().catch(() => {}); }, 60000);       // safety resync
  requestAnimationFrame(frame);
})();
