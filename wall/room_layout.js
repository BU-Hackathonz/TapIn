// Seating layout for the host screen's room plan. Pure logic: no DOM, no drawing, no library.
// Every table is a ring on a tidy grid; people sit around it. Solo people stand in a row along the bottom. Mentors and
// staff stand just outside the first table they helped. Nothing is simulated: each person has a target seat and glides
// to it, so the picture is calm, never overlaps by construction, and does not jump when someone arrives.
//
//   const layout = RoomLayout.create({ width, height, scale });
//   layout.setData(graph);            // GET /api/graph (again on every change); only people who are here are shown
//   layout.step();                    // per frame: glide towards the seats
//   layout.positions(); layout.tables(); layout.isSettled();
const RoomLayout = (() => {
  const DEFAULTS = {
    width: 1440, height: 900, scale: 1,
    seat: 52,                                    // px between neighbours around a table
    margin: { x: 70, top: 120, bottom: 150 },    // bottom holds the row of solo people
    stationSpots: { 1: [0.1, 0.9], 2: [0.5, 0.1] },   // Entrance bottom left, Table 2 top middle (nearest free cell)
    ease: 0.12,
  };

  // Ring radius for n people (0 for one person, half a seat for two).
  const ringRadius = (n, seat) => (n <= 1 ? 0 : n === 2 ? seat / 2 : Math.max(seat * 0.62, (n * seat) / (2 * Math.PI)));

  // Seat offsets around a table centre. Up to 14 people on one ring; more get an inner ring.
  function seats(n, seat) {
    if (n === 1) return [{ dx: 0, dy: 0, ang: Math.PI / 2 }];
    if (n === 2) return [{ dx: -seat / 2, dy: 0, ang: Math.PI }, { dx: seat / 2, dy: 0, ang: 0 }];
    const out = [];
    const ring = (count, R, phase) => {
      for (let k = 0; k < count; k++) {
        const a = phase + (2 * Math.PI * k) / count;
        out.push({ dx: Math.cos(a) * R, dy: Math.sin(a) * R, ang: a });
      }
    };
    if (n <= 14) ring(n, ringRadius(n, seat), -Math.PI / 2 + Math.PI / n);
    else {
      const outer = Math.ceil(n * 0.64), inner = n - outer;
      const R1 = ringRadius(outer, seat);
      ring(outer, R1, -Math.PI / 2 + Math.PI / outer);
      ring(inner, Math.max(R1 * 0.5, ringRadius(inner, seat)), -Math.PI / 2);
    }
    return out;
  }

  const nodeRadius = (points = 0, scale = 1) => (3.6 + 2.6 * Math.min(1, Math.sqrt(Math.max(0, points) / 60))) * scale;

  function create(options = {}) {
    const o = { ...DEFAULTS, ...options, margin: { ...DEFAULTS.margin, ...(options.margin || {}) } };
    const S = o.scale;
    const nodes = new Map();       // person id -> { id, x, y, tx, ty, r, gid, ang, ... }
    const tableObjs = new Map();   // group id -> { id, x, y, tx, ty, R, n }
    const spot = ([fx, fy]) => [fx * o.width, fy * o.height];

    function setData(graph, { includeAbsent = false } = {}) {
      const visible = graph.people.filter((p) => includeAbsent || p.here);
      const seated = new Map(), mentors = [], solos = [];
      const byGroup = new Map();
      const groupIds = new Set(graph.groups.map((g) => g.id));
      for (const p of visible) {
        if (p.group_id != null && groupIds.has(p.group_id) && p.role === "student") (byGroup.get(p.group_id) ?? byGroup.set(p.group_id, []).get(p.group_id)).push(p);
        else if (p.role !== "student") mentors.push(p);
        else solos.push(p);
      }
      const gids = [...byGroup.keys()].sort((a, b) => a - b);
      const gById = new Map(graph.groups.map((g) => [g.id, g]));

      // ---- grid of tables
      const solosAndMentors = solos.length + mentors.filter((p) => !mentorTable(p, graph, byGroup)).length;
      const stripH = solosAndMentors ? o.margin.bottom : o.margin.bottom * 0.5;
      const areaX = o.margin.x, areaY = o.margin.top;
      const areaW = o.width - 2 * o.margin.x, areaH = o.height - o.margin.top - stripH;
      const n = gids.length;
      const cols = n ? Math.max(1, Math.min(n, Math.round(Math.sqrt((n * areaW) / areaH)))) : 1;
      const rows = n ? Math.ceil(n / cols) : 1;
      const cw = areaW / cols, ch = areaH / rows;
      const cell = (i, j) => [areaX + (i + 0.5) * cw, areaY + (j + 0.5) * ch + 10 * S];
      const taken = new Set(), place = new Map(), usedStations = new Set();
      for (const gid of gids) {            // a table pinned to a station takes the free cell nearest that station's spot
        const g = gById.get(gid), sp = o.stationSpots[g.station_id];
        if (!sp) continue;
        const [sx, sy] = spot(sp);
        let best = null, bd = Infinity;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          if (taken.has(j * cols + i)) continue;
          const [x, y] = cell(i, j), d = Math.hypot(x - sx, y - sy);
          if (d < bd) { bd = d; best = [i, j]; }
        }
        if (best && !usedStations.has(g.station_id)) { usedStations.add(g.station_id); taken.add(best[1] * cols + best[0]); place.set(gid, best); }
      }
      let free = 0;
      for (const gid of gids) {
        if (Array.isArray(place.get(gid))) continue;
        while (taken.has(free)) free++;
        place.set(gid, [free % cols, Math.floor(free / cols)]);
        taken.add(free);
      }

      // Looser than a grid: odd rows slide over a little, the last row is centred, and every table gets a small steady nudge
      // of its own (from its id), so the tables do not read as a rectangle.
      const orgCell = (gid, i, j) => {
        let [x, y] = cell(i, j);
        const nLast = n - cols * (rows - 1);
        if (rows > 1 && j === rows - 1) x += ((cols - nLast) * cw) / 2; else if (cols > 1) x += (j % 2 ? 0.12 : -0.12) * cw;
        const h1 = Math.sin(gid * 12.9898) * 43758.5453, h2 = Math.sin(gid * 78.233 + 1.7) * 12543.321;
        return [x + ((h1 - Math.floor(h1)) - 0.5) * 0.2 * cw, y + ((h2 - Math.floor(h2)) - 0.5) * 0.2 * ch];
      };
      const keepNodes = new Set(), keepTables = new Set();
      const bulk = nodes.size === 0;
      const [ex, ey] = spot(o.stationSpots[1]);
      const touch = (p, tx, ty, ang, gid, tableCentre) => {
        keepNodes.add(p.id);
        let nd = nodes.get(p.id);
        if (!nd) {
          const from = bulk ? [tx, ty] : tableCentre ? tableCentre : [ex, ey];   // a joiner starts at its table, a check-in at the Entrance
          nd = { id: p.id, x: from[0], y: from[1] };
          nodes.set(p.id, nd);
        }
        Object.assign(nd, { tx, ty, ang, gid, name: p.name, role: p.role, focus: !!p.focus, label: p.label ?? p.name, r: nodeRadius(p.points, S), points: p.points || 0 });
        nd.solo = gid == null;
      };

      for (const gid of gids) {
        const members = byGroup.get(gid).sort((a, b) => a.id - b.id);
        const [ci, cj] = place.get(gid), [cx, cy] = orgCell(gid, ci, cj);
        const R = ringRadius(members.length, o.seat * S);
        let t = tableObjs.get(gid);
        if (!t) { t = { id: gid, x: bulk ? cx : cx, y: cy }; tableObjs.set(gid, t); }
        Object.assign(t, { tx: cx, ty: cy, R, n: members.length });
        keepTables.add(gid);
        const offs = seats(members.length, o.seat * S);
        members.forEach((p, k) => touch(p, cx + offs[k].dx, cy + offs[k].dy, offs[k].ang, gid, [t.x, t.y]));
      }

      // ---- mentors and staff stand just outside the first table they helped; anyone without one joins the bottom row
      const row = [];
      for (const p of mentors) {
        const gid = mentorTable(p, graph, byGroup);
        if (gid != null && tableObjs.has(gid)) {
          const t = tableObjs.get(gid), a = Math.PI / 4;
          touch(p, t.tx + Math.cos(a) * (t.R + 46 * S), t.ty + Math.sin(a) * (t.R + 46 * S), a, gid, [t.x, t.y]);
          nodes.get(p.id).solo = false;
          nodes.get(p.id).gid = null;       // not a member: it is drawn as a bridge, not seated
          nodes.get(p.id).seatTable = gid;
        } else row.push(p);
      }
      row.push(...solos);
      // The bottom row: each person gets a slot as wide as their name, so names never run into each other.
      const slot = (p) => Math.max(100 * S, ((p.label ?? p.name ?? "").length * 11 + 44) * S);
      const lines = []; let line = [], used = 0;
      for (const p of row) {
        const w = slot(p);
        if (line.length && used + w > areaW) { lines.push(line); line = []; used = 0; }
        line.push({ p, w }); used += w;
      }
      if (line.length) lines.push(line);
      lines.forEach((ln, ri) => {
        let x = o.width / 2 - ln.reduce((s, e) => s + e.w, 0) / 2;
        for (const { p, w } of ln) {
          touch(p, x + w / 2, o.height - o.margin.bottom * 0.55 + ri * 52 * S, Math.PI / 2, null, null);
          nodes.get(p.id).seatTable = null;
          x += w;
        }
      });

      for (const id of [...nodes.keys()]) if (!keepNodes.has(id)) nodes.delete(id);
      for (const id of [...tableObjs.keys()]) if (!keepTables.has(id)) tableObjs.delete(id);
    }

    // The first table a mentor is linked to through someone seated there.
    function mentorTable(p, graph, byGroup) {
      for (const l of graph.links) {
        const other = l.a === p.id ? l.b : l.b === p.id ? l.a : null;
        if (other == null) continue;
        for (const [gid, ms] of byGroup) if (ms.some((m) => m.id === other)) return gid;
      }
      return null;
    }

    let settled = true;
    function step() {
      let moving = false;
      const e = o.ease;
      for (const n of nodes.values()) {
        const dx = n.tx - n.x, dy = n.ty - n.y;
        if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) { n.x += dx * e; n.y += dy * e; moving = true; } else { n.x = n.tx; n.y = n.ty; }
      }
      for (const t of tableObjs.values()) {
        const dx = t.tx - t.x, dy = t.ty - t.y;
        if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) { t.x += dx * e; t.y += dy * e; moving = true; } else { t.x = t.tx; t.y = t.ty; }
      }
      settled = !moving;
      return moving ? 1 : 0;
    }

    return {
      setData, step,
      isSettled: () => settled && [...nodes.values()].every((n) => n.x === n.tx && n.y === n.ty),
      positions: () => [...nodes.values()].map((n) => ({ ...n, cx: n.gid != null ? tableObjs.get(n.gid)?.x : null, cy: n.gid != null ? tableObjs.get(n.gid)?.y : null })),
      tables: () => new Map([...tableObjs].map(([id, t]) => [id, { ...t }])),
      has: (id) => nodes.has(id),
      options: o,
    };
  }

  return { create, DEFAULTS, nodeRadius, ringRadius };
})();
