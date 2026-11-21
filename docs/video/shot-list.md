# 1-minute video: shot list

Record 7:00 to 8:00 AM Sunday. Total 60 s, sound on, captions from `captions.srt` (same timings). Film phones and the wall in landscape where possible; keep every shot steady (rest the phone on something).

Before you start:

- [ ] Wall laptop fullscreen, sound on, **Start** clicked, volume tested
- [ ] Both stations plugged in, blue light doing its idle heartbeat blip
- [ ] Two blank badges for the claim shot, plus Judge 1 and Judge 2 badges (in no group)
- [ ] A phone with the sign-up page open (real server, or FAKE mode if the server is down)
- [ ] Do not reset the database: the night's real people are the "wall filling" shot
- [ ] Get the real numbers: `python tools/count.py`

| # | Time | Length | What's on screen | How to film it | Sound |
|---|---|---|---|---|---|
| 1 | 0:00 to 0:05 | 5 s | **Problem.** A student walks into a busy room, looks around, sits alone. | Wide shot of a crowded table area, one person alone with a laptop. Can be a teammate. | Room noise, voiceover |
| 2a | 0:05 to 0:10 | 5 s | **Check-in.** Badge tap at the Entrance station; its blue light blinks fast (3 times a second). | Close-up so the station's small blue light is visible. | Tap, voiceover |
| 2b | 0:10 to 0:20 | 10 s | **Where you stand.** Phone shows "Here now", people you know, and "Table 2 needs firmware". Cut to the wall: the person glows, lines to people they know, the suggested table pulses. | Phone held still, screen recording if possible (crisper than filming the screen). Then the wall. | Wall bell, voiceover |
| 3a | 0:20 to 0:27 | 7 s | **Joining.** The person walks to Table 2 and the group taps in one after another. The station's blue light goes solid while it collects badges, then flickers fast. The wall carries the moment, so cut to it quickly. | Medium shot of the station and hands. Several people in frame proves they're together. | Taps, voiceover |
| 3b | 0:27 to 0:35 | 8 s | **The join lands.** Wall: the person moves into the Table 2 cluster, plucks play as a rising run, the leaderboard ticks up. | Film the wall straight on. **Sound on, no voiceover for 2 s** so the plucks are heard. | Pluck run |
| 4 | 0:35 to 0:50 | 15 s | **The wall filling.** The full room: clusters by table, the needs board, the stats chart. Optional: a mentor tap marks a need handled. | Slow push in on the wall, or a time-lapse of the evening if someone recorded it. | Ambient, voiceover |
| 5 | 0:50 to 1:00 | 10 s | **Architecture and close.** The architecture diagram (README), then the one-liner and tapin.boston. | Screen capture of the README diagram, then a title card. | Voiceover |

Backup if hardware dies: build shots 2 and 3 from FAKE mode on the phone (`const FAKE = true;` in the three phone pages) and from `python tools/fake_taps.py --events` on the wall. Say so on Devpost; never present fake data as real.

After recording: export 1080p, check captions match, upload so it plays without a login (YouTube unlisted works), and paste the link into Devpost.
