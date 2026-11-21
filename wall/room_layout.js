// Node layout for the host screen's room plan. Pure logic: no DOM, no drawing. Needs the d3-force global (wall/vendor/d3-force.min.js).
// Feed it GET /api/graph snapshots (again on every change); read positions each frame.
//
// What it does, in short (the long version is in reference/room-layout/README.md):
//  - Physics is separate from drawing. step() advances the simulation; isSettled() says when to stop redrawing.
//  - Updates are incremental. setData() keeps every existing node's position, adds new ones, drops removed ones, then
//    reheats to alpha 0.3 (never 1), so the room does not jump.
//  - A first load (empty layout) starts everyone at their own spot. A live check-in starts at the Entrance spot and a
//    joiner starts among its table.
//  - Each table has an anchor; stations pin their table to the station's spot. Solo people get stable spots around the
//    edge; mentors and staff sit between the tables they are linked to.
//  - Spacing is label-aware: max(radius + pad, half the name label), so a name never lands on a neighbour.
const RoomLayout = (() => {
  const DEFAULTS = {
    width: 1440, height: 1000, seed: 1, radiusScale: 1,
    stationSpots: { 1: [0.18, 0.78], 2: [0.5, 0.28] },   // Entrance lower left, Table 2 upper middle
    groupRing: [0.38, 0.34],                              // other tables on a wide ellipse around the centre
    soloRing: [0.43, 0.41],                               // solo people around the edge, inside the border
    soloClearance: 220,                                   // a solo spot keeps this far from every table anchor
    labelPxPerChar: 11, boxX: 70, boxTop: 100, boxBottom: 70,
    anchorStrength: 0.15,
    charge: -160,
    collidePad: 18,
    inGroupDistance: 88, inGroupStrength: 0.5,
    crossDistance: 240, crossStrength: 0.015,
    alphaReheat: 0.3,
    alphaDecay: 0.04,                                     // from 0.3: about 140 ticks, about 2.3 s at 60 Hz
    velocityDecay: 0.4,
    jitter: 24,
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 7 px, up to 5 more with points. sqrt keeps one hot node from dominating.
  const nodeRadius = (points = 0, scale = 1) => (7 + 5 * Math.min(1, Math.sqrt(Math.max(0, points) / 60))) * scale;

  function create(d3, options = {}) {
    const o = { ...DEFAULTS, ...options };
    const rnd = mulberry32(o.seed);
    const nodes = new Map();
    let anchors = { group: new Map(), person: new Map() };
    const spot = ([fx, fy]) => [fx * o.width, fy * o.height];
    const cx = o.width / 2, cy = o.height / 2;

    function computeAnchors(graph, visible) {
      const group = new Map(), person = new Map();
      const groups = [...graph.groups].sort((a, b) => a.id - b.id);
      const taken = new Set(), loose = [], pinned = new Set();
      for (const g of groups) {
        const s = o.stationSpots[g.station_id];
        if (s && !taken.has(g.station_id)) { group.set(g.id, spot(s)); taken.add(g.station_id); pinned.add(g.id); } else loose.push(g);
      }
      // The other tables share a ring. Rotate the ring to the angle that keeps every table as far as possible from the
      // others, station spots included, so a table never lands on top of the Entrance or Table 2 spot.
      const ringPoint = (a) => [cx + o.groupRing[0] * o.width * Math.cos(a), cy + o.groupRing[1] * o.height * Math.sin(a)];
      const fixed = [...group.values()];
      let bestPhi = -Math.PI / 2, bestScore = -1;
      if (loose.length) {
        for (let s = 0; s < 72; s++) {
          const phi = (2 * Math.PI * s) / 72;
          const all = [...fixed, ...loose.map((_, k) => ringPoint(phi + (2 * Math.PI * k) / loose.length))];
          let score = Infinity;
          for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) score = Math.min(score, Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1]));
          if (score > bestScore) { bestScore = score; bestPhi = phi; }
        }
      }
      loose.forEach((g, k) => group.set(g.id, ringPoint(bestPhi + (2 * Math.PI * k) / loose.length)));

      // Relax: size each table from how many people it has and push apart any that would overlap, then keep them inside
      // the margins. Station-pinned tables move less, so Table 2 and the Entrance stay near their spots.
      const count = new Map();
      for (const p of visible) if (p.group_id != null) count.set(p.group_id, (count.get(p.group_id) || 0) + 1);
      const ids = [...group.keys()].filter((id) => count.has(id));
      const rad = (id) => (60 + 34 * Math.sqrt(count.get(id))) * o.radiusScale;
      for (let it = 0; it < 240; it++) {
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const a = group.get(ids[i]), b = group.get(ids[j]);
          const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 0.01;
          const need = (rad(ids[i]) + rad(ids[j])) * 0.92 + 30;
          if (d >= need) continue;
          const push = (need - d) / 2, ux = dx / d, uy = dy / d;
          const wa = pinned.has(ids[i]) ? 0.25 : 1, wb = pinned.has(ids[j]) ? 0.25 : 1;
          a[0] -= ux * push * wa; a[1] -= uy * push * wa; b[0] += ux * push * wb; b[1] += uy * push * wb;
        }
        for (const id of ids) {
          const a = group.get(id), r = rad(id);
          a[0] = Math.min(o.width - o.boxX - 0.5 * r, Math.max(o.boxX + 0.5 * r, a[0]));
          a[1] = Math.min(o.height - o.boxBottom - 0.5 * r, Math.max(o.boxTop + 0.55 * r, a[1]));
        }
      }
      const members = new Map();
      for (const p of visible) if (p.group_id != null && group.has(p.group_id)) members.set(p.id, p.group_id);
      for (const p of visible) {
        if (members.has(p.id)) { person.set(p.id, group.get(members.get(p.id))); continue; }
        const linked = graph.links.flatMap((l) => (l.a === p.id ? [l.b] : l.b === p.id ? [l.a] : []))
          .map((q) => members.get(q)).filter((g) => g != null);
        if (p.role !== "student" && linked.length) {
          const pts = [...new Set(linked)].map((g) => group.get(g));
          person.set(p.id, [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length]);
        } else {
          let a = p.id * 2.399963;
          const at = (ang) => [cx + o.soloRing[0] * o.width * Math.cos(ang), cy + o.soloRing[1] * o.height * Math.sin(ang)];
          for (let tries = 0; tries < 24; tries++) {
            const s = at(a);
            if ([...group.values()].every((g) => Math.hypot(s[0] - g[0], s[1] - g[1]) >= o.soloClearance)) break;
            a += 0.35;
          }
          person.set(p.id, at(a));
        }
      }
      return { group, person };
    }

    function spawnPosition(p, placedInGroup, bulkLoad) {
      const j = () => (rnd() - 0.5) * o.jitter * 2;
      if (bulkLoad) { const a = anchors.person.get(p.id) ?? [cx, cy]; return [a[0] + j(), a[1] + j()]; }
      if (p.group_id != null) {
        const placed = placedInGroup(p.group_id);
        if (placed.length) {
          const mx = placed.reduce((s, n) => s + n.x, 0) / placed.length, my = placed.reduce((s, n) => s + n.y, 0) / placed.length;
          return [mx + j(), my + j()];
        }
        const a = anchors.group.get(p.group_id);
        if (a) return [a[0] + j(), a[1] + j()];
      }
      const [ex, ey] = spot(o.stationSpots[1]);
      return [ex + j(), ey + j()];
    }

    // Soft walls: nodes are nudged back inside the margins, with extra room above for table labels and below for names.
    const box = (() => {
      let ns = [];
      const f = () => {
        for (const n of ns) {
          if (n.x < o.boxX) n.vx += (o.boxX - n.x) * 0.2; else if (n.x > o.width - o.boxX) n.vx -= (n.x - (o.width - o.boxX)) * 0.2;
          if (n.y < o.boxTop) n.vy += (o.boxTop - n.y) * 0.2; else if (n.y > o.height - o.boxBottom) n.vy -= (n.y - (o.height - o.boxBottom)) * 0.2;
        }
      };
      f.initialize = (nodes) => { ns = nodes; };
      return f;
    })();

    const sim = d3.forceSimulation([])
      .alphaDecay(o.alphaDecay).velocityDecay(o.velocityDecay)
      .force("x", d3.forceX((d) => anchors.person.get(d.id)?.[0] ?? cx).strength(o.anchorStrength))
      .force("y", d3.forceY((d) => anchors.person.get(d.id)?.[1] ?? cy).strength(o.anchorStrength))
      .force("link", d3.forceLink([]).id((d) => d.id)
        .distance((l) => (l.same ? o.inGroupDistance : o.crossDistance))
        .strength((l) => (l.same ? o.inGroupStrength : o.crossStrength)))
      .force("charge", d3.forceManyBody().strength(o.charge))
      .force("box", box)
      .force("collide", d3.forceCollide((d) => Math.max(d.r + o.collidePad, d.labelHalf ?? 0)).iterations(2))
      .stop();

    function setData(graph, { includeAbsent = false } = {}) {
      const visible = graph.people.filter((p) => includeAbsent || p.here);
      anchors = computeAnchors(graph, visible);
      const ids = new Set(visible.map((p) => p.id));
      for (const id of [...nodes.keys()]) if (!ids.has(id)) nodes.delete(id);
      const placedInGroup = (gid) => [...nodes.values()].filter((n) => n.gid === gid);
      const bulkLoad = nodes.size === 0;
      for (const p of visible) {
        let n = nodes.get(p.id);
        if (!n) {
          const [x, y] = spawnPosition(p, placedInGroup, bulkLoad);
          n = { id: p.id, x, y, vx: 0, vy: 0 };
          nodes.set(p.id, n);
        }
        Object.assign(n, {
          gid: p.group_id ?? null, r: nodeRadius(p.points, o.radiusScale),
          labelHalf: ((p.label ?? p.name)?.length ?? 0) * o.labelPxPerChar / 2 + 4,
          name: p.name, role: p.role, focus: !!p.focus,
        });
      }
      const links = graph.links.filter((l) => ids.has(l.a) && ids.has(l.b)).map((l) => ({
        source: l.a, target: l.b, strength: l.strength,
        same: nodes.get(l.a).gid != null && nodes.get(l.a).gid === nodes.get(l.b).gid,
      }));
      sim.nodes([...nodes.values()]);
      sim.force("link").links(links);
      sim.alpha(o.alphaReheat);
    }

    return {
      setData,
      step(n = 1) { let ran = 0; while (ran < n && sim.alpha() >= sim.alphaMin()) { sim.tick(); ran++; } return ran; },
      isSettled: () => sim.alpha() < sim.alphaMin(),
      positions: () => [...nodes.values()].map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.r, gid: n.gid, name: n.name, role: n.role, focus: n.focus })),
      has: (id) => nodes.has(id),
      options: o,
    };
  }

  return { create, DEFAULTS, nodeRadius };
})();
