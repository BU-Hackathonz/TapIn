// Node layout for the Tap In wall's room view. Pure logic (no DOM, no rendering).
// Feed it GET /api/graph snapshots (and again on every WebSocket change); read positions each frame.
//
// Design notes (what we took from watching Obsidian's graph view, and what we changed for a room):
//  - Physics is separate from drawing. step() advances the simulation; the renderer only reads positions().
//    When the simulation has cooled, isSettled() is true and the wall can skip redraws (Obsidian's idle frames).
//  - Updates are incremental. setData() keeps every existing node's position and velocity, adds new nodes,
//    drops removed ones, then REHEATS to alpha 0.3 (never 1), so the room never jumps (Obsidian: alpha 0.3 on change).
//  - New nodes do not start at random. Obsidian puts a node at the mean of its already-placed neighbours (jittered),
//    else in a ring just outside the layout. Here a joiner starts at its group, a fresh check-in starts at the
//    Entrance station spot: the physical story of someone walking in and tapping.
//  - Each group has an anchor (a spot in the room) that pulls its members (forceX/forceY); stations pin their
//    group to the station's spot. This replaces Obsidian's single centre force, which makes one blob.
//  - Node size compresses with sqrt so a very active person is bigger but never dominates.
//
// `d3` is injected so the same file works with the vendored global d3 (v7) in the browser and with d3-force in Node.

