# Devpost draft: Tap In

Draft for the BostonHacks 2026 submission. Replace every `[NUMBER]` with the output of `python tools/count.py`, and every `[QUOTE]` with a real quote you have permission to use (first name only). Anything marked `[CHECK]` must be confirmed before submitting; never describe a feature as working unless it worked at judging.

## Submission checklist

- [ ] Team name, project name "Tap In", all four members added (David, Avery, Jun, Yaovi)
- [ ] Main track: Boundless Boston. Subtrack: Spark! Hack Our Space
- [ ] Opted into Best Use of Tiger Data, Best Use of Gemini API, Best Domain Name from GoDaddy Registry
- [ ] 1-minute video with sound and captions, plays without a login
- [ ] About 10 gallery photos, each with a caption (list below)
- [ ] Public GitHub repo link, README up to date
- [ ] tapin.boston linked and loading
- [ ] All `[NUMBER]`, `[QUOTE]` and `[CHECK]` placeholders gone
- [ ] Ten-minute link check: video, repo, domain
- [ ] Status says **Submitted**, not Draft, by 8:45 AM

## Tagline

You walk into a room, tap in, and it shows you which table needs you.

## Summary (first two paragraphs carry the page)

Boston is America's college city. Every weekend, students new to the city walk into libraries, labs and lounges full of people, and nothing tells them who to sit with. So they study alone, next to groups they could have joined.

Tap In turns walking into a room into a way to find your people. Tap your badge at a station when you arrive, and the wall and your phone show where you stand: who you already know here, and which table could use your skills, like "Table 2 needs firmware". It isn't just an app. The room does the matching: to join a group, you and the group scan in together at the same station, so the hardware itself proves you actually met. Last night **[NUMBER] hackers** checked in and formed **[NUMBER] groups**.

## Inspiration

[CHECK: one or two sentences from a teammate's own experience of moving to Boston and sitting alone in a room full of students.]

## What it does

- **Check in:** tap your badge alone. You light up on the wall as "here now", with lines to people you already know and the open tables that fit you.
- **Where you stand:** your phone shows people you know who are here, your top 3 tables with the reason ("needs firmware", "you know Sam"), people to meet, and your points.
- **Join a group:** walk over and scan in together. You're linked to every member and everyone earns points.
- **Help:** when a mentor scans in with a table, its need is marked handled on the needs board.
- **Open or heads-down:** tables that want to focus never show up as a suggestion, and neither do people on focus mode.
- **Sound:** the wall plays a bell when someone arrives and a pluck for every new connection.

## How we built it

ESP32 stations with RC522 readers send each badge tap to a Python FastAPI server. The server groups taps that land on the same station within 6 seconds into one scan, decides what it means (check-in, new group, join, help or repeat), stores it in Tiger Data, and pushes it over a WebSocket to the wall display (d3 and Tone.js) and to the phone site. From tap to wall takes [CHECK: measured time].

We split the work by layer and agreed on the JSON shapes first, so four people could build in parallel. Every teammate's coding agent posted to one pinned GitHub issue, so one person's agent could hand work to another's.

## The stations

[CHECK: a sentence on the enclosures and a photo caption.] Each station is an ESP32, an RC522 reader and 5 LEDs, about $15 of parts. The LEDs light one by one as each badge joins a scan, so a group arriving lights up together.

## Built on Tiger Data

Taps are time-series, so every raw tap and every resolved scan goes into a hypertable (`taps`, `scan_events`). The live stats chart reads a continuous aggregate (`scans_per_10min`) instead of scanning raw rows, so it stays fast and live. [CHECK: confirm the continuous aggregate and chart worked at judging; add a screenshot.] `connections` is a regular table on purpose: a unique index on a hypertable has to include the time column, and we need exactly one row per pair of people.

## Gemini icebreakers

When someone checks in, the wall shows a template line for their top table right away. In the background, Gemini writes one icebreaker under 20 words from the person's skills and the table's project. If it doesn't answer within 2 seconds, the template line stays, so a slow network never breaks a tap. A real one from last night: "[CHECK: paste a real icebreaker Gemini wrote]".

## Domain

tapin.boston [CHECK: confirm it serves the phone site].

## Real results from tonight

- **[NUMBER]** people signed up and claimed a badge
- **[NUMBER]** groups formed
- **[NUMBER]** mentor help scans
- **[NUMBER]** new connections between people who hadn't met
- "[QUOTE]" ([first name])
- "[QUOTE]" ([first name])

These numbers count real people only: our fake test badges and the judge badges are excluded.

## Challenges we ran into

[CHECK: from the team chat's "what broke and how we fixed it" lines.] Taps arrive milliseconds apart, sometimes at two stations at once, so grouping them into scans without corrupting one another was the hardest part of the server.

## Accomplishments that we're proud of

[CHECK]

## What didn't work

[CHECK: be honest; judges read candor as confidence. Never describe a cut feature as working.]

## What we learned

[CHECK]

## What's next for Tap In

A permanent install in the Spark! lab: a station at the entrance, the couches and the workbenches, points tied to real perks in the lab, and data on how the space connects people. Then any library or dorm lounge in Boston.

## Built with

python, fastapi, tiger-data, timescaledb, postgresql, websockets, gemini, esp32, arduino, rfid, d3.js, tone.js, html, javascript

## Gallery (caption each photo)

1. Both stations on the table
2. A badge tap, close up
3. The wall mid check-in, with lines and a suggested table (have: docs/media/wall-demo.gif, demo mode with sample data; replace with a real one if you get it)
4. A group forming on the wall
5. The phone sign-up page
6. The "where you stand" page
7. The needs board with a handled need crossed out
8. The live scans chart (Tiger Data)
9. The station wiring
10. The team building (have: docs/media/team-building.jpg)
