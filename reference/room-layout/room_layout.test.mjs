// Acceptance test for room_layout.mjs against the Playbook's bar for the wall:
// "40 fake people across 5 groups settle in under 3 s into clean clusters, with no labels on top of each other."
//   node room_layout.test.mjs        (needs: npm install d3-force@3)
import * as d3 from "d3-force";
import { createRoomLayout } from "./room_layout.mjs";

const TICKS_PER_SECOND = 60;
let failed = 0;
const check = (name, ok, detail = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (detail ? `   (${detail})` : "")); if (!ok) failed++; };

// ---- a 40-person room: 5 groups, 6 solo, 2 mentors (Playbook scale)
const NAMES = "Maya Sam Priya Leo Ava Omar Zoe Ethan Lina Noah Chloe Ravi Mia Jonah Aisha Theo Nora Kai Elena Marcus Wes Ola Ruth Kenji Gil Rae Sol Dee Eve Fay Cy Ben Ann Hal Ivy Jon Kit Lou Max Ned".split(" ");
const sizes = [8, 7, 7, 6, 4];                         // 32 group members
const people = []; const groups = []; const links = [];
let pid = 1;
sizes.forEach((size, gi) => {
  const gid = gi + 1;
  groups.push({ id: gid, name: `Table ${gid}`, station_id: gi === 0 ? 2 : gi === 1 ? 1 : null, mode: "open", looking_for: [], working_on: "x", points: 0 });
  const ids = [];
  for (let k = 0; k < size; k++) { const id = pid++; ids.push(id); people.push({ id, name: NAMES[id - 1], role: "student", group_id: gid, here: true, focus: false, points: (id * 7) % 70, note: null }); }
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) links.push({ a: ids[a], b: ids[b], strength: 1 });
});
for (let k = 0; k < 6; k++) { const id = pid++; people.push({ id, name: NAMES[id - 1], role: "student", group_id: null, here: true, focus: false, points: 1, note: null }); }
const mentor1 = pid++, mentor2 = pid++;
people.push({ id: mentor1, name: "Elena", role: "mentor", group_id: null, here: true, focus: false, points: 10, note: null });
people.push({ id: mentor2, name: "Marcus", role: "mentor", group_id: null, here: true, focus: false, points: 10, note: null });
links.push({ a: mentor1, b: 1, strength: 1 }, { a: mentor1, b: 9, strength: 1 }, { a: mentor2, b: 16, strength: 1 }, { a: mentor2, b: 23, strength: 1 });
links.push({ a: 2, b: 10, strength: 1 }, { a: 17, b: 24, strength: 1 });          // a couple of cross-group acquaintances
const graph = { people, groups, links };
check("room has 40 people and 5 groups", people.length === 40 && groups.length === 5, `${people.length} people`);

// ---- helpers
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function labelBox(p) { const w = p.name.length * 11, h = 22; return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y + p.r + 2, y1: p.y + p.r + 2 + h }; }
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
function metrics(layout) {
  const pos = layout.positions();
  let circleOverlaps = 0, labelOverlaps = 0, labelOnNode = 0;
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
    if (dist(pos[i], pos[j]) < pos[i].r + pos[j].r) circleOverlaps++;
    if (overlap(labelBox(pos[i]), labelBox(pos[j]))) labelOverlaps++;
  }
  for (const a of pos) for (const b of pos) if (a !== b) { const L = labelBox(a); if (b.x > L.x0 - b.r && b.x < L.x1 + b.r && b.y > L.y0 - b.r && b.y < L.y1 + b.r) labelOnNode++; }
  const byGroup = new Map(); for (const p of pos) if (p.gid != null) (byGroup.get(p.gid) ?? byGroup.set(p.gid, []).get(p.gid)).push(p);
  const cent = new Map([...byGroup].map(([g, m]) => [g, { x: m.reduce((s, p) => s + p.x, 0) / m.length, y: m.reduce((s, p) => s + p.y, 0) / m.length }]));
  const spread = new Map([...byGroup].map(([g, m]) => [g, Math.max(...m.map(p => dist(p, cent.get(g))))]));
  let worstRatio = 0;
  for (const [g, c] of cent) { const nearest = Math.min(...[...cent].filter(([h]) => h !== g).map(([, d]) => dist(c, d))); worstRatio = Math.max(worstRatio, spread.get(g) / (nearest / 2)); }
  const xs = pos.map(p => p.x), ys = pos.map(p => p.y);
  return { circleOverlaps, labelOverlaps, labelOnNode, worstRatio, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), cent, spread };
}

