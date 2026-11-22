// Host screen: a static, calm room plan for the wall. Display only. Loads the same snapshots as the wall (/api/graph,
// /api/needs, /api/stats, /api/leaderboard), follows /ws, and never shows demo data: if the server is gone it says so and
// keeps retrying. Needs room_layout.js and sound.js (Tone).
//   ?server=host:port   point at another server (testing against tools/fake_taps.py --events)
//   ?silent             skip the Start screen (no sound)
//   ?venue=Name         small text next to the wordmark
//   ?palette=moss|sand|cool|sandlight   ground palette to compare      ?logo=strip|ghost|side   wordmark placement
//   ?grid   bring back the dot grid (parked)      ?mouse=off   the mouse does not stir the background
(() => {
  "use strict";
  const qs = new URLSearchParams(location.search);
  // ?v=1..10 picks one of ten looks (1 is the default sand). Each is a palette (in host.css) plus a few drawing choices (here).
  const VARIANTS = {
    1: { ring: "dash", node: "dot", lw: 1 }, 2: { ring: "dash", node: "dot", lw: 1 }, 3: { ring: "dot", node: "dot", lw: 1.1 },
    4: { ring: "solid", node: "ring", lw: 1.1, grid: true }, 5: { ring: "dash", node: "ring", lw: 1, grid: true }, 6: { ring: "dash", node: "dot", lw: 1 },
    7: { ring: "solid", node: "dot", lw: 1.35 }, 8: { ring: "dash", node: "glow", lw: 1 }, 9: { ring: "dot", node: "ring", lw: 1.1 }, 10: { ring: "dash", node: "glow", lw: 1 },
    11: { ring: "dash", node: "dot", lw: 1 },
  };
  const VN = Math.min(11, Math.max(1, parseInt(qs.get("v"), 10) || 11)), V = VARIANTS[VN], LW = V.lw;
  if (VN > 1) document.documentElement.dataset.v = String(VN);
  document.documentElement.dataset.palette = VN > 1 ? "v" : qs.get("palette") || "sand";
  if (qs.get("s")) document.documentElement.dataset.s = qs.get("s");
  if (!qs.get("s") && !qs.get("h") && !qs.has("classic")) { document.documentElement.dataset.s = "1"; document.documentElement.dataset.h = "7"; }
  if (qs.get("h")) { document.documentElement.dataset.h = qs.get("h"); if (!qs.get("s")) document.documentElement.dataset.s = "1"; }   // ?h=1..6: variations on draft 1 with the markers and heading rectangles of draft 2      // ?s=1..6: Boston T (MBTA) style drafts for the side column and bottom bar
  if (qs.get("logo")) document.documentElement.dataset.logo = qs.get("logo");
  const HOST = qs.get("server") || location.host;
  const HTTP = `${location.protocol}//${HOST}`;
  const WSURL = `${location.protocol === "https:" ? "wss" : "ws"}://${HOST}/ws`;
  const $ = (id) => document.getElementById(id);
  const canvas = $("room"), ctx = canvas.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const C = { bg: v("--bg"), fg: v("--fg"), muted: v("--muted"), dim: v("--dim"), pink: v("--pink"), green: v("--green"), forest: v("--forest"), sand: v("--sand"), deep: v("--deep") || v("--forest") };
  const SANS = v("--sans"), MONO = v("--mono");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const low = (s) => String(s ?? "").toLowerCase();
  const clock = (d = new Date()) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

  if (qs.get("venue")) $("venue").textContent = qs.get("venue");

  // ------------------------------------------------------------ state
  const S = { people: new Map(), groups: new Map(), links: [], needs: [], stats: null, board: null };
  let graphRaw = null, layout = null, W = 0, H = 0, K = 1;
  const GRID = qs.has("grid") || !!V.grid, MOUSE = qs.get("mouse") !== "off";
  const born = new Map();          // person id -> time first seen live (fade-in)
  const trails = new Map();        // person id -> recent positions while they glide to a seat
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

  // Only the leading tables are drawn, so the plan stays calm. A table keeps its place unless another one clearly overtakes it.
  const MAXT = qs.has("tables") ? parseInt(qs.get("tables"), 10) : 5;
  const shownT = new Set();
  let hiddenT = 0;
  const onPlan = (gid) => !MAXT || shownT.size === 0 || shownT.has(gid);
  function limitTables(g) {
    const count = new Map();
    for (const p of g.people) if (p.here && p.group_id != null && p.role === "student") count.set(p.group_id, (count.get(p.group_id) || 0) + 1);
    const alive = g.groups.filter((x) => count.has(x.id));
    hiddenT = 0;
    if (!MAXT || alive.length <= MAXT) { shownT.clear(); return g; }
    for (const id of [...shownT]) if (!alive.some((x) => x.id === id)) shownT.delete(id);
    const pts = (x) => x.points || 0;
    const rank = [...alive].sort((a, b) => pts(b) - pts(a) || count.get(b.id) - count.get(a.id) || a.id - b.id);
    for (const x of rank) { if (shownT.size >= MAXT) break; shownT.add(x.id); }
    for (let k = 0; k < MAXT; k++) {                                   // a table on the sidelines swaps in only if it clearly leads
      const weakest = alive.filter((x) => shownT.has(x.id)).sort((a, b) => pts(a) - pts(b))[0];
      const challenger = rank.find((x) => !shownT.has(x.id));
      if (!weakest || !challenger || pts(challenger) <= pts(weakest) * 1.25 + 10) break;
      shownT.delete(weakest.id); shownT.add(challenger.id);
    }
    hiddenT = alive.length - shownT.size;
    const hide = new Set(alive.filter((x) => !shownT.has(x.id)).map((x) => x.id));
    return { ...g, groups: g.groups.filter((x) => !hide.has(x.id)), people: g.people.filter((p) => !(p.group_id != null && hide.has(p.group_id) && p.role === "student")) };
  }

  function applyGraph(g) {
    const lim = limitTables(g);
    graphRaw = { ...lim, people: lim.people.map((p) => ({ ...p, label: labelOf(p) })) };
    const more = document.getElementById("more");
    if (more) { more.hidden = !hiddenT; more.textContent = hiddenT ? `showing the top ${shownT.size} of ${shownT.size + hiddenT} tables` : ""; }
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
  // A number that changes flashes once, so a glance at the column shows what just moved.
  const prevVal = new Map();
  const chg = (k, v) => { const c = prevVal.has(k) && prevVal.get(k) !== v; prevVal.set(k, v); return c; };
  function renderSide() {
    const st = S.stats;
    $("statline").innerHTML = st ? `<b>${st.here}</b> here · <b>${st.groups}</b> groups · <b>${st.links_today}</b> links today` : "";

    const top = (S.board?.groups || []).filter((g) => onPlan(g.id)).slice(0, 4);
    $("groups").innerHTML = top.length
      ? top.map((g, i) => {
        const full = S.groups.get(g.id);
        const tn = parseInt(String(g.name).replace(/\D+/g, ""), 10) || i + 1;
        return `<li class="${i === 0 && g.points > 0 ? "top" : ""}${full?.working_on ? "" : " nowo"}" data-n="${tn}" data-l="${tn % 4}"><span class="t"><b>${esc(g.name)}</b>${full?.working_on ? `<small>${esc(full.working_on.replace(/^an?s+/i, '').replace(/^./, (ch) => ch.toUpperCase()))}</small>` : ""}</span><span class="v ${chg("g:" + g.id, g.points) ? "bump" : ""}">${g.points}</span></li>`;
      }).join("")
      : `<li class="empty">No tables yet</li>`;

    const byTable = (arr) => {
      const m = new Map();
      for (const n of arr) {
        const k = n.group_id + ":" + (n.handled_by ?? "");
        const e = m.get(k) || { table: n.table, needs: [], since: n.since, by: n.handled_by };
        e.needs.push(n.need); if (new Date(n.since) < new Date(e.since)) e.since = n.since;
        m.set(k, e);
      }
      return [...m.values()];
    };
    const tnum = (t) => parseInt(String(t).replace(/\D+/g, ""), 10) || 0;
    const attrs = (t) => `data-n="${tnum(t)}" data-l="${tnum(t) % 4}"`;
    const open = byTable(S.needs.filter((n) => n.handled_by == null && onPlan(n.group_id))).sort((a, b) => new Date(a.since) - new Date(b.since)).slice(0, 4);
    const done = byTable(S.needs.filter((n) => n.handled_by != null && onPlan(n.group_id))).slice(0, Math.max(0, 5 - open.length));
    $("needs").innerHTML = (open.length || done.length)
      ? open.map((e, i) => `<li class="wait ${i === 0 ? "top" : ""}" ${attrs(e.table)}><span class="t"><b class="n">${esc(e.table)} · </b>${esc(e.needs.join(", "))}</span><span class="v">${mins(e.since)}</span></li>`).join("")
        + done.map((e) => `<li class="done" ${attrs(e.table)}><span class="t"><b class="n">${esc(e.table)} · </b>${esc(e.needs.join(", "))}</span><span class="v">${esc(S.people.get(e.by)?.name || "")}</span></li>`).join("")
      : `<li class="empty">No table is asking for help</li>`;

    $("activity").innerHTML = activity.slice(0, 5).map((a) => `<li><span class="tm">${esc(a.t)}</span>${a.html}</li>`).join("")
      || `<li class="empty">Nothing yet</li>`;

    const buckets = st?.scans_10min || [];
    const bmax = Math.max(1, ...buckets.map((b) => b.count));
    $("bars").innerHTML = buckets.map((b, i) => `<i class="${i === buckets.length - 1 ? "now" : ""}" style="height:${Math.max(3, Math.round((b.count / bmax) * 100))}%"></i>`).join("");
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
  let idleShown = false, idleAt = -1e9, tipI = -1;
  const TIPS = ["Tap your badge at a station to join the room.", "Each dashed circle is a table. A line means two people have met.", "Squares are mentors. Hollow dots are people who are heads-down.", "A dot on its own is someone who has tapped in and is waiting to join a table.", "Groups earn points for welcoming someone new."];
  function pump(now) {
    if (cur && now < cur.until) return;
    cur = null;
    if (!queue.length) {
      if (!idleShown || now - idleAt > 7000) {                       // between moments the strip explains the screen, one hint at a time
        idleShown = true; idleAt = now; tipI = (tipI + 1) % TIPS.length;
        $("mtime").textContent = ""; $("mtext").innerHTML = `<span>${TIPS[tipI]}</span>`;
      }
      return;
    }
    idleShown = false;
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
  const rgbOf = (hex) => { const h = String(hex).replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const withAlpha = (hex, a) => { const [r, g, b] = rgbOf(hex); return "rgba(" + r + "," + g + "," + b + "," + a + ")"; };

  // ---- the pixel fume: a small canvas of value noise, warped and drifting, posterized with an ordered (Bayer) dither so it
  // reads as hard foil-like pixels. Pink, with a lighter glint at the brightest step. The mouse stirs it.
  const fume = $("fume"), fctx = fume.getContext("2d");
  const FW = 256, FH = 144;
  fume.width = FW; fume.height = FH;
  const fimg = fctx.createImageData(FW, FH);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((x) => (x + 0.5) / 16);
  const hash = (x, y) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  const fbm = (x, y) => 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.1, y * 2.1) + 0.15 * vnoise(x * 4.3, y * 4.3);
  const mouse = { x: -1, y: -1, t: -1e9 };
  const drawn = { people: [], tables: [] };       // where things were last drawn (room-canvas pixels), for the fume and for picking
  const off = new Map();                          // "p<id>" / "t<gid>" -> { x, y, rel }: how far the user has dragged a person or a table
  let drag = null, springing = false;
  const pushX = new Float32Array(FW * FH), pushY = new Float32Array(FW * FH), pushK = new Float32Array(FW * FH);
  const PINK = rgbOf(C.pink), GLINT = [Math.min(255, PINK[0] + 70), Math.min(255, PINK[1] + 90), Math.min(255, PINK[2] + 60)];
  const FUME_ALPHA = Math.max(0.15, parseFloat(v("--fume")) || 1);
  function drawFume(t) {
    const tt = t / 1000, d = fimg.data;
    const mk = MOUSE ? Math.max(0, 1 - (t - mouse.t) / 2500) : 0;      // the mouse's push fades out two and a half seconds after it stops
    // Everything on the plan pushes the smoke away: people a little, tables more gently, the mouse most of all.
    pushX.fill(0); pushY.fill(0); pushK.fill(0);
    const rc = canvas.getBoundingClientRect(), fsx = FW / innerWidth, fsy = FH / innerHeight;
    const rep = (cx, cy, rad, str) => {
      const fx = (rc.left + cx) * fsx, fy = (rc.top + cy) * fsy, rx = rad * fsx, ry = rad * fsy;
      for (let y = Math.max(0, Math.floor(fy - ry)); y <= Math.min(FH - 1, Math.ceil(fy + ry)); y++) {
        for (let x = Math.max(0, Math.floor(fx - rx)); x <= Math.min(FW - 1, Math.ceil(fx + rx)); x++) {
          const dx = (x - fx) / rx, dy = (y - fy) / ry, d = Math.hypot(dx, dy);
          if (d >= 1) continue;
          const k = (1 - d) * (1 - d) * str, i = y * FW + x, n = d || 1;
          pushK[i] += k; pushX[i] += (dx / n) * k; pushY[i] += (dy / n) * k;
        }
      }
    };
    for (const p of drawn.people) rep(p.x, p.y, 64 * K, 0.95);
    for (const tb of drawn.tables) rep(tb.x, tb.y, tb.R + 46 * K, 0.45);
    if (mk > 0) rep(mouse.x - rc.left, mouse.y - rc.top, 110 * K, 1.3 * mk);
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const pi = y * FW + x;
        const nx = (x / FW) * 3.4 + pushX[pi] * 0.9, ny = (y / FH) * 2.1 + pushY[pi] * 0.6;     // the smoke bends round whatever is in it
        const w = fbm(nx + tt * 0.045, ny - tt * 0.038);
        const sm = fbm(nx * 1.1 + w * 1.7 - tt * 0.03, ny * 1.1 + w * 1.3 + tt * 0.028);   // the smoke itself
        // Two slow swells roll through the smoke and fade, one rising from the lower left every 9 s, a gentler one drifting
        // back from the upper right every 14 s. Between swells only a faint haze is left.
        const u1 = (x / FW) * 0.8 + (1 - y / FH) * 0.4 + (w - 0.5) * 0.45, c1 = -0.35 + ((tt / 9) % 1) * 2.0;
        const u2 = (1 - x / FW) * 0.7 + (y / FH) * 0.4 + (w - 0.5) * 0.45, c2 = -0.35 + (((tt + 5) / 14) % 1) * 2.0;
        const r1 = Math.exp(-(((u1 - c1) / 0.26) ** 2)), r2 = 0.6 * Math.exp(-(((u2 - c2) / 0.22) ** 2));
        let lv = sm * 0.5 + (r1 + r2) * (0.3 + 0.75 * sm);
        lv *= Math.max(0, 1 - pushK[pi] * 0.9);                                              // and thins out right around it
        const q = Math.floor(lv * 3.6 + BAYER[(y & 3) * 4 + (x & 3)]);                  // 0..4 steps, ordered dither
        const i = (y * FW + x) * 4;
        if (q <= 1) { d[i + 3] = 0; continue; }
        const c = q >= 4 ? GLINT : PINK;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
        d[i + 3] = (q === 2 ? 20 : q === 3 ? 44 : 80) * FUME_ALPHA;
      }
    }
    fctx.putImageData(fimg, 0, 0);
  }

  // A soft glow under whatever just happened: pink under the person who just checked in, green under a table that
  // formed, grew or got help. (This replaces the dot grid while it is parked.)
  function drawGlow(t, m, byId, tables) {
    if (!m) return;
    const k = Math.min(1, (t - m.start) / 450) * Math.max(0, Math.min(1, (m.until - t) / 1400));
    const target = m.kind === "checkin" ? byId.get(m.person) : tables.get(m.group);
    if (!target || k <= 0) return;
    const R = 240 * K, col = m.kind === "checkin" ? C.pink : C.green;
    const g = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, R);
    g.addColorStop(0, withAlpha(col, 0.18 * k)); g.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = g; ctx.fillRect(target.x - R, target.y - R, R * 2, R * 2);
  }

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

  // Shapes drawn between the people at one table, by head count. Seat indexes run round the table; -1 is the middle.
  // The variant is picked from the table's rank, so tables with the same head count still differ.
  function shapeEdges(n, v) {
    const e = [], add = (i, j) => { if (i !== j && !e.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) e.push([i, j]); };
    const spokes = () => { for (let i = 0; i < n; i++) add(-1, i); };
    const zig = () => { const seq = []; for (let lo = 0, hi = n - 1; lo <= hi; lo++, hi--) { seq.push(lo); if (hi !== lo) seq.push(hi); } for (let i = 1; i < seq.length; i++) add(seq[i - 1], seq[i]); };
    const path = () => { for (let i = 1; i < n; i++) add(i - 1, i); };
    const skip = (k) => { for (let i = 0; i < n; i++) add(i, (i + k) % n); };
    if (n === 2) add(0, 1);                                                                      // a line
    else if (n === 3) [() => { add(0, 1); add(1, 2); add(2, 0); }, spokes, path][v % 3]();      // a triangle, a Y, a bent line
    else if (n === 4) [() => { add(0, 2); add(1, 3); }, () => { add(0, 1); add(1, 2); add(2, 3); add(3, 0); }, spokes, zig][v % 4]();   // an X, a square, a +, a Z
    else [
      () => skip(Math.floor(n / 2)),                                                              // a star through the middle
      () => skip(2),                                                                              // points joined two apart
      spokes,                                                                                     // a sun
      () => { for (let i = 0; i < Math.floor(n / 2); i++) add(i, n - 1 - i); },                   // parallel bars, like an =
      zig,                                                                                        // a zigzag
      () => { for (let j = 1; j < n; j++) add(0, j); },                                           // a fan from one seat
      () => skip(n >= 7 ? 3 : 2) || path(),                                                       // a wider star over a path
    ][v % 7]();
    const deg = new Map();                                                                       // no seat gets more than three lines
    return e.filter(([i, j]) => {
      const di = i < 0 ? 0 : deg.get(i) || 0, dj = j < 0 ? 0 : deg.get(j) || 0;
      if (di >= 3 || dj >= 3) return false;
      if (i >= 0) deg.set(i, di + 1);
      if (j >= 0) deg.set(j, dj + 1);
      return true;
    });
  }

  // The room a table may move about in: its whole ring and label stay on the plan.
  const tableBox = (R) => { const r = R + 34 * K; return { x0: r + 14 * K, x1: W - r - 14 * K, y0: r + 52 * K, y1: H - r - 14 * K }; };

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const pos = layout.positions();
    if (!pos.length) {
      ctx.fillStyle = C.dim; ctx.font = `400 ${Math.round(28 * K)}px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Waiting for people to tap in", W / 2, H / 2);
      return;
    }
    const tables = layout.tables();
    // Tables drift a little and turn a little: the seats, the mentor and the ring move together, never far.
    const drift = (gid) => ({ dx: (Math.sin(t / 1700 + gid * 1.7) * 9 + Math.sin(t / 2900 + gid * 0.6) * 5) * K, dy: (Math.cos(t / 2000 + gid * 1.1) * 9 + Math.cos(t / 3300 + gid) * 4) * K, rot: Math.sin(t / 4200 + gid * 2.3) * 0.3 + Math.sin(t / 2500 + gid) * 0.08, sc: 1 + 0.045 * Math.sin(t / 2100 + gid * 1.3) });
    // What the user has dragged lets go after a few seconds and eases home. A table moves as a whole; a person moves alone
    // and tugs the rest of their table a third of the way along.
    const dtm = Math.min(100, t - (draw.lt || t)); draw.lt = t;
    springing = false;
    for (const [k, o] of off) {
      if (k[0] === "p") springing = true;
      if (o.rel == null || k[0] === "t") continue;                    // still held, or a table: a table stays where it was put
      const dt = dtm / 1000, vx = o.vx || 0, vy = o.vy || 0;          // let go: spring home quickly, with a little overshoot
      o.vx = vx + (-90 * o.x - 11 * vx) * dt; o.vy = vy + (-90 * o.y - 11 * vy) * dt;
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (Math.hypot(o.x, o.y) < 0.6 && Math.hypot(o.vx, o.vy) < 8) off.delete(k);
    }
    const pull = new Map();
    for (const p of pos) {
      const o = off.get("p" + p.id), gid = p.gid != null ? p.gid : p.seatTable;
      if (!o || gid == null) continue;
      const q = pull.get(gid) || { x: 0, y: 0 }; q.x += o.x * 0.3; q.y += o.y * 0.3; pull.set(gid, q);
    }
    for (const [gid, tb] of tables) {
      const d = drift(gid), to = off.get("t" + gid) || { x: 0, y: 0 }, pu = pull.get(gid) || { x: 0, y: 0 };
      tb.ox = tb.x; tb.oy = tb.y; tb.x += d.dx + to.x + pu.x; tb.y += d.dy + to.y + pu.y; tb.rot = d.rot; tb.sc = d.sc;
    }
    {
      // Keep a decent gap between groups. While a group is held, the ones it meets are shoved aside and stay shoved; at rest the
      // same rule only keeps drifting groups apart.
      const list = [...tables], dragged = drag && drag.k[0] === "t" ? +drag.k.slice(1) : null, persist = !!drag;
      const shove = (gid, tb, dx, dy) => {
        tb.x += dx; tb.y += dy;
        if (!persist) return;
        const o = off.get("t" + gid) || { x: 0, y: 0, rel: null };
        o.x += dx; o.y += dy; off.set("t" + gid, o);
      };
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const [ga, A] = list[i], [gb, B] = list[j];
          const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, need = A.R + B.R + 100 * K;
          if (d >= need) continue;
          const push = need - d, ux = dx / d, uy = dy / d, wa = ga === dragged ? 0 : gb === dragged ? 1 : 0.5, wb = 1 - wa;   // the held group does not give way
          shove(ga, A, -ux * push * wa, -uy * push * wa); shove(gb, B, ux * push * wb, uy * push * wb);
        }
      }
      // The edges: a group that strays past them is pulled back by a spring, so it bounces back onto the plan.
      for (const [gid, tb] of list) {
        if (gid === dragged) continue;
        const bx = tableBox(tb.R);
        const ox = tb.x < bx.x0 ? bx.x0 - tb.x : tb.x > bx.x1 ? bx.x1 - tb.x : 0, oy = tb.y < bx.y0 ? bx.y0 - tb.y : tb.y > bx.y1 ? bx.y1 - tb.y : 0;
        const o = off.get("t" + gid);
        if (!ox && !oy && !(o && (o.vx || o.vy))) continue;
        const q = o || { x: 0, y: 0, rel: null }, dt = Math.min(0.05, dtm / 1000);
        q.vx = q.vx || 0; q.vy = q.vy || 0;
        if (ox || oy) { q.vx += (ox * 90 - 12 * q.vx) * dt; q.vy += (oy * 90 - 12 * q.vy) * dt; }
        else { q.vx *= 0.85; q.vy *= 0.85; if (Math.hypot(q.vx, q.vy) < 1) q.vx = q.vy = 0; }
        q.x += q.vx * dt; q.y += q.vy * dt; tb.x += q.vx * dt; tb.y += q.vy * dt;
        off.set("t" + gid, q);
      }
    }
    for (const p of pos) {
      const gid = p.gid != null ? p.gid : p.seatTable;
      const tb = gid != null ? tables.get(gid) : null;
      if (tb) {
        const rx = (p.x - tb.ox) * tb.sc, ry = (p.y - tb.oy) * tb.sc, c = Math.cos(tb.rot), s = Math.sin(tb.rot);
        p.x = tb.x + rx * c - ry * s; p.y = tb.y + rx * s + ry * c;
      }
      const o = off.get("p" + p.id);
      if (o) { const sh = gid != null ? 0.7 : 1; p.x += o.x * sh; p.y += o.y * sh; }       // with the table's 30% tug the person lands exactly on the pointer
    }
    drawn.people = pos.map((p) => ({ id: p.id, x: p.x, y: p.y, r: p.r }));
    drawn.tables = [...tables].map(([id, tb]) => ({ id, x: tb.x, y: tb.y, R: tb.R }));
    for (const p of pos) { p.x += Math.sin(t / 650 + p.id * 1.3) * 4.5 * K; p.y += Math.cos(t / 800 + p.id * 0.9) * 4.5 * K; }   // sway, applied once so lines meet their dots
    const byId = new Map(pos.map((p) => [p.id, p]));
    const m = cur && t < cur.until ? cur : null;
    const hiGroup = m && m.group != null ? m.group : null;
    const hiColor = m && m.kind === "checkin" ? C.pink : C.green;
    const lab = Math.max(12, Math.round(13 * K)), nameSz = Math.max(12, Math.round(13 * K));
    const topIds = new Set([...S.groups.values()].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 3).map((g) => g.id));   // only the leaders show what they are building
    if (GRID) drawGrid(t, m, byId, tables); else drawGlow(t, m, byId, tables);
    for (const p of pos) {                                          // short trails behind people who are still gliding to a seat
      const tr = trails.get(p.id) ?? trails.set(p.id, []).get(p.id);
      if (Math.hypot(p.tx - p.x, p.ty - p.y) > 4) { tr.push({ x: p.x, y: p.y }); if (tr.length > 14) tr.shift(); } else if (tr.length) tr.shift();
    }

    // ---- links, drawn quietly under everything else
    ctx.lineCap = "round";
    for (const [, tb] of tables) {                                   // inside a table: a simple shape that depends on how many sit there
      const ms = pos.filter((p) => p.gid === tb.id).sort((a, b) => a.ang - b.ang), n = ms.length;
      if (n < 2) continue;
      const rank = [...tables.keys()].sort((a, b) => a - b).indexOf(tb.id);
      const edges = shapeEdges(n, (rank * 5 + n) % 7);
      const pt = (i) => (i < 0 ? { x: tb.x, y: tb.y } : ms[i]);
      const segs = edges.map(([i, j]) => [pt(i), pt(j)]);
      ctx.globalAlpha = 0.9; ctx.strokeStyle = C.deep; ctx.lineWidth = 2.3 * K * LW; ctx.lineCap = "round";
      ctx.beginPath();
      for (const [a, b] of segs) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
      segs.forEach(([a, b], i) => {                                   // a small light travels along each line
        const f = (t / 3400 + i * 0.37 + tb.id * 0.19) % 1, sz = 2.6 * K;
        ctx.globalAlpha = 0.75; ctx.fillStyle = C.fg;
        ctx.fillRect(a.x + (b.x - a.x) * f - sz / 2, a.y + (b.y - a.y) * f - sz / 2, sz, sz);
      });
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
      curve(A.x + (dx / d) * ra, A.y + (dy / d) * ra, B.x - (dx / d) * rb, B.y - (dy / d) * rb, C.deep, 0.18 + 0.05 * Math.min(c, 4), (1.7 + 0.35 * Math.min(c, 4)) * K * LW);
    }
    const byMentor = new Map();                                      // a mentor keeps at most three lines: their own table first, then the nearest
    for (const x of bridge.values()) (byMentor.get(x.a.id) ?? byMentor.set(x.a.id, []).get(x.a.id)).push(x);
    for (const list of byMentor.values()) {
      list.sort((p, q) => (q.own ? 1 : 0) - (p.own ? 1 : 0) || p.d - q.d);
      for (const x of list.slice(0, 3)) line(x.a.x, x.a.y, x.b.x, x.b.y, C.deep, x.own ? 0.9 : 0.5, (x.own ? 2.4 : 1.5) * K * LW);
    }   // strong to its own table, faint to the others
    ctx.globalAlpha = 1;
    if (m && m.kind === "checkin") {                                 // the moment: lines from the newest person to those they know
      const me = byId.get(m.person);
      if (me) {
        const arr = 1 - Math.min(1, Math.hypot(me.tx - me.x, me.ty - me.y) / (160 * K));      // 0 while still walking in, 1 once seated
        if (arr > 0.05) for (const id of m.known.slice(0, 3)) {
          const o = byId.get(id);
          if (o) line(me.x, me.y, o.x, o.y, C.pink, 0.9 * arr, 3 * K);
        }
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
      ctx.lineWidth = (hi ? 3.4 : 2.5) * K * LW;
      ctx.setLineDash(V.ring === "solid" ? [] : V.ring === "dot" ? [0.1, 8 * K] : hi ? [14 * K, 9 * K] : [7 * K, 8 * K]);
      ctx.lineCap = V.ring === "dot" ? "round" : "butt";
      ctx.lineDashOffset = -(t / (hi ? 30 : 140)) * (gid % 2 ? 1 : -1);   // neighbouring rings turn opposite ways
      ctx.strokeStyle = hi ? hiColor : quiet ? C.dim : C.deep;
      ctx.globalAlpha = hi ? 0.75 + 0.25 * Math.sin(t / 380) : quiet ? 0.55 : 0.95;
      ctx.beginPath();                                                // not a circle: an outline that slowly breathes out of round
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2, rr = ringR * tb.sc * (1 + 0.1 * Math.sin(2 * a + t / 2600 + gid * 1.9) + 0.07 * Math.sin(3 * a - t / 3300 + gid * 0.8));
        const px = tb.x + Math.cos(a) * rr, py = tb.y + Math.sin(a) * rr;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();

      const needs = S.needs.filter((n) => n.group_id === gid && n.handled_by == null).map((n) => n.need);
      const l1 = low(g.name);
      const l2 = quiet ? "heads-down" : needs.length ? trunc("needs " + low(needs[0]) + (needs.length > 1 ? " +" + (needs.length - 1) : ""), 24) : "";
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
      // A little life: each person drifts a couple of pixels and breathes; people still gliding leave a fading trail; a new
      // arrival sends out one ripple.
      const nx = p.x, ny = p.y;
      const r = p.r * (newest ? 1.9 : 1) * (1 + 0.07 * Math.sin(t / 650 + p.id));
      const col = newest ? C.pink : quiet ? C.dim : C.green;
      const tr = trails.get(p.id);
      if (tr && tr.length > 1) {
        ctx.lineWidth = 2 * K; ctx.strokeStyle = newest ? C.pink : C.green;
        for (let i = 1; i < tr.length; i++) { ctx.globalAlpha = (i / tr.length) * 0.5; ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke(); }
        ctx.globalAlpha = 0.2 + 0.8 * age;
      }
      if (age < 1) {
        ctx.strokeStyle = col; ctx.lineWidth = 1.6 * K; ctx.globalAlpha = (1 - age) * 0.7;
        ctx.beginPath(); ctx.arc(nx, ny, r + age * 40 * K, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.2 + 0.8 * age;
      }
      ctx.lineWidth = 1.8 * K;
      if (helper) {
        ctx.strokeStyle = col; ctx.fillStyle = C.bg;
        ctx.beginPath(); ctx.rect(nx - r, ny - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
      } else if (quiet) {
        ctx.strokeStyle = col; ctx.fillStyle = C.bg;
        ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        if (V.node === "ring") { ctx.strokeStyle = col; ctx.fillStyle = C.bg; ctx.lineWidth = 2.6 * K; ctx.beginPath(); ctx.arc(nx, ny, r + 1 * K, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        else {
          if (V.node === "glow") { ctx.shadowColor = col; ctx.shadowBlur = 14 * K; }
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      if (newest) {                                          // the ring means "newest" without relying on color alone
        ctx.strokeStyle = C.pink; ctx.lineWidth = 2.2 * K;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t / 300);
        ctx.beginPath(); ctx.arc(nx, ny, r + 8 * K, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 0.2 + 0.8 * age;

      // Names sit outward from the table, like a seating chart; solo people get theirs underneath.
      const label = (p.name || "").split(" ")[0];                       // first names only; the shape says mentor or focus
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

  let last = 0, lastFume = -1e9;
  function frame(t) {
    requestAnimationFrame(frame);
    pump(t);
    if (t - lastFume > 90) { lastFume = t; drawFume(t); }               // the fume steps about 11 times a second, which is part of the look
    const moving = (layout && !layout.isSettled()) || drag || springing;
    if (!moving && t - last < 33) return;            // at rest: about 30 redraws a second, for the turning rings and the drift
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

  // ------------------------------------------------------------ the mouse: it shows when it moves and hides after a few idle seconds.
  // Nothing on this page is clickable; the mouse only stirs the background fume.
  let idleTimer = 0;
  const wake = () => { document.body.classList.remove("idle"); clearTimeout(idleTimer); idleTimer = setTimeout(() => document.body.classList.add("idle"), 3000); };
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now(); wake(); });
  wake();

  // ------------------------------------------------------------ dragging, like Obsidian: grab a person to pull them out (their table follows a
  // little) and they spring back to the group when let go; grab a table's ring to move the whole group, and it stays where it is put.
  const toLocal = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function hit(pt) {
    let best = null, bd = Infinity;
    for (const p of drawn.people) { const d = Math.hypot(p.x - pt.x, p.y - pt.y); if (d < p.r + 14 * K && d < bd) { bd = d; best = "p" + p.id; } }
    if (best) return best;
    for (const tb of drawn.tables) if (Math.hypot(tb.x - pt.x, tb.y - pt.y) < tb.R + 34 * K) return "t" + tb.id;
    return null;
  }
  canvas.addEventListener("pointerdown", (e) => {
    const k = hit(toLocal(e));
    if (!k) return;
    canvas.setPointerCapture(e.pointerId);
    const o = off.get(k) || { x: 0, y: 0, rel: null };
    o.rel = null; o.vx = o.vy = 0; off.set(k, o);
    drag = { k, o, x: e.clientX, y: e.clientY };
    canvas.classList.add("grabbing");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      let dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.k[0] === "t") {                                        // a held group can be pulled a little past the edge
        const tb = drawn.tables.find((q) => "t" + q.id === drag.k);
        if (tb) {                                                     // past the edge it gets stiff, like a rubber band, and bounces back on release
          const bx = tableBox(tb.R);
          if (tb.x + dx < bx.x0 || tb.x + dx > bx.x1) dx *= 0.25;
          if (tb.y + dy < bx.y0 || tb.y + dy > bx.y1) dy *= 0.25;
        }
      }
      drag.o.x += dx; drag.o.y += dy; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.k[0] === "t") {                                        // groups linked to the held one are tugged along a little
        const g0 = +drag.k.slice(1), linked = new Set();
        for (const l of S.links) {
          const a = S.people.get(l.a)?.group_id, b = S.people.get(l.b)?.group_id;
          if (a == null || b == null || a === b) continue;
          if (a === g0) linked.add(b); else if (b === g0) linked.add(a);
        }
        for (const g of linked) { const o = off.get("t" + g) || { x: 0, y: 0, rel: null }; o.x += dx * 0.2; o.y += dy * 0.2; off.set("t" + g, o); }
      }
    }
    else canvas.classList.toggle("grab", !!hit(toLocal(e)));
  });
  const endDrag = () => { if (drag) { drag.o.rel = performance.now(); drag = null; canvas.classList.remove("grabbing"); } };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // ------------------------------------------------------------ boot
  if (qs.has("silent")) $("start").classList.add("gone");
  $("start-btn").addEventListener("click", async () => {
    $("start").classList.add("gone");
    try { await Sound.start(); } catch (e) { console.error("sound", e); }
    // Avery's intro (intro/): the room fills up, then lands on this plan. Never blocks the data or the WebSocket.
    try {
      if (window.TapInIntro) TapInIntro.map(document.body, { quiet: Sound.muted, target: () => {
        const r = $("room").getBoundingClientRect();
        return { tables: [...layout.tables()].map(([id, t]) => ({ id, x: r.left + t.x, y: r.top + t.y, r: t.R })),
                 people: layout.positions().map((p) => ({ x: r.left + p.x, y: r.top + p.y, table: p.gid })) };
      } }).catch(() => {});
    } catch (e) { console.error("intro", e); }
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