export const DEFAULTS = {
  width: 1440,            // graph area in px (about 75% of a 1920 wall)
  height: 1080,
  seed: 1,
  // fractions of the graph area
  stationSpots: { 1: [0.18, 0.78], 2: [0.5, 0.28] },   // Entrance lower left, Table 2 upper middle (Playbook)
  groupRing: [0.36, 0.32],                              // other groups on a wide ellipse around the centre
  soloRing: [0.43, 0.41],                               // solo people around the outer edge, inside the border so repulsion cannot push them out
  soloClearance: 220,                                   // a solo spot keeps this far from every group anchor
  labelPxPerChar: 11,                                   // about 18-20 px IBM Plex; collision keeps neighbours' labels clear
  anchorStrength: 0.15,
  charge: -120,
  collidePad: 18,                                       // Playbook: radius + 18 so labels don't collide
  inGroupDistance: 56, inGroupStrength: 0.5,
  crossDistance: 240, crossStrength: 0.015,
  alphaReheat: 0.3,
  alphaDecay: 0.04,                                     // from 0.3: about 140 ticks, about 2.3 s at 60 Hz
  velocityDecay: 0.4,
  jitter: 24,
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Radius from points: 7 px, up to 5 more. sqrt keeps one hot node from dominating (Obsidian compresses with sqrt too).
export function nodeRadius(points = 0) {
  return 7 + 5 * Math.min(1, Math.sqrt(Math.max(0, points) / 60));
}

export function createRoomLayout(d3, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const rnd = mulberry32(o.seed);
  const nodes = new Map();      // id -> node (kept across updates so positions persist)
  let linkObjs = [];
  let anchors = { group: new Map(), person: new Map() };

  const spot = ([fx, fy]) => [fx * o.width, fy * o.height];
  const cx = o.width / 2, cy = o.height / 2;

  function computeAnchors(graph, visible) {
    const group = new Map(), person = new Map();
    const groups = [...graph.groups].sort((a, b) => a.id - b.id);
    const taken = new Set();
    const loose = [];
    for (const g of groups) {                       // the first group at a station takes its spot
      const s = o.stationSpots[g.station_id];
      if (s && !taken.has(g.station_id)) { group.set(g.id, spot(s)); taken.add(g.station_id); } else loose.push(g);
    }
    loose.forEach((g, k) => {                       // everyone else goes on the ring, offset to avoid the spots
      const a = -Math.PI / 2 + (2 * Math.PI * (k + 0.5)) / Math.max(1, loose.length);
      group.set(g.id, [cx + o.groupRing[0] * o.width * Math.cos(a), cy + o.groupRing[1] * o.height * Math.sin(a)]);
    });
    const members = new Map();
    for (const p of visible) if (p.group_id != null && group.has(p.group_id)) members.set(p.id, p.group_id);
    for (const p of visible) {
      if (members.has(p.id)) { person.set(p.id, group.get(members.get(p.id))); continue; }
      // Mentors and staff sit between the groups they are linked to (the bridge).
      const linked = graph.links.flatMap(l => (l.a === p.id ? [l.b] : l.b === p.id ? [l.a] : []))
        .map(q => members.get(q)).filter(g => g != null);
      if (p.role !== "student" && linked.length) {
        const pts = [...new Set(linked)].map(g => group.get(g));
        person.set(p.id, [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length]);
      } else {                                      // solo: a stable spot on the outer edge, from the id (golden angle),
        let a = p.id * 2.399963;                    // nudged along the ring until it is clear of every group anchor
        const at = ang => [cx + o.soloRing[0] * o.width * Math.cos(ang), cy + o.soloRing[1] * o.height * Math.sin(ang)];
        for (let tries = 0; tries < 24; tries++) {
          const s = at(a);
          if ([...group.values()].every(g => Math.hypot(s[0] - g[0], s[1] - g[1]) >= o.soloClearance)) break;
          a += 0.35;
        }
        person.set(p.id, at(a));
      }
    }
    return { group, person };
  }

  function spawnPosition(p, graphGroupMembersPlaced, bulkLoad) {
    const j = () => (rnd() - 0.5) * o.jitter * 2;
    if (bulkLoad) {                                   // first load or a wall refresh: everyone starts at their own spot,
      const a = anchors.person.get(p.id) ?? [cx, cy]; // so the room appears already arranged and nothing walks across it
      return [a[0] + j(), a[1] + j()];
    }
    if (p.group_id != null) {
      const placed = graphGroupMembersPlaced(p.group_id);
      if (placed.length) {                            // a joiner starts among its group
        const mx = placed.reduce((s, n) => s + n.x, 0) / placed.length, my = placed.reduce((s, n) => s + n.y, 0) / placed.length;
        return [mx + j(), my + j()];
      }
      const a = anchors.group.get(p.group_id);
      if (a) return [a[0] + j(), a[1] + j()];
    }
    const [ex, ey] = spot(o.stationSpots[1]);        // a check-in starts at the Entrance
    return [ex + j(), ey + j()];
  }

  const sim = d3.forceSimulation([])
    .alphaDecay(o.alphaDecay).velocityDecay(o.velocityDecay)
    .force("x", d3.forceX(d => anchors.person.get(d.id)?.[0] ?? cx).strength(o.anchorStrength))
    .force("y", d3.forceY(d => anchors.person.get(d.id)?.[1] ?? cy).strength(o.anchorStrength))
    .force("link", d3.forceLink([]).id(d => d.id)
      .distance(l => (l.same ? o.inGroupDistance : o.crossDistance))
      .strength(l => (l.same ? o.inGroupStrength : o.crossStrength)))
    .force("charge", d3.forceManyBody().strength(o.charge))
    // Label-aware: keep the larger of (radius + pad) and half the name label, so a label never lands on a neighbour.
    .force("collide", d3.forceCollide(d => Math.max(d.r + o.collidePad, d.labelHalf ?? 0)).iterations(2))
    .stop();

  function setData(graph, { includeAbsent = false } = {}) {
    const visible = graph.people.filter(p => includeAbsent || p.here);
    anchors = computeAnchors(graph, visible);
    const ids = new Set(visible.map(p => p.id));
    for (const id of [...nodes.keys()]) if (!ids.has(id)) nodes.delete(id);   // drop who left or isn't here
    const placedInGroup = gid => [...nodes.values()].filter(n => n.gid === gid && n.placed);
    const bulkLoad = nodes.size === 0;                // an empty layout means this is the first snapshot
    for (const p of visible) {
      let n = nodes.get(p.id);
      if (!n) {
        const [x, y] = spawnPosition(p, placedInGroup, bulkLoad);
        n = { id: p.id, x, y, vx: 0, vy: 0, placed: true };
        nodes.set(p.id, n);
      }
      Object.assign(n, { gid: p.group_id ?? null, r: nodeRadius(p.points), labelHalf: (p.name?.length ?? 0) * o.labelPxPerChar / 2 + 4, name: p.name, role: p.role, focus: !!p.focus });
    }
    linkObjs = graph.links.filter(l => ids.has(l.a) && ids.has(l.b)).map(l => ({
      source: l.a, target: l.b, strength: l.strength,
      same: nodes.get(l.a).gid != null && nodes.get(l.a).gid === nodes.get(l.b).gid,
    }));
    sim.nodes([...nodes.values()]);
    sim.force("link").links(linkObjs);
    sim.alpha(o.alphaReheat);                       // reheat, never restart from 1
  }

  return {
    setData,
    // Advance up to n ticks; stops by itself once cooled. Returns how many ticks ran.
    step(n = 1) { let ran = 0; while (ran < n && sim.alpha() >= sim.alphaMin()) { sim.tick(); ran++; } return ran; },
    isSettled: () => sim.alpha() < sim.alphaMin(),
    positions: () => [...nodes.values()].map(n => ({ id: n.id, x: n.x, y: n.y, r: n.r, gid: n.gid, name: n.name, role: n.role, focus: n.focus })),
    anchors: () => ({ group: new Map(anchors.group), person: new Map(anchors.person) }),
    pin(id, x, y) { const n = nodes.get(id); if (n) { n.fx = x; n.fy = y; sim.alpha(o.alphaReheat); } },
    release(id) { const n = nodes.get(id); if (n) { n.fx = null; n.fy = null; sim.alpha(o.alphaReheat); } },
    options: o,
  };
}
