# Tap In: Devpost story (paste into "About the project")

<!-- Owner: Avery. Paste everything below the line into Devpost's "About the project". Layout: standard Devpost headings,
Sponsor Notes with one section per track, prose paragraphs. No attendee counts: we don't have enough real data to quote. -->

---

## Inspiration

Boston is America's college city, and it is easy to be alone in it. You walk into a library, a lab or a hackathon room full of students, and nothing tells you which table to walk up to, so you sit alone next to a group you could have joined. Every shared space we know has the same gap: a room full of people who would help each other, and no way for a newcomer to see where they fit. Spark!'s own list of ideas includes RFID taps that trigger sounds. We built that, with one rule on top: you only join a table by tapping the same station together with someone from it, so the room itself proves people met.

## What it does

You make a profile on your phone in about 30 seconds (first name, role, skills, what you're looking for and what you're up to today, which can be "Just hanging out"), then tap any blank badge on a station and it becomes yours. From then on there is one action: tap your badge. Alone, it checks you in, and your phone shows who you already know here, which table needs you and why, and your points. Tap the same station together with someone from a table and you join it (leaving your old table): everyone in the scan is linked, everyone earns points, and a mentor who taps in counts as help. Coming back later, you log in by tapping your badge on the join page. The projector shows the room as it happens, with tables by letter, open needs and the latest activity, and every event plays a note from one pentatonic scale. A host sets up the event with a PIN on the venue Wi-Fi and can switch the room to quiet mode for study hours.

## How we built it

### Stations

Each station is an ESP32 and an RC522 reader in a box, reading through the lid. It sends the badge's UID to the server, shows the state the server returns, polls every 500 ms and rejoins Wi-Fi by itself. All logic lives on the server.

### Server

Python FastAPI on one laptop on the venue Wi-Fi. Each station has a scan window of 6 seconds that restarts on every tap, and the same badge within 3 seconds counts once. When the window closes, one database transaction decides what the scan means (check-in, new group, join, help or repeat), awards points and pushes the result over a WebSocket.

### Wall and phone

The wall is plain JavaScript on a canvas with Tone.js for sound. The phone pages are plain HTML and JavaScript with no app and no password: your badge is your identity.

### tapin.boston

The pages are static files on Vercel. Nine API routes reach the laptop through a Cloudflare tunnel: sign-up, claim, where you stand, focus, table mode and needs, plus a read-only view of the room (graph, stats and leaderboard), which the public room map refreshes every 5 seconds because Vercel doesn't carry WebSockets. Taps, stations, hosting, badge log-in and the admin page never leave the venue network.

![How Tap In fits together](https://github.com/BU-Hackathonz/TapIn/blob/main/media/devpost/system.png?raw=true)

System architecture.

## Sponsor Notes

### 🚇 Boundless Boston

Most of Boston's students work in shared rooms: libraries, dorm lounges, labs and cafés. Any of them could run Tap In with two stations at about $15 of parts each, cents per badge, a laptop and a screen. Nothing about it is specific to a hackathon.

### 🔔 Spark! Hack Our Space

#### INTERACTION IS THE INPUT

A join only counts when the newcomer and someone already at the table tap the same station within 6 seconds of each other. The scan is the proof that people met, and nobody can join a table from across the room.

#### TAPS THAT PLAY

Every tap rings a bell in your own note, every new link plucks, a table forming plays a rising run, and every 10th arrival rings a trolley bell. Staff switch the room between event mode and quiet mode.

![Tap In's sound map](https://github.com/BU-Hackathonz/TapIn/blob/main/media/devpost/sound-map.png?raw=true)

Every event and its sound, all from one pentatonic scale.

#### FOR THE SPACE'S STAFF

The wall's needs list shows what each open table is looking for and how long it has waited. Hosts set the room up with a PIN, and an admin page on the venue network can unlink a badge from a person so it can be handed to someone else, or give someone a new badge, with live status as it lands.

#### EVIDENCE

Over 31 real taps the median time from tap to reply was 259 ms. Both stations ran a 40-minute soak with no failed polls, came back on their own within about a second after the server was down for 19 seconds, and rejoined Wi-Fi about 5 seconds after the router came back.

![The host wall](https://github.com/BU-Hackathonz/TapIn/blob/main/media/devpost/host-wall.png?raw=true)

The host wall, filled with sample data from our fake server, so no real attendee is shown.

### 👨🏻‍💻 MLH

- **Tiger Data:** every raw tap goes into the `taps` hypertable and every resolved scan into `scan_events`. The wall's live chart reads `scans_per_10min`, a real-time continuous aggregate, and `scans_per_hour` is a hierarchical aggregate on top of it for the busiest-station-by-hour view. `connections` stays a regular table on purpose, because a unique index on a hypertable must include the time column and we need one row per pair of people.
- **Gemini:** when someone checks in, the wall shows their best table at once with a template line, and in the background the server asks `gemini-3.5-flash-lite` for one icebreaker under 20 words. If it answers within 2 seconds the wall swaps the line in; if not, the template stays, so Gemini can only make the wall better, never slower. The key stays on the server.

![Tap In on Tiger Data](https://github.com/BU-Hackathonz/TapIn/blob/main/media/devpost/tiger-data.png?raw=true)

Two hypertables and two continuous aggregates.

## Challenges we ran into

Taps arrive milliseconds apart, sometimes at two stations at once, so each station keeps one window whose timer restarts on every tap, and the window is removed before it resolves so a late tap starts a fresh scan instead of corrupting the old one. Getting a phone on any network to reach a laptop on a private router took a tunnel, and the tunnel's default protocol kept dropping on the venue network until we switched it to HTTP/2. We also had only 10 badges, and badge claims failed in practice at first because 30 seconds wasn't long enough to reach a station, so we doubled it and let the admin page free badges up.

## Accomplishments that we're proud of

Both stations passed soak tests, a server outage and a router unplug, and recovered on their own every time. A phone on any network can sign up at tapin.boston while names, taps and hosting stay on the venue network. And four people merged more than 115 pull requests in about 24 hours without breaking main, each working with a coding agent, all coordinating on one pinned GitHub issue.

## What we learned

Writing every JSON shape down before coding let the stations, server, wall and phone meet on the first try. Measuring beat assuming every time: the Gemini model in our plan didn't exist for our key, and timing the alternatives with our real prompt picked the one we use. And deciding what is public on purpose kept taps, hosting and the host PIN off the internet: the public site can sign people up and show the room, but nothing on it can change the room.

## What's next for Tap In

A permanent install at Spark! with stations at the entrance, the couches and the workbenches, and points tied to real perks in the lab. Signed NTAG424 badges instead of UIDs that can be cloned. Then more rooms in Boston, libraries and dorm lounges, where the same stations would work unchanged.
