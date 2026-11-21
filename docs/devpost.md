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

ESP32 stations with RC522 readers send each badge tap to a Python FastAPI server. The server groups taps that land on the same station within 6 seconds into one scan, decides what it means (check-in, new group, join, help or repeat), stores it in Tiger Data, and pushes it over a WebSocket to the wall display (d3 and Tone.js) and to the phone site. A tap reaches the server in about a quarter of a second (median 260 ms over 12 real taps on the venue network), and when a scan closes the wall gets the event in under a millisecond.

We split the work by layer and agreed on the JSON shapes first, so four people could build in parallel. Every teammate's coding agent posted to one pinned GitHub issue, so one person's agent could hand work to another's.

## The stations

[CHECK: a sentence on the enclosures and a photo caption.] Each station is an ESP32 and an RC522 reader on a breadboard, about $15 of parts, in a box with the reader taped under the lid. The stations are deliberately dumb: they send the badge ID and show whatever the server says, so all the logic lives in one place. We planned five LEDs per station and cut them for time; the board's own blue LED shows each state as its own rhythm instead (solid while a scan collects, a fast flicker for a join), and the wall carries the big moments with light and sound. The firmware never blocks: every HTTP call times out after 800 ms, Wi-Fi rejoins by itself, and both stations ran a 30-minute soak with no reboots and no time offline.

## Built on Tiger Data

Taps are time-series, so every raw tap and every resolved scan goes into a hypertable (`taps`, `scan_events`). The live stats chart reads a continuous aggregate (`scans_per_10min`) instead of scanning raw rows, so it stays fast and live: it runs in real-time mode, so the current ten minutes show before they're materialized. A second continuous aggregate, `scans_per_hour`, is built on top of the first (a hierarchical continuous aggregate) and feeds the busiest-station-by-hour view for the space's staff. [CHECK: confirm the chart worked at judging; add a screenshot.] `connections` is a regular table on purpose: a unique index on a hypertable has to include the time column, and we need exactly one row per pair of people.

## Gemini icebreakers

When someone checks in, the wall shows a template line for their top table right away. In the background, Gemini writes one icebreaker under 20 words from the person's skills and the table's project. If it doesn't answer within 2 seconds, the template line stays, so a slow network never breaks a tap. A real one from tonight, 0.9 s after a check-in: "Avery, your firmware and pitch skills fit Connection Map's design needs well." [CHECK: swap in a judge's or a recruit's if a better one comes up.]

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

[CHECK: from the team chat's "what broke and how we fixed it" lines.] Taps arrive milliseconds apart, sometimes at two stations at once, so grouping them into scans without corrupting one another was the hardest part of the server. Hardware ones from Avery's side:
- The stations joined no network at first. The firmware now logs why a join fails, which showed "network not found" (the router broadcast a different name than our plan said), then "auth failed" (we had the admin password, not the Wi-Fi one).
- For a moment between "collecting" and the result, the server reported "idle" while it wrote the scan to the database, so stations blinked "nothing happened" right before "you're in". It now keeps reporting "collecting" until the result is set.
- Gemini returned 404 for every icebreaker: the model in our plan is no longer offered to new API keys. We measured the available models against our 2-second budget and switched to one that answers in under a second.

## Accomplishments that we're proud of

[CHECK]

## What didn't work

[CHECK: be honest; judges read candor as confidence. Never describe a cut feature as working.] The stations' LED ring was cut for time, so a station's only feedback is a small blue LED; a group joining no longer lights up the box. Each request from a station takes about 200 ms even though the network answers in 3 ms; we ruled out Wi-Fi signal, connection setup and the server, and ran out of time to chase it into the ESP32's network stack.

## What we learned

[CHECK]

## What's next for Tap In

A permanent install in the Spark! lab: a station at the entrance, the couches and the workbenches, points tied to real perks in the lab, and data on how the space connects people. Then any library or dorm lounge in Boston.

## Built with

python, fastapi, tiger-data, timescaledb, postgresql, websockets, gemini, esp32, arduino, rfid, d3.js, tone.js, html, javascript

## Gallery (caption each photo)

1. Both stations on the table
2. A badge tap, close up
3. The wall mid check-in, with lines and a suggested table
4. A group forming on the wall
5. The phone sign-up page
6. The "where you stand" page
7. The needs board with a handled need crossed out
8. The live scans chart (Tiger Data)
9. The station wiring
10. The team building
