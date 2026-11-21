# Proposal: host mode and participant mode under one site

Status: **proposal, nothing built.** Written Saturday ~5:40 PM ET for the team to decide on. It changes what Jun's wall and Yaovi's phone site are for, so it needs a yes from David (lead), Jun (wall) and Yaovi (phone site) before anyone builds. Where the document makes a recommendation, it says so and says why; the decisions are collected in section 10.

## 1. The idea in one paragraph

Today `/wall` is an interactive 3D map: you can drag it, zoom it and tap a person for a card. That is the right kind of screen for a phone and the wrong kind for a projector, because nobody touches a projector. The proposal is to split by who is looking:

- **Participants** use their **phone** after signing up. It is where the interactive parts live: where you stand, your table, and an explore view of the room.
- **The host** (our table, the laptop on the wall) opens a **host screen**: a static, flat 2D room plan that only shows, never reacts to input, and is readable from across the room.
- Both live under **one address**, so the story is simple: *people get the phone, the room gets the wall.*

## 2. What exists today (from `main`)

| Piece | What it is now | Owner |
|---|---|---|
| `/phone/` | Sign-up, claim (30 s countdown), where-you-stand (focus, table, suggestions), needs board for mentors | Yaovi |
| `/wall/` | One full-screen 3D map on a 2D canvas. Drag to rotate, scroll or pinch to zoom, tap a person for a card (sample bio, drawn faces), idle spin. Collapsible "Room activity" panel (stats, scans chart, top tables, needs, activity). "You" and Settings tab with themes. Sound after a Start click. Built-in demo room when no server is reachable | Jun |
| `/` | Nothing. The server has no root page | none |
| Station | No screen. The board's blue LED shows state | Avery |

The wall's interaction is spread across two files: `view3d.js` (pointer, wheel, right-click, Escape, profile card) and `corner.js` (the "You"/Settings tab and its click and key handlers).

## 3. Goals and non-goals

**Goals**
- The wall is a display: no input does anything, no cursor, nothing to leave in a bad state.
- The wall is readable at 10 feet and understandable in 5 seconds: who is here, which tables exist, what each table needs.
- Participants can explore the room on their own phone without touching the wall.
- No change to the physical story: the tap is the only way to join. The phone is for setup and for looking.
- Nothing breaks between now and 6:30 PM.

**Non-goals for tonight**
- Chat (section 7).
- A real account system. We still have no passwords; sign-up still gives a person id and a badge.
- Changing any server contract in phases 1 and 2.

## 4. The modes and how someone gets into each

```
                         /   (new landing page, static)
                         |
           +-------------+--------------+
           |                            |
     "I'm here"                       "Host"
           |                            |
    /phone/ sign-up                 /host/  (new)
           |                            |
    claim a badge              static 2D room plan
           |                       (display only)
    /phone/me.html
     |- Where you stand   (exists)
     |- Explore the room  (Jun's 3D view, moved here)
```

- `/` is a plain static page with two large buttons. It is also what the sign QR can point at. Cost: one small file plus a server route (a few lines).
- **"I'm here"** goes to the existing phone sign-up. Nothing changes there.
- **"Host"** goes to `/host/`. The wall laptop bookmarks `/host/` directly, so the landing page is never in the path at judging.
- The old `/wall/` URL keeps working and stays the current 3D map until the 2D view is verified, then it becomes the phone's Explore view (section 6).

## 5. The host screen (the part David would build)

### 5.1 What it shows

One 1920×1080 page, no scrolling, no input.

- **Left, about 75% of the width: the room plan.** Tables are clusters, each labelled in monospace above it: `Table 2 · robot arm · needs firmware`. A table pinned to a station sits at that station's spot (Entrance lower left, Table 2 upper middle, per the Playbook). Other tables share a wide ring. Solo people sit around the outer edge. Mentors and staff sit between the tables they are linked to, as bridges. Lines inside a table are short; lines between tables are long and faint.
- **Right, about 25%: the room's numbers.** here now, tables, links today; tables by points (top 4); needs, with minutes waiting and handled ones struck through; recent activity (last 6); scans per 10 minutes (12 bars, the newest highlighted). All of it already exists as data: `/api/stats`, `/api/leaderboard`, `/api/needs`, and the `stats_updated`, `needs_updated` and `points_updated` events.
- **Bottom strip: the latest moment.** `3:41 pm — Maya checked in. Knows Jordan and Grace. Table 2 needs firmware.` The Gemini line replaces the template text when it arrives (the `icebreaker` event).

### 5.2 What it does when things happen

