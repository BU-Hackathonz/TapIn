# Devpost draft: Tap In

Draft for the BostonHacks 2026 submission. `[CHECK]` also marks every claim Yaovi's side has not seen working with our own eyes (teammates' test reports included): confirm each one or cut it. Replace every `[NUMBER]` with the output of `python tools/count.py`, and every `[QUOTE]` with a real quote you have permission to use (first name only). Anything marked `[CHECK]` must be confirmed before submitting; never describe a feature as working unless it worked at judging.

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

- **Check in:** tap your badge alone. You light up on the wall as "here now", with lines to people you already know and the open tables that fit you. [CHECK: wall]
- **Where you stand:** your phone shows people you know who are here, your top 3 tables with the reason ("needs firmware", "you know Sam"), people to meet, and your points.
- **Join a group:** walk over and scan in together. You're linked to every member and everyone earns points. [CHECK: seen with real badges]
- **Help:** when a mentor scans in with a table, its need is marked handled on the needs board. [CHECK: seen with real badges]
- **Open or heads-down:** tables that want to focus never show up as a suggestion, and neither do people on focus mode.
- **Sound:** the wall plays a bell when someone arrives and a pluck for every new connection. [CHECK: wall sound]

## How we built it

ESP32 stations with RC522 readers send each badge tap to a Python FastAPI server. The server groups taps that land on the same station within 6 seconds into one scan, decides what it means (check-in, new group, join, help or repeat), stores it in Tiger Data, and pushes it over a WebSocket to the wall display (d3 and Tone.js) [CHECK: wall]. The phone site asks the server for your page every 5 seconds. From tap to wall takes [CHECK: measured time].

We split the work by layer and agreed on the JSON shapes first, so four people could build in parallel. Every teammate's coding agent posted to one pinned GitHub issue, so one person's agent could hand work to another's.

## The stations

[CHECK: a sentence on the enclosures and a photo caption.] Each station is just an ESP32 and an RC522 reader [CHECK: real cost]. We cut the LED strip to keep the stations simple and reliable; the board's own blue light blinks a different rhythm for each state, and the wall carries the big moment with animation and sound. [CHECK: firmware on real hardware]

## Built on Tiger Data

Taps are time-series, so every raw tap and every resolved scan goes into a hypertable (`taps`, `scan_events`). The live stats chart reads a continuous aggregate (`scans_per_10min`) instead of scanning raw rows, so it stays fast and live. [CHECK: confirm the continuous aggregate and chart worked at judging; add a screenshot.] `connections` is a regular table on purpose: a unique index on a hypertable has to include the time column, and we need exactly one row per pair of people.

## Gemini icebreakers

When someone checks in, the wall shows a template line for their top table right away. In the background, Gemini writes one icebreaker under 20 words from the person's skills and the table's project. If it doesn't answer within 2 seconds, the template line stays, so a slow network never breaks a tap. [CHECK: so far tested only with the network faked, no real key yet] A real one from last night: "[CHECK: paste a real icebreaker Gemini wrote]".

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

- **Scan windows.** Taps arrive milliseconds apart, sometimes at two stations at once. Each station keeps one open window with a 6 second timer that restarts on every tap, and the window is removed before it is resolved, so a tap that lands mid-resolve starts a fresh scan instead of corrupting the old one.
- **The judges didn't match each other at first.** With our test room loaded, Judge 1's top match was a test person, not Judge 2: both scored the same and the tie went to whoever was created first. Ties now go to the person with fewer connections, which is also fairer to newcomers. [CHECK: found and fixed by David; we haven't rerun it ourselves]
- **One badge claim at a time.** The station can't tell whose phone a blank badge belongs to, so only one sign-up can wait for a badge at once; a second phone is asked to try again in a few seconds.
- [CHECK: add what broke tonight from the team chat, e.g. hardware or Wi-Fi.]

## Accomplishments that we're proud of

- All 9 of our tap test scenarios (check-in, new group, join, repeat, mentor help, two stations at once, unknown badge, badge claim) pass against the real Tiger Data database. [CHECK: David's run, not ours; rerun before quoting]
- The full phone flow, from sign-up to a claimed badge to "where you stand", passed 29 of 29 checks against the real server. [CHECK: David's run, not ours; rerun before quoting]
- Four people built four layers in parallel without waiting on each other: we agreed on the JSON shapes first, and each person's coding agent coordinated through one pinned GitHub issue.
- [CHECK: the real numbers from tonight belong here too.]

## What didn't work

- **Self-service delete.** We planned a "delete my profile" button, then dropped it: without logins, anyone could delete anyone by guessing a number. Profiles are deleted on request at our table instead.
- [CHECK: Gemini icebreakers had not been tested with a real API key as of Saturday noon. Say here whether they worked at judging.]
- [CHECK: anything else that was cut or broke. Never describe a cut feature as working.]

## What we learned

- Agree on the data shapes before anyone writes code, and build fake versions of every other layer first, so nobody waits.
- A feature that sounds friendly (delete your own profile) can be a security hole when there are no accounts. We chose the safe version.
- [CHECK: one line from each teammate.]

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
