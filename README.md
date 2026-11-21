# Tap In

**You walk into a room, tap in, and it shows you which table needs you.**

Tap In turns walking into a room into a way to find your people. Tap your badge at a station when you arrive, and the wall display and your phone show where you stand: who you already know here, and which tables could use your skills. Walk over, scan in together with the group, and you're part of it. Everyone earns points for meeting new people.

Built at BostonHacks 2026 for the **Boundless Boston** track and the **Spark! Hack Our Space** subtrack.

## The problem

Boston is America's college city, but walking into a room full of students doesn't tell you who to sit with. New students end up studying alone next to groups they could have joined.

## How it works

There is one action: **tap**. The server groups taps that land on the same station within 6 seconds into one scan.

| Scan | What happens |
|---|---|
| 1 badge | **Check-in.** You light up on the wall as "here now", with lines to people you already know and the open groups that fit you. |
| 2+ badges, none in a group | **New group.** Everyone is linked to each other and lands on the map as one cluster. |
| 2+ badges, one already in a group | **Join.** The others join that group and get linked to every member. |
| A mentor or staff badge in the scan | **Help.** The group's need is marked handled and the mentor shows as a bridge between groups. |
| Everyone already met | **Repeat.** No points; the connection gets stronger. |

A join only counts when the whole group scans in at the same station, so the hardware itself proves people actually met.

- **Phone site:** sign up in about 30 seconds (first name, up to 3 skills, up to 2 "looking for" tags), then tap any blank badge to claim it. Your "where you stand" page shows people you know who are here, your top groups with a reason ("Table 2 needs firmware"), and your points.
- **Wall display:** a live room view where each group is a cluster labeled with its table and what it's building, plus stats, a leaderboard, a needs board, and an activity log. It plays a pentatonic bell when someone arrives and a pluck for every new link.
- **Modes:** groups can be open or heads-down, and people can check in on focus mode. Heads-down groups and focus people are never suggested.
- **Icebreakers:** Gemini writes a one-line icebreaker for each suggestion, with a template line as a fallback.

## Architecture

```
ESP32 + RC522 stations ──HTTP──▶ FastAPI server ──▶ Tiger Data (TimescaleDB)
  (Entrance, Table 2)              │   scan windows, groups, points, matching
                                   │   Gemini icebreakers (background, 2 s timeout)
                                   ├──WebSocket──▶ Wall display (d3 + Tone.js)
                                   └──HTTP───────▶ Phone site
```

- **Stations** are dumb: they send a badge UID and light whatever state the server returns. 5 NeoPixel LEDs per station, no buzzer.
- **Server:** Python FastAPI on one event loop. Each station has at most one open scan window; the window is popped before it's resolved, so a tap that lands mid-resolve opens a fresh window.
- **Database:** Tiger Data. `taps` and `scan_events` are hypertables, and the live stats panel reads the `scans_per_10min` continuous aggregate. `connections` stays a regular table because it needs a unique row per pair.
- **Wall and phone** are plain HTML/JS served by the same server at `/wall` and `/phone`.

## Repo layout

```
server/     FastAPI app, scan windows, groups, points, matching, DB, Gemini
firmware/   station.ino (one sketch, STATION_ID set at the top)
wall/       Wall display: room view, panels, sound
phone/      Sign-up, claim, and "where you stand" pages
tools/      seed.py, fake_taps.py, and the agent board script (tools/board)
```

## Running it

```bash
pip install fastapi uvicorn asyncpg
cp .env.example .env        # DATABASE_URL, GEMINI_API_KEY
uvicorn server.main:app --host 0.0.0.0 --port 8000
```

- Wall: `http://<server-ip>:8000/wall` (click **Start** to enable sound)
- Phone: `http://<server-ip>:8000/phone`
- Offline database fallback: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=tapin timescale/timescaledb:latest-pg16`, then point `DATABASE_URL` at it.

Station wiring, screenshots, and the full setup guide get added here during the build.

## How we built it: the agent board

Every teammate's coding agent posts to one pinned GitHub issue, the [agent board (#1)](https://github.com/BU-Hackathonz/TapIn/issues/1). Agents tag each other by GitHub username and wait for their own tag, so one person's agent can hand work to another's without anyone sending a text. `AGENTS.md` has the rules and says who owns which folder.

Each teammate runs this once:

```bash
gh auth login
tools/board whoami      # prints your login
tools/board unread      # catch up on the board
```

| Command | What it does |
|---|---|
| `tools/board post "[Avery's Claude] ..."` | Posts to the board. Every post starts with whose agent it is. |
| `tools/board unread` | Shows new posts and flags the ones that tag you. |
| `tools/board wait` | Blocks until someone else posts. |
| `tools/board read -n 20` | Shows the last 20 posts. |

Claude Code sees the board on its own through the hooks in `.claude/`. Any other agent runs `tools/board unread` before each task and each commit. The board tooling comes from the hackathon agent board template.

## Team

| Person | GitHub | Owns |
|---|---|---|
| David (lead) | [@dribeiro0](https://github.com/dribeiro0) | Server, Tiger Data, Gemini, network |
| Avery | [@DxubleBTW](https://github.com/DxubleBTW) | Station hardware and firmware, enclosures, stats and leaderboard |
| Jun | [@sysoutprntlne](https://github.com/sysoutprntlne) | Wall display and sound |
| Yaovi | [@unseentrader007](https://github.com/unseentrader007) | Phone site, seed data, recruiting, pitch and Devpost |
