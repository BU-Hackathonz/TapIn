# Room view node layout: reference proposal

A proposal for the wall's room view (Jun's `wall/`). Nothing here is wired into the app. Take what is useful.

- `room_layout.mjs`: a layout engine with no DOM. Feed it `GET /api/graph` snapshots, read positions every frame.
- `room_layout.test.mjs`: a headless acceptance test for the Playbook's bar: *40 people across 5 groups settle in under 3 s into clean clusters, with no labels on top of each other.*

```bash
cd reference/room-layout && npm install && npm test     # 21 checks, all pass
```

## What we learned from Obsidian's graph view

Obsidian v1.10.3 was run in a throwaway profile with a synthetic vault (29 notes, 79 links) and inspected over the Chrome DevTools Protocol. No vault or setting of anyone's was touched. This README describes mechanisms in our own words and ships original code; nothing is copied from Obsidian.

**Observed** (read from the running app):

| What | Evidence |
|---|---|
| Physics runs in a Web Worker. The main thread only draws (PixiJS). | `renderer.worker` is a `Worker`; the renderer holds Pixi graphics per node and link. |
| The worker sends one message per tick (`{id[], buffer, v}`): about 300 ticks over about 5 s, then stops. | 301 messages, `v` = 0..299, last at 5.7 s. After that, zero movement. |
| The main thread stores the latest result and queues a render. | Handler: ignore handshakes, store `workerResults`, call `changed()`. |
| Changing any force posts `{forces, alpha: 0.3, run: true}`: a reheat to 0.3, not a restart from 1. | Intercepted `postMessage` on three option changes. |
| Data changes are incremental. Existing nodes keep position; added nodes are placed; removed ones dropped; then the worker gets `{nodes: id -> [x, y], links, alpha: 0.3}`. | `setData` behaviour plus the intercepted message. |
| A node has `x, y, fx, fy` (pinning, as in d3-force), `weight` (= its link count), `type`, a Pixi circle and a text label. | Inspected node objects. |
| New nodes: each gets about a 60 by 60 px budget. A node with already-placed neighbours starts at their average position plus jitter. Otherwise it appears in a ring just outside the current layout. | Read from `setData`. |
| UI force values are transformed before the worker sees them: repel is the UI value cubed (5 -> 125, 10 -> 1000, 20 -> 8000); link strength is `s / (10 - 9s)` (0.5 -> 0.0909); link distance is passed through. | Three live trials, exact matches. |
| Node size: diameter = `2 * max(8, 3 * sqrt(links + 1))` times a user multiplier. | Fits six measured sizes exactly (16, 17, 18, 19, 19.9, 21.6). |
| The graph stops rendering when idle (idle-frame counter, render only when something changed). | `idleFrames`, `queueRender`. |

**Inferred, not proven:** the worker is d3-force (the 0.3 reheat, `fx/fy`, and tick-until-cool behaviour are all d3 conventions, but I did not read the worker script). The centre-strength mapping is a convex curve I could not reduce to a formula (0 -> 0, 0.2 -> 0.0153, 0.5187 -> 0.1, 1 -> 1).

**Not examined:** colours/groups, search filtering, the local-graph mode, or anything outside the graph view.

## What we took, and what we changed for a room

| Idea | Obsidian | Tap In |
|---|---|---|
| Physics separate from drawing | worker + Pixi | pure module; the wall's frame loop calls `step()` and reads `positions()` |
| Skip work when idle | idle frames | `isSettled()` is true once cooled; `step()` then does nothing |
| Incremental updates, reheat to 0.3 | yes | same; `setData()` keeps positions and velocities and sets alpha to 0.3 |
| Where new nodes start | neighbours' average, else a ring outside | a joiner starts among its group; a live check-in starts at the Entrance spot; a bulk load (first snapshot or a wall refresh) starts everyone at their own spot |
| Pull | one centre force (one blob) | a per-group anchor pulls its members, stations pin their group to the station spot, solos get stable edge spots, mentors sit between the groups they are linked to |
| Size | `3 * sqrt(links + 1)` | `7 + 5 * min(1, sqrt(points / 60))` px radius (Playbook: 7 plus up to 5), sqrt so one hot node never dominates |
| Spacing | radius only | `max(radius + 18, half the name label)`, so a label never lands on a neighbour |

## Using it on the wall

```js
// d3 v7 is vendored in wall/vendor/, so pass the global in
const layout = createRoomLayout(d3, { width: 1440, height: 1080 });

async function load()  { layout.setData(await (await fetch("/api/graph")).json()); }   // first load and every reconnect
function onEvent(ev)   { /* any change: refetch /api/graph (or patch your copy), then layout.setData(graph) */ }

function frame() {
  if (!layout.isSettled()) layout.step(1);          // advance the physics
  draw(layout.positions());                         // [{id, x, y, r, gid, name, role, focus}]; skip drawing when settled and nothing else changed
  requestAnimationFrame(frame);
}
```

Notes for the wall:
- `setData(graph, { includeAbsent: true })` also lays out people who are not here (default: hidden).
- `pin(id, x, y)` and `release(id)` hold a node still (for the 8 s "moment" highlight, or a drag).
- Groups: the first group at a station takes that station's spot (Entrance lower left, Table 2 upper middle); other groups share a wide ring.
- Pass `{ seed }` for the same room every time (useful for screenshots and the demo).

## Acceptance results (headless, 40 people, 5 groups, 6 solo, 2 mentors)

| Check | Result |
|---|---|
| First load settles | 140 ticks, 2.3 s at 60 Hz (bar: under 3 s) |
| Circles overlapping / labels overlapping / labels on another node | 0 / 0 / 0 |
| Cluster cleanliness (a group's spread against half the gap to its nearest group; below 1 is clean) | 0.33 |
| One check-in: re-settle time; how far existing people move | 2.3 s; median 7.6 px, worst 18 px |
| A person joins a group; people in other groups | joiner ends inside the cluster; median move 4.0 px |
| Deterministic for a seed; idle does no work | yes; yes |

**Limits of this test:** it is headless, and label size is an estimate (11 px per character, 22 px tall, drawn under the node). Real font metrics, the real renderer and real data have not been tried. Playbook sizing says nothing under 18 px on the wall, so check label width with the real font and tune `labelPxPerChar`.

**One design flaw the test caught:** the first version spawned everyone at the Entrance on a bulk load. Solo people had not walked to their edge spots by the time the layout cooled, so the next check-in made them travel 250 to 350 px, which looks like the room jumping. Starting a bulk load at each person's own spot fixed it (worst move after a check-in: 182 px down to 18 px).