// ---- 1. first load (or a wall refresh): the whole room appears at once
const layout = createRoomLayout(d3, { seed: 7 });
layout.setData(graph);
const t0 = layout.step(10000);
check(`first load settles in under 3 s`, t0 <= 3 * TICKS_PER_SECOND, `${t0} ticks = ${(t0 / TICKS_PER_SECOND).toFixed(1)} s at 60 Hz`);
check("layout reports settled", layout.isSettled());
const m = metrics(layout);
check("no node circles overlap", m.circleOverlaps === 0, `${m.circleOverlaps} overlaps`);
check("no labels overlap each other", m.labelOverlaps === 0, `${m.labelOverlaps} pairs`);
check("no label sits on top of another node", m.labelOnNode === 0, `${m.labelOnNode} cases`);
check("clusters are clean: each group's spread is under half the gap to its nearest group", m.worstRatio < 1, `worst ratio ${m.worstRatio.toFixed(2)} (below 1 = clean)`);
check("everything stays inside the graph area", m.minX > -40 && m.maxX < 1440 + 40 && m.minY > -40 && m.maxY < 1080 + 40, `x ${m.minX.toFixed(0)}..${m.maxX.toFixed(0)}, y ${m.minY.toFixed(0)}..${m.maxY.toFixed(0)}`);
const anc = layout.anchors();
const table2 = m.cent.get(1), spot2 = anc.group.get(1);
check("station-pinned group sits at its station spot (Table 2)", dist(table2, { x: spot2[0], y: spot2[1] }) < 120, `${dist(table2, { x: spot2[0], y: spot2[1] }).toFixed(0)} px from the spot`);
const soloFar = layout.positions().filter(p => p.gid == null && p.role === "student").map(p => { const a = anc.person.get(p.id); return Math.hypot(p.x - a[0], p.y - a[1]); });
check("solo people have reached their edge spots after the first settle", Math.max(...soloFar) < 60, `farthest ${Math.max(...soloFar).toFixed(0)} px from its spot`);

// ---- 2. a new person checks in: the room must not jump
const before = new Map(layout.positions().map(p => [p.id, p]));
const newId = pid++;
const g2 = { people: [...people, { id: newId, name: "Newcomer", role: "student", group_id: null, here: true, focus: false, points: 1, note: null }], groups, links };
layout.setData(g2);
const spawn = layout.positions().find(p => p.id === newId);
const entrance = layout.options.stationSpots[1];
check("a check-in appears at the Entrance", Math.hypot(spawn.x - entrance[0] * layout.options.width, spawn.y - entrance[1] * layout.options.height) < 60);
const t1 = layout.step(10000);
check("check-in re-settles in under 3 s", t1 <= 3 * TICKS_PER_SECOND, `${t1} ticks = ${(t1 / TICKS_PER_SECOND).toFixed(1)} s`);
const moved = layout.positions().filter(p => p.id !== newId).map(p => dist(p, before.get(p.id))).sort((a, b) => a - b);
const median = moved[Math.floor(moved.length / 2)], worst = moved.at(-1);
check("room does not jump: median existing node moves under 25 px", median < 25, `median ${median.toFixed(1)} px, worst ${worst.toFixed(0)} px`);
check("room does not jump: no existing node moves more than 150 px", worst < 150, `worst ${worst.toFixed(0)} px`);
const m2 = metrics(layout);
check("still no overlaps after the check-in", m2.circleOverlaps === 0 && m2.labelOverlaps === 0, `${m2.circleOverlaps} circles, ${m2.labelOverlaps} labels`);

// ---- 3. the newcomer joins a group: starts among the group, then settles in
const g3 = { people: g2.people.map(p => (p.id === newId ? { ...p, group_id: 3 } : p)), groups, links: [...links, { a: newId, b: 18, strength: 1 }, { a: newId, b: 19, strength: 1 }] };
const beforeJoin = new Map(layout.positions().map(p => [p.id, p]));
layout.setData(g3);
const t2 = layout.step(10000);
check("joining a group re-settles in under 3 s", t2 <= 3 * TICKS_PER_SECOND, `${t2} ticks = ${(t2 / TICKS_PER_SECOND).toFixed(1)} s`);
const m3 = metrics(layout);
const joined = layout.positions().find(p => p.id === newId), c3 = m3.cent.get(3);
check("the joiner ends up inside its group's cluster", dist(joined, c3) <= m3.spread.get(3) + 1, `${dist(joined, c3).toFixed(0)} px from centre`);
const movedJoin = layout.positions().filter(p => p.id !== newId && p.gid !== 3).map(p => dist(p, beforeJoin.get(p.id))).sort((a, b) => a - b);
check("people in other groups barely move when someone joins", movedJoin[Math.floor(movedJoin.length / 2)] < 25, `median ${movedJoin[Math.floor(movedJoin.length / 2)].toFixed(1)} px`);

// ---- 4. someone leaves / not here any more: node is dropped, nobody else jumps
const g4 = { people: g3.people.map(p => (p.id === 5 ? { ...p, here: false } : p)), groups, links };
layout.setData(g4);
layout.step(10000);
check("a person who is no longer here is removed", !layout.positions().some(p => p.id === 5) && layout.positions().length === 40);

// ---- 5. idle: once settled, step() does nothing (the renderer can skip frames)
check("idle: settled layout does no work", layout.step(100) === 0);

// ---- 6. determinism: same seed, same room
const a = createRoomLayout(d3, { seed: 7 }); a.setData(graph); a.step(10000);
const b = createRoomLayout(d3, { seed: 7 }); b.setData(graph); b.step(10000);
check("deterministic for a given seed", JSON.stringify(a.positions().map(p => [p.id, +p.x.toFixed(3), +p.y.toFixed(3)])) === JSON.stringify(b.positions().map(p => [p.id, +p.x.toFixed(3), +p.y.toFixed(3)])));

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