One moment at a time, about 8 seconds each, queued so two arrivals never fight for attention (this is the Playbook's rule).

| Event | On screen | Sound |
|---|---|---|
| `checked_in` | The person appears at the Entrance and glides to their spot; ring around them; lines to people they know; the table that fits them gets a dashed outline | bell, in their note |
| `group_formed` | New cluster fades in with its label | pluck run, 120 ms apart |
| `group_joined` | Joiners glide into the cluster; new links flash | one pluck per new link |
| `help` | Mentor line drawn; the table's need struck through | one soft pluck |
| `link_strengthened` | Line thickens | none |
| `stats_updated`, `points_updated`, `needs_updated` | Right column updates in place | none |

### 5.3 What it must not do

- No drag, zoom, tap, right-click, keyboard or hover effects. `pointer-events: none` on the canvas, cursor hidden, no corner tab, no profile cards, no theme picker.
- No sample data, ever. In host mode a lost server shows `Reconnecting…` and retries; it never falls back to the demo room. (The "PROTOTYPE · SAMPLE DATA" tag belongs to demo mode only.)
- No idle spin. The room is still unless something happened.

### 5.4 How it works inside

- **Layout engine:** the tested module in `reference/room-layout/` (draft PR #42). It is pure logic: feed it `/api/graph`, read positions each frame. It already gives the behavior the host screen needs: reheat to 0.3 on a change and never restart, a bulk load starts everyone at their own spot (no walk-in on a refresh), a live check-in starts at the Entrance, joiners start among their table, label-aware spacing, and stops working when settled.
  Measured headless on 40 people, 5 groups: settles in 2.3 s; 0 overlapping circles or labels; a check-in moves existing people by at most 18 px.
- **Renderer:** a plain 2D canvas, about 300 to 400 lines: regions, links, nodes with the person's first name (at least 18 px), table labels, rings and fades. No library.
- **Library:** the engine needs d3-force. The wall has no d3 today (Jun's view is custom), so bundle `d3-force` (BSD-3, about 20 KB with its three small dependencies) into `wall/vendor/` as a classic script. It must be local, not a CDN, so the wall works with no internet; Jun just did the same for Tone.js.
- **Data:** only existing endpoints and events. First load: `GET /api/graph`, `GET /api/needs`, `GET /api/stats`, `GET /api/leaderboard`, then `/ws`. On any `/ws` drop: retry every 2 s and refetch.
- **Files:** new `wall/host.html`, `wall/host.js`, `wall/room_layout.js`, `wall/vendor/d3-force.js`; reuse `sound.js` as is and `panels.js` for the right column where it fits. Jun's `index.html`, `view3d.js` and `corner.js` are not edited in phase 1.
- **Route:** `/host/` serves `wall/host.html`. Today the server mounts `/wall` from the `wall/` folder at startup, so `/wall/host.html` already works without a server change; `/host/` as a short alias is a three-line route.

### 5.5 Acceptance criteria (measurable)

1. 40 fake people in 5 groups settle in under 3 s with no overlapping circles or labels (already passing headless; re-check in the real renderer).
2. A check-in moves existing nodes by less than 25 px at the median and never more than 150 px.
3. Names and table labels are at least 18 px at 1920×1080 and readable from 10 feet.
4. 30 minutes with `tools/fake_taps.py --events` running: no memory growth, no frozen frame, no console errors.
5. Server killed and restarted: the screen shows `Reconnecting…`, recovers by itself within 5 s, and never shows demo data.
6. A real two-badge scan on the live server appears as one table within 1 s of the server resolving it.
7. Input does nothing: drag, wheel, click, right-click, keys, touch.

## 6. The participant side

- **Where you stand** (exists) stays the first screen after "Got it".
- **Explore the room** (new tab on `me.html`): Jun's 3D map, moved from the wall. It was built for phones (a plain 2D canvas, touch and pinch, 30 fps preset), so this is mostly moving and wiring, not rewriting. The profile card is dropped or reduced to what we really have (first name, skills, working on). The mock bios and drawn faces must not appear to real people.
- **Constraint to decide on:** Explore needs the room's data (`/api/graph`, `/ws`). If phones come in through the public tunnel, those calls are blocked on purpose (we exposed only the phone's own calls). `tapin.boston` is not registered, so tonight every phone is on `cmap` and this is moot. If the tunnel ever happens, either allow a participant-scoped read or keep Explore on `cmap` only.

## 7. Chat: recommended out of scope tonight

Chat was part of the idea. The recommendation is not to build it tonight:

1. **It contradicts our pitch.** Our answer to "why not just an app?" is that the phone is only for setup and the room does the matching, not a feed. Chat turns the phone into the product.
2. **It is a lot of new surface:** a messages table, send and read endpoints, a push event, rate limits, retention, and a moderation answer for strangers messaging strangers. That is a contract change all four of us must sign off, with about 11 hours to the 5 AM feature freeze.
3. **It conflicts with "first name only, no student IDs".** Messages are new personal data and need a deletion story.

If the team wants something social later, the smallest honest version is a no-free-text nudge ("heading over") between two people who are both here, only after both have opted in. That is a post-event idea.

## 8. Host sign-in

The request was a host sign-in. Two options:

- **A. A mode, not a login (recommended).** `/host/` is just a page. The wall laptop bookmarks it. There is nothing to type, so nothing to fail at judging. This is safe because the wall shows nothing a participant cannot already see on the wall in the room: first names, tables, needs. It is also unreachable from the internet, since the tunnel exposes only `/phone` and the phone's own calls.
- **B. A host code.** The server reads `HOST_CODE` from `.env`; the landing page's Host button asks for it; the wall opens from `/host/?code=…` so the laptop never has to type it. It is not strong security (the code sits in a URL on a local network), so its only job is to stop a curious participant from landing on the host screen. Cost: one small endpoint and a cookie, about an hour with tests, plus one more thing that can go wrong.

**Recommendation: A tonight, B only if David wants the gate.** Neither changes an existing server contract; B adds one new endpoint.

## 9. Plan, owners and order

| Phase | When | What | Owner (proposed) | Server contract change |
|---|---|---|---|---|
| 0 | now | Check the "PROTOTYPE · SAMPLE DATA" tag does not show on the live wall. Remove the sample profile card from anything real people see | Jun | none |
| 1 | before 6:30 PM | Host screen v1 on a new page (`/wall/host.html`), flag-free, 3D wall untouched. Vendor d3-force | David (Jun reviews the PR) | none |
| 1b | before 6:30 PM | Landing page `/` with two buttons, and the `/host/` alias | David or Avery | a root route and an alias, no API change |
| 2 | tonight, before 10 PM | Move Jun's 3D map to the phone as Explore, hide the profile mock | Jun, with Yaovi for `me.html` | none |
| 3 | tonight, optional | Host code (option B in section 8) | Avery, as David's server backup | one new endpoint, announced to `@all` first |
| 4 | by 3 AM | Make `/host/` the wall's default, retire interactivity on `/wall/`, update Devpost and pitch wording | Jun, Avery | none |

Rule while the team is building: if phase 1 is not verified by 6:15 PM, the existing 3D wall stays the wall for recruiting and judging, and phase 1 lands later. Nothing depends on it.

## 10. Decisions needed

| # | Decision | Recommendation | Who decides |
|---|---|---|---|
| 1 | Is the wall display-only, with interaction on phones? | Yes | David, Jun |
| 2 | Build the 2D host screen as a new page, leaving the 3D wall alone until it is verified? | Yes | Jun (owns `wall/`) |
| 3 | Move the 3D map to the phone as Explore? | Yes, after phase 1 | Jun, Yaovi |
| 4 | Chat? | Not tonight | David |
| 5 | Host entry: mode only (A) or host code (B)? | A | David |
| 6 | A landing page at `/`? | Yes, two buttons, tiny | David, Yaovi |
| 7 | Who reviews and merges the host screen PR? | Jun reviews, David merges, since `wall/` is Jun's | Jun |

## 11. Risks

| Risk | What reduces it |
|---|---|
| New view not ready by 6:30 | It is a new page; the 3D wall keeps working. 6:15 PM cutoff above |
| 2D renderer looks worse than Jun's 3D | Jun reviews it; the 3D map is not removed, it moves to phones |
| Layout jumps or overlaps with real names | Engine is tested for both; the real-renderer check is criterion 1 and 2. Labels are sized from the name length |
| d3-force added to `wall/vendor/` | BSD-3, bundled locally, noted in `wall/vendor/` like Tone's license |
| Host screen shows nothing when the server is down | It says `Reconnecting…`, never demo data; stations show offline too, so it is visible and honest |
| Jun's and Yaovi's work disrupted | No edits to their files in phase 1; Explore is a move agreed with them |
| Pitch and Devpost wording | Add one sentence after phase 4: "Phones are for you; the wall is for the room." Avery owns the Devpost |

## 12. What this changes in the story we tell judges

- The demo flow does not change: judges tap, the wall shows the group.
- The wall becomes easier to read from the judges' table, which was the original Playbook intent.
- The "one site" framing makes the product easier to explain: one address, two modes, the physical tap in the middle.
