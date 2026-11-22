# Devpost fields: Tap In (BostonHacks 2026)

Owner: Avery. Every field except "About the project" (that one is `docs/devpost-story.md`). Devpost closes at 9:00 AM;
we submit by **8:45 AM**. Items marked **(refresh 8:15)** come from `tools/count.py` and `media/devpost/src/pull_live.py`.

## Submission checklist

- [ ] Project name **Tap In**, team name, all four members on the team: David, Avery, Jun, Yaovi
- [ ] Main track **Boundless Boston**; sub-track **Spark! Hack Our Space**
- [ ] MLH prizes: **Best Use of Gemini API**, **Best Use of Tiger Data**
- [ ] Best Domain (GoDaddy Registry): tick only if tapin.boston was registered through the MLH / GoDaddy Registry offer. It is live, but it's registered at Porkbun, so check the rules first.
- [ ] 1-minute video link from Yaovi, plays without a login
- [ ] Gallery: 14 images in the order below, each with its caption; the thumbnail stays as it is
- [ ] Public GitHub link and tapin.boston both open
- [ ] Gemini: the Google AI Studio project number, if the form asks for it
- [ ] Numbers refreshed at 8:15 in this file, in `devpost-story.md` and on Devpost
- [ ] Hardware photos added (shot list below), if there's time
- [ ] Status says **Submitted**, not Draft, by 8:45 AM

## Project overview

- **Project name:** Tap In
- **Tagline (elevator pitch):** Tap your badge when you walk in, and the room shows you which table needs you.
- **Team:** David, Avery, Jun and Yaovi (each adds themselves on Devpost; add any missing member before submitting)

## Short summary (if a field asks for one)

Boston is full of students sitting alone in rooms full of people. Tap In is two badge stations, a room display and a phone page: tap your badge when you arrive and you see who you already know and which table needs your skills. Joining a table only counts when everyone taps the same station together, so the room proves people met, and every tap plays a sound in your own note.

## Links

- **Video demo:** `VIDEO LINK FROM YAOVI` (placeholder)
- **GitHub:** https://github.com/BU-Hackathonz/TapIn
- **Try it:** https://tapin.boston (landing and the real phone sign-up; the room and hosting run on the venue Wi-Fi)

## Built with

python, fastapi, websockets, postgresql, timescaledb, tiger-data, gemini, google-gemini-api, esp32, arduino, rfid, nfc,
javascript, html5, css3, canvas, tone.js, web-audio, vercel, cloudflare

## Gallery, in upload order (every image 3:2, PNG, under 5 MB)

| # | File (media/devpost/) | Caption (140 characters max) |
|---|---|---|
| 1 | landing.png | The landing page at tapin.boston: a pixel Green Line train down Comm Ave, then Join a space or Host a space. |
| 2 | host-wall.png | Sample data, no real attendees: the host wall with tables by letter, groups by points, open needs and scans per 10 minutes. |
| 3 | phone-signup-claim.png | The real phone sign-up, then 30 seconds to tap a blank badge on any station. |
| 4 | join.png | Join a space: Sign up goes to the real sign-up; Log in is a prototype that stays in the browser. |
| 5 | host-pin.png | Host a space: a PIN on the venue Wi-Fi, then create the event (name and tables, saved on the server). |
| 6 | system.png | How it fits: two ESP32 stations and a laptop server on the venue Wi-Fi, Tiger Data and Gemini, and tapin.boston through a tunnel. |
| 7 | access.png | What is public: six API routes. Names, taps, hosting and live updates stay on the venue network. |
| 8 | sound-map.png | The room plays it: one pentatonic scale, a bell in your own note, plucks for links, a trolley bell for every 10th person. |
| 9 | live-activity.png | Every tap since Saturday 10 AM from the taps hypertable, by hour and station, our own testing included. (refresh 8:15) |
| 10 | tiger-data.png | Tap In on Tiger Data: two hypertables and two continuous aggregates, the second built on the first. |
| 11 | evidence-tap-latency.png | 31 real taps: median 259 ms from tap to reply. A quarter missed our 300 ms target; all beat 1 second. |
| 12 | evidence-soak.png | A 40-minute soak on both stations with no failed polls, reboots or time offline. |
| 13 | evidence-gemini-models.png | Choosing the Gemini model by measuring it with our real prompt. |
| 14 | evidence-recovery.png | The server down for 19 s: both stations showed offline and came back on their own. |

Not in the gallery (used inside "About the project" or kept for reference): `cover.png`, `enclosure.png`,
`scan-pipeline.png`, `tap-sequence.png`, `evidence-scan-runs.png`. Removed as outdated: the old wall, the old phone
pages, the old architecture and user-journey diagrams.

## Hardware photo shot list (Avery, phone camera, landscape)

Put them in `media/devpost/photos/`; they get cropped to 3:2 and captioned.

1. Both stations on the table, lids on, with the room behind them.
2. A hand tapping a badge on a station, close up.
3. A station with the lid open: the ESP32, the RC522 and the wiring.
4. A group tapping the same station together.
5. The host wall on the projector or a big screen, from where people stand.

## How the images were made

- Screenshots: `python media/devpost/src/shots_now.py` (venue server; the host wall's room from
  `python tools/fake_taps.py --events --port 8001`, a fake server with no database).
- Diagrams and charts: `python media/devpost/src/render.py system access sound-map live-activity`.
- Live counts: `python media/devpost/src/pull_live.py path/to/.env` (read-only, counts only) and `python tools/count.py`.
