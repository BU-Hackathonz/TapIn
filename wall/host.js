// Host screen: a static, calm room plan for the wall. Display only. Loads the same snapshots as the wall (/api/graph,
// /api/needs, /api/stats, /api/leaderboard), follows /ws, and never shows demo data: if the server is gone it says so and
// keeps retrying. Needs room_layout.js and sound.js (Tone).
//   ?server=host:port   point at another server (testing against tools/fake_taps.py --events)
//   ?silent             skip the Start screen (no sound)
//   ?venue=Name         small text next to the wordmark
//   ?palette=moss|sand|cool   ground palette to compare      ?logo=strip|ghost|side   wordmark placement
(() => {
  "use strict";
  const qs = new URLSearchParams(location.search);
  if (qs.get("palette")) document.documentElement.dataset.palette = qs.get("palette");
  if (qs.get("logo")) document.documentElement.dataset.logo = qs.get("logo");
  const HOST = qs.get("server") || location.host;
  const HTTP = `${location.protocol}//${HOST}`;
  const WSURL = `${location.protocol === "https:" ? "wss" : "ws"}://${HOST}/ws`;
  const $ = (id) => document.getElementById(id);
  const canvas = $("room"), ctx = canvas.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const C = { bg: v("--bg"), fg: v("--fg"), muted: v("--muted"), dim: v("--dim"), pink: v("--pink"), green: v("--green"), forest: v("--forest"), sand: v("--sand") };
  const SANS = v("--sans"), MONO = v("--mono");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const low = (s) => String(s ?? "").toLowerCase();
  const clock = (d = new Date()) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

  if (qs.get("venue")) $("venue").textContent = qs.get("venue");

  // ------------------------------------------------------------ state
  const S = { people: new Map(), groups: new Map(), links: [], needs: [], stats: null, board: null };
  let graphRaw = null, layout = null, W = 0, H = 0, K = 1;
  const born = new Map();          // person id -> time first seen live (fade-in)
  const activity = [];
  const ice = new Map();           // person id -> Gemini line (kept briefly)

  function buildLayout() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(400, r.width); H = Math.max(300, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    K = Math.max(0.8, H / 1000);
    layout = RoomLayout.create({ width: W, height: H, scale: K, margin: { x: 96 * K, top: 120 * K, bottom: 150 * K } });
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
      await syncGraph().catch((e) => console.error("sync", e));       // they are "here" now; they walk in from the Entrance
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
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
  function halo(text, x, y, fill) {      // text with a thin ground-colored outline, so lines never hide it
    ctx.lineJoin = "round"; ctx.lineWidth = 5 * K; ctx.strokeStyle = C.bg;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  // A quiet grid of small square dots behind the plan. It never reacts to a mouse (this screen is display only); instead
  // the grid lights up where something just happened: pink under the person who just checked in, green under a table that
  // just formed, grew or got help. The glow fades in and out over the moment.
  function drawGrid(t, m, byId, tables) {
    const step = Math.max(22, 28 * K), s = Math.max(2, 2.2 * K);
    let spot = null;
    if (m) {
      const k = Math.min(1, (t - m.start) / 450) * Math.max(0, Math.min(1, (m.until - t) / 1400));
      const target = m.kind === "checkin" ? byId.get(m.person) : tables.get(m.group);
      if (target && k > 0) spot = { x: target.x, y: target.y, k, color: m.kind === "checkin" ? C.pink : C.green };
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

  function line(x1, y1, x2, y2, color, alpha, width) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function curve(x1, y1, x2, y2, color, alpha, width) {    // a gentle arc, so a line between tables does not cut straight through a third one
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1;
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) / 2 - (dy / d) * d * 0.16, (y1 + y2) / 2 + (dx / d) * d * 0.16, x2, y2);
    ctx.stroke();
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const pos = layout.positions();
    if (!pos.length) {
      ctx.fillStyle = C.dim; ctx.font = `400 ${Math.round(28 * K)}px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Waiting for people to tap in", W / 2, H / 2);
      return;
    }
    const tables = layout.tables();
    const byId = new Map(pos.map((p) => [p.id, p]));
    const m = cur && t < cur.until ? cur : null;
    const hiGroup = m && m.group != null ? m.group : null;
    const hiColor = m && m.kind === "checkin" ? C.pink : C.green;
    const lab = Math.max(14, Math.round(16 * K)), nameSz = Math.max(16, Math.round(17 * K));
    drawGrid(t, m, byId, tables);

    // ---- links, drawn quietly under everything else
    ctx.lineCap = "round";
    for (const [, tb] of tables) {                                   // inside a table: a necklace round the seats
      const ms = pos.filter((p) => p.gid === tb.id).sort((a, b) => a.ang - b.ang);
      if (ms.length < 2) continue;
      ctx.globalAlpha = 0.4; ctx.strokeStyle = C.green; ctx.lineWidth = 1.3 * K;
      ctx.beginPath();
      ms.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (ms.length > 2) ctx.closePath();
      ctx.stroke();
    }
    const between = new Map(), bridge = new Map();
    for (const l of S.links) {
      const a = byId.get(l.a), b = byId.get(l.b);
      if (!a || !b) continue;
      const ha = a.role !== "student", hb = b.role !== "student";
      if (ha || hb) {                                                // a mentor: one line per table helped, to the nearest seat
        const h = ha ? a : b, o = ha ? b : a;
        if (hb && ha) continue;
        const key = `${h.id}:${o.gid ?? "x" + o.id}`, d = Math.hypot(h.x - o.x, h.y - o.y), best = bridge.get(key);
        if (!best || d < best.d) bridge.set(key, { a: h, b: o, d, own: o.gid != null && o.gid === h.seatTable });
        continue;
      }
      if (a.gid != null && b.gid != null && a.gid !== b.gid) {       // between tables: one faint line per pair of tables
        const k = a.gid < b.gid ? `${a.gid}-${b.gid}` : `${b.gid}-${a.gid}`;
        between.set(k, (between.get(k) || 0) + 1);
      }
    }
    for (const [k, c] of between) {
      const [g1, g2] = k.split("-").map(Number), A = tables.get(g1), B = tables.get(g2);
      if (!A || !B) continue;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, ra = A.R + 34 * K, rb = B.R + 34 * K;
      if (d <= ra + rb) continue;
      curve(A.x + (dx / d) * ra, A.y + (dy / d) * ra, B.x - (dx / d) * rb, B.y - (dy / d) * rb, C.muted, 0.14 + 0.05 * Math.min(c, 4), (1 + 0.3 * Math.min(c, 4)) * K);
    }
    for (const x of bridge.values()) line(x.a.x, x.a.y, x.b.x, x.b.y, C.green, x.own ? 0.6 : 0.2, (x.own ? 1.5 : 1) * K);   // strong to its own table, faint to the others
    ctx.globalAlpha = 1;
    if (m && m.kind === "checkin") {                                 // the moment: lines from the newest person to those they know
      const me = byId.get(m.person);
      if (me) for (const id of m.known) {
        const o = byId.get(id);
        if (o) line(me.x, me.y, o.x, o.y, C.pink, 0.9, 2.2 * K);
      }
      ctx.globalAlpha = 1;
    }

    // ---- table rings (slowly turning) and labels above them
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    for (const [gid, tb] of tables) {
      const g = S.groups.get(gid);
      if (!g) continue;
      const ringR = tb.R + 34 * K, hi = gid === hiGroup, quiet = g.mode === "heads_down";
      ctx.save();
      ctx.lineWidth = (hi ? 2.2 : 1.5) * K;
      ctx.setLineDash(hi ? [10 * K, 8 * K] : [3 * K, 9 * K]);
      ctx.lineDashOffset = -(t / (hi ? 30 : 140)) * (gid % 2 ? 1 : -1);   // neighbouring rings turn opposite ways
      ctx.strokeStyle = hi ? hiColor : quiet ? C.dim : C.forest;
      ctx.globalAlpha = hi ? 0.75 + 0.25 * Math.sin(t / 380) : quiet ? 0.55 : 0.95;
      ctx.beginPath(); ctx.arc(tb.x, tb.y, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      const needs = S.needs.filter((n) => n.group_id === gid && n.handled_by == null).map((n) => n.need);
      const l1 = trunc(low(g.name) + (g.working_on ? " · " + low(g.working_on) : ""), 30);
      const l2 = quiet ? "heads-down" : needs.length ? trunc("needs " + low(needs.join(", ")), 32) : "";
      ctx.font = `${hi ? 600 : 500} ${lab}px ${MONO}`;
      const half = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) / 2;
      const x = Math.min(W - half - 10, Math.max(half + 10, tb.x));
      const lineH = lab * 1.35, y2 = tb.y - ringR - 10 * K;
      if (l2) halo(l2, x, y2, quiet ? C.dim : hi ? hiColor : C.muted);
      halo(l1, x, y2 - (l2 ? lineH : 0), quiet ? C.dim : hi ? hiColor : C.green);
    }
    ctx.globalAlpha = 1;

    // ---- people
    const order = [...pos].sort((p, q) => (m && p.id === m.person ? 1 : 0) - (m && q.id === m.person ? 1 : 0));
    for (const p of order) {
      const g = p.gid != null ? S.groups.get(p.gid) : null;
      const quiet = p.focus || (g && g.mode === "heads_down");
      const newest = m && m.kind === "checkin" && m.person === p.id;
      const known = m && m.kind === "checkin" && m.known.includes(p.id);
      const helper = p.role !== "student";
      const age = born.has(p.id) ? Math.min(1, (t - born.get(p.id)) / 900) : 1;
      ctx.globalAlpha = 0.2 + 0.8 * age;
      const r = p.r * (newest ? 1.9 : 1);
      const col = newest ? C.pink : quiet ? C.dim : C.green;
      ctx.lineWidth = 1.8 * K;
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
        ctx.strokeStyle = C.pink; ctx.lineWidth = 2.2 * K;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t / 300);
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 8 * K, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 0.2 + 0.8 * age;

      // Names sit outward from the table, like a seating chart; solo people get theirs underneath.
      const label = labelOf({ name: p.name, role: p.role, focus: p.focus });
      const size = newest ? Math.round(nameSz * 1.3) : nameSz;
      ctx.font = `${newest || known || helper ? 600 : 400} ${size}px ${SANS}`;
      const fill = newest ? C.fg : known ? C.fg : quiet ? C.dim : C.sand;
      const w = ctx.measureText(label).width, gap = r + 8 * K;
      const seated = p.cx != null || p.seatTable != null;
      let align = "center", x = p.x, y = p.y + r + size + 2 * K, base = "alphabetic";
      if (seated && !p.solo) {
        const c = Math.cos(p.ang), sn = Math.sin(p.ang);
        if (c > 0.3) { align = "left"; x = p.x + gap; y = p.y; base = "middle"; }
        else if (c < -0.3) { align = "right"; x = p.x - gap; y = p.y; base = "middle"; }
        else if (sn < 0) { x = p.x; y = p.y - gap; }
      }
      if (align === "left" && x + w > W - 8) { align = "right"; x = p.x - gap; }
      if (align === "right" && x - w < 8) { align = "left"; x = p.x + gap; }
      if (align === "center") x = Math.min(W - w / 2 - 8, Math.max(w / 2 + 8, x));
      ctx.textAlign = align; ctx.textBaseline = base;
      halo(label, x, y, fill);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
  }

  let last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    pump(t);
    const moving = layout && !layout.isSettled();
    if (!moving && t - last < 48) return;            // at rest: about 20 redraws a second, enough for the turning rings
    last = t;
    if (moving) layout.step();
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
