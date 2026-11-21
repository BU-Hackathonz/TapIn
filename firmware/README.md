# Tap In station firmware

The station guide for anyone flashing or debugging a station. Both stations run the same sketch in `firmware/station/`. Set `STATION_ID` to 1 (Entrance) or 2 (Table 2).

## What a station does

A station is dumb. It does three things:

1. Reads a badge UID from the RC522 reader and sends it to the server (`POST /api/tap`).
2. Polls the server every 500 ms (`GET /api/station/{id}`).
3. Lights the LEDs for whatever state the server says.

The only state a station decides on its own is `offline`, which it sets when Wi-Fi or the server stops answering. All game logic (scan windows, groups, points) lives on the server.

The sketch never calls `delay()` in `loop()`. Every LED animation is computed from `millis()`, so the reader keeps working while lights animate.

## Parts per station

- ESP32 dev board (USB powered)
- RC522 RFID reader with 3.3 V logic
- Optional: 5 addressable WS2812 / NeoPixel LEDs in a chain, plus 1 plain diode (drops the LED supply to
  about 4.2 V) and 1 resistor, 330 Ω (on the LED data line)

**What we built:** ESP32 + RC522 only, no LED strip, diode or resistor. The board's built-in blue LED
(GPIO 2) gives the feedback instead; see [Built-in LED](#built-in-led-what-we-ship). The strip wiring
below still works with no code change if someone wires it later.
- Half-size breadboard, jumper wires (F-F, M-F, M-M)
- Non-metal lid, 3 mm or thinner, white paper for a diffuser, tape

## Wiring

Per station. No buzzer.

| From | To | Notes |
| :- | :- | :- |
| RC522 SDA (NSS) | ESP32 GPIO 5 | F-F |
| RC522 SCK | ESP32 GPIO 18 | F-F |
| RC522 MOSI | ESP32 GPIO 23 | F-F |
| RC522 MISO | ESP32 GPIO 19 | F-F |
| RC522 RST | ESP32 GPIO 22 | F-F |
| RC522 3.3V | ESP32 3V3 | **Never 5 V.** |
| RC522 GND | ESP32 GND | F-F |
| ESP32 5V | Breadboard top + rail | M/F |
| ESP32 GND | Breadboard top − rail, bridged to bottom − rail | M/F, M-M |
| Diode (plain end → striped end) | Top + rail → bottom + rail | LED supply, about 4.2 V |
| ESP32 GPIO 16 | 330 Ω resistor → LED 1 DIN | M/F, resistor |
| Each LED 5V / GND | Bottom + / bottom − rail | M-M |
| LED n DOUT | LED n+1 DIN (LEDs 1 → 5) | M-M |

- GPIO 17 stays empty. It was the buzzer pin and nothing uses it now.
- LED brightness is 64 out of 255. This keeps USB power happy.
- Common ground matters. The ESP32 GND, the LED ground rail and the RC522 GND must all be connected.

## Built-in LED (what we ship)

The stations are ESP32 + RC522 only. The feedback is the ESP32 board's own small LED, a surface-mount LED
next to the red power LED near the USB port, usually labelled `IO2`, `D2` or `LED`. It has one color, so
each state is a different rhythm. It runs alongside the strip, so with a strip wired both show the state.

**Finding it:** every boot starts with **3 clear blinks** (about 1 s). If you see the red power LED but never
those 3 blinks, the board has no LED on GPIO 2. The station still works; the serial log and the wall are
then the only feedback.

| State | Blue LED |
| :- | :- |
| boot | 3 clear blinks, once |
| idle | 0.15 s blip every 3 s (it is alive) |
| collecting | Solid on |
| checked_in | 3 Hz blink |
| joined | 10 Hz flicker |
| repeat | One 0.4 s blink |
| claim | Slow 1 Hz blink |
| claimed | Solid on |
| unknown | Double blink, repeating |
| offline | Brief blink every 2 s |

GPIO 2 is the LED on ESP32-WROOM dev boards. For a board with it elsewhere, set `PIN_ONBOARD_LED` in
`config.h`; `-1` turns it off.

## Light states

What the station shows for each state the server sends. Result states last about 2 s on the server, then return to idle (or claim).

| State | LEDs | When |
| :- | :- | :- |
| `idle` | Station color, slow breathe | Nothing happening |
| `collecting` | Fast pulse, one LED lit per badge in the scan (up to 5) | A scan window is open. The station also shows this locally the moment a card is read, before the server answers. If that POST fails, it goes back to what it showed before. |
| `checked_in` | Station color flash | Scan of 1 |
| `joined` | Rainbow spin | Scan of 2+ with someone new, or a help request |
| `repeat` | Soft flash | Everyone in the scan already met |
| `claim` | White pulse | A phone sign-up is waiting for a badge |
| `claimed` | Solid green | Badge just linked to a sign-up |
| `unknown` | Red blink | Unregistered or already-owned badge |
| `offline` | Amber blink | **Set by the station itself**, never by the server. See below. |

Station colors match the wall: Entrance (station 1) is raspberry, Table 2 (station 2) is green.

### When the station shows offline

The station sets `offline` itself when either of these happens:

- Wi-Fi check fails 3 times in a row (checked every 2 s, so about 6 s).
- 3 HTTP requests in a row (tap or poll) fail or time out while Wi-Fi is up. Each request has an 800 ms timeout, so a dead server shows amber within a few seconds. Requests skipped because Wi-Fi is down do not count, so a station still joining Wi-Fi after boot does not flash amber.

While offline it keeps polling, every 2 s instead of every 500 ms, and the first good answer turns it back to normal. You do not need to reboot it. Wi-Fi rejoins on its own (the ESP32 core's auto-reconnect); the sketch starts the join over every 10 s if it is still down.

## Badges and debounce

A badge is read once per tap. The same badge again within 3 s is ignored, and every new sighting restarts that 3 s. After each read the badge is halted so a second badge can still be read while the first one lies on the lid. Every 250 ms the reader also checks whether a halted badge is still there and refreshes it, so a badge held on the lid for 10 s, or left lying there, still counts once. The server has its own 3 s debounce on top.

## First-time setup

The Wi-Fi password is not in git. Each laptop or station needs its own local copy.

1. Copy `firmware/station/secrets.example.h` to `firmware/station/secrets.h`.
2. Edit `secrets.h` with the router's 2.4 GHz SSID and password. The team's GL.iNet router broadcasts **`cmap`** on 2.4 GHz (and `cmap5g` on 5 GHz), not "TapIn" as the Playbook says. Use `cmap`.
3. Leave it alone in git. `secrets.h` is git-ignored, and so is `build/`.

`config.h` includes `secrets.h`, so the sketch will not compile without it.

Other settings live in `firmware/station/config.h`: server URL, pins, timings, and `STATION_ID`. To point a station somewhere else (the mock server on your laptop), add `#define SERVER_URL "http://<laptop IP>:8000"` to your `secrets.h` instead of editing `config.h`, so a laptop IP never gets committed. Remove it again before flashing for the real server.

## Required libraries

Install once. These are the versions the sketch was compiled with (arduino-cli 1.4.1):

```
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32@4.0.0
arduino-cli lib install MFRC522@1.4.12 "Adafruit NeoPixel@1.15.5" ArduinoJson@7.4.3
```

WiFi and HTTPClient come with the core.

## Build and flash

Find the ports with `arduino-cli board list` (or `uv run --no-project --with pyserial python firmware/serial_monitor.py --list`). Each station shows up as a "Silicon Labs CP210x" COM port. `arduino-cli upload` cannot take build flags, so compile and upload in one command with `-u -p`.

Station 1 (Entrance). `STATION_ID` defaults to 1 in `config.h`:

```
arduino-cli compile --fqbn esp32:esp32:esp32 --build-path firmware/build/station1 -u -p COMx firmware/station
```

Station 2 (Table 2), the same sketch with the ID as a compiler flag:

```
arduino-cli compile --fqbn esp32:esp32:esp32 --build-path firmware/build/station2 --build-property "compiler.cpp.extra_flags=-DSTATION_ID=2" -u -p COMy firmware/station
```

Replace `COMx` and `COMy` with each station's port. The separate `--build-path`s (git-ignored) keep the two builds from overwriting each other.

Do not use `--build-property "build.extra_flags=-DSTATION_ID=2"`, even though arduino-cli's own help suggests it. On the ESP32 core that property also holds `-DESP32=ESP32` and the other core flags, so overriding it fails with `Adafruit_NeoPixel.cpp: #error Architecture not supported`. `compiler.cpp.extra_flags` is empty by default and safe to set.

After flashing, the first serial lines must read `BOOT station=2` (or 1) and `READER version=0x92` (0x91, 0x88 or 0x12 are fine too; 0x00 or 0xFF is not).

## Testing order

Do these in order. Don't skip ahead.

1. **Mock server.** On the laptop: `uv run --no-project --with fastapi --with uvicorn python firmware/mock_server.py`. Put the laptop's IP in `secrets.h` as `SERVER_URL` (see First-time setup) and flash. A window counts distinct badges, closes 6 s after the last tap, then shows `checked_in` (1 badge) or `joined` (2+) for 2 s. Force any state with `curl -X POST <laptop>:8000/mock/state -H "content-type: application/json" -d '{"station_id":1,"state":"repeat","count":2}'` (`"state":"auto"` clears it), or run with `--cycle 3` to step every station through all 8 server states. Check that every state's LEDs look right and that the reader still reads during every animation.
2. **Real server.** Remove `SERVER_URL` from `secrets.h` and flash again, so the station uses `http://192.168.8.100:8000`. The server laptop must be running `uvicorn server.main:app --host 0.0.0.0 --port 8000`. Check that one real tap goes station → server → wall.
3. **Wi-Fi recovery.** Unplug the router for 10 s. The station goes amber, then recovers by itself when the router comes back.
4. **Both stations.** Power both at once. Tap each one. Check there is no crosstalk: a tap at one station must light only that station.

## Serial log

Open the port at 115200 baud, or use `firmware/serial_monitor.py`, which parses these exact lines (the format is also in the header of `station/station.ino`):

```
BOOT station=1
READER version=0x92
WIFI connecting ssid=cmap
STATE idle count=0
WIFI retry status=disconnected (6) reason=auth_failed (15)   (every ~10 s while it cannot join)
WIFI up ip=192.168.8.45
TAP uid=04A1B2C3D4E5F6
STATE collecting count=1
POST ok ms=84 state=collecting count=1
STATE checked_in count=0
POST fail ms=801
WIFI down
OFFLINE
STATE offline count=0
ONLINE
READER reinit version=0x92
```

`ms` is the POST round trip. It should be under 300 ms on the real server. `READER reinit` means the reader stopped answering on SPI and the sketch re-initialized it; if that repeats, check the wiring.

`firmware/serial_monitor.py` helps with two things:

- `--list` shows the serial ports so you can find each station's COM port.
- Several ports at once with `--minutes 30` is the soak test: it logs both stations with timestamps, flags reboots, crashes, offline periods, slow and failed POSTs, and prints PASS or FAIL per station. It opens the ports without resetting the ESP32s, so start it with both stations already running; a `BOOT` line after that counts as a reboot.

```
uv run --no-project --with pyserial python firmware/serial_monitor.py COM5 COM7 --minutes 30 --log firmware/build/soak.log
```

## Done means

All of these must be true before the stations are boxed:

- [ ] 20 out of 20 taps read through the lid (reader taped under the lid, antenna up). Count them with
      `uv run --no-project --with pyserial python firmware/read_test.py COM5 COM7`: tap each lid 20 times,
      about 3 s apart; it prints reads per station and PASS/FAIL.
- [ ] Every light state from the table shows on the real server or the mock.
- [ ] Reader keeps reading during every LED animation.
- [ ] Unplug the router for 10 s: station shows offline, then recovers with no reboot.
- [x] Both stations at once, no crosstalk. (2026-11-21: the same badge on both, handled separately.)
- [x] 30-minute soak with both stations: no reboot, no stuck offline state. (2026-11-21: both PASS, 0 reboots, 0 offline.)
- [ ] Tug test on the USB cable: moving the cable moves nothing inside the box.

The soak summary also shows each station's signal (`rssi`, in dBm; -40 to -48 measured, anything above
-67 is good) and poll latency from the `LINK` lines. About 200 ms per request is normal for these boards.

## Enclosure

- Reader taped flat under the lid, antenna facing up. Lid is non-metal and 3 mm or thinner. Metal blocks the RFID field.
- Breadboard and ESP32 taped to the floor of the box. LEDs face up toward the lid.
- White paper over the lid as a diffuser, printed with "Tap in" and the station name ("Entrance" or "Table 2").
- USB cable comes out through a notch. Tape it down inside so a tug moves nothing.

## Troubleshooting

**No reads (taps never reach the serial log).**
- Measure 3.3 V at the RC522 3V3 pin. Never 5 V.
- Check the SPI wires against the table: SDA → GPIO 5, SCK → 18, MOSI → 23, MISO → 19, RST → 22. A swapped MOSI and MISO is the usual cause.
- Check the `READER version=0x..` line at boot. `0x00` or `0xFF` means the reader is not talking over SPI. Re-seat the wires, then reset.
- Hold the badge flat against the reader for a second. Some badges need a moment.

**Amber (offline) forever.**
- Check `secrets.h`: SSID (`cmap`) and password must match the router exactly. Recompile after editing.
- The router must be 2.4 GHz. The ESP32 cannot join a 5 GHz-only network.
- No `WIFI up` line: read the `WIFI retry ... reason=` line. `no_ap_found (201)` means no network has that SSID on 2.4 GHz (a wrong name, the router's Wi-Fi is off, or it is 5 GHz only). `auth_failed (15/202/204)` means the SSID was found but the password is wrong (the router admin password is not the Wi-Fi password). `WIFI up` but still amber: the server. Check `secrets.h` has no leftover `SERVER_URL` from mock testing, the server IP in `config.h` is `192.168.8.100`, and the server laptop still has that reserved IP.
- Check the firewall on the server laptop allows port 8000. Test from a phone on TapIn: open `http://192.168.8.100:8000` in a browser.

**LEDs flicker or show the wrong colors.**
- Lower brightness in `config.h` (`LED_BRIGHTNESS`) if the flicker is from power sag.
- Check the diode is in the LED supply line, plain end toward the top rail, striped end toward the bottom rail.
- Check the common ground: ESP32 GND, LED ground rail and RC522 GND must all be connected.
- Check the 330 Ω resistor sits on the data line into LED 1 DIN.

**Station reboots during a soak test.**
- Usually a USB power problem. Try a different cable or USB port, or a powered hub.
- Check the LED count and brightness. Five LEDs at 64 is the budget.
