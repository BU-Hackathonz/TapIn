// Tap In station: shared config and types. Every other header includes this.
// One sketch for both stations: set STATION_ID here, or build with -DSTATION_ID=2.
#pragma once
#include <Arduino.h>

#ifndef STATION_ID
#define STATION_ID 1                       // 1 = Entrance, 2 = Table 2
#endif

#include "secrets.h"                      // WIFI_SSID, WIFI_PASS (copy secrets.example.h; never commit secrets.h)

// The real server. To test against firmware/mock_server.py, define SERVER_URL in your secrets.h instead
// of editing this line, so a laptop IP never gets committed.
#ifndef SERVER_URL
#define SERVER_URL "http://192.168.8.100:8000"
#endif

// Wiring (Playbook: Avery, Wiring). RC522 on VSPI, LEDs on GPIO 16. GPIO 17 stays empty.
#define PIN_RC522_SS   5
#define PIN_RC522_RST  22
#define PIN_SCK        18
#define PIN_MISO       19
#define PIN_MOSI       23
#define PIN_LEDS       16
#define NUM_LEDS       5
#define LED_BRIGHTNESS 64                  // out of 255, keeps USB power happy

// Timing
#define HTTP_TIMEOUT_MS   800              // POST and poll; a slow server must never stall reading
#define POLL_MS           500              // GET /api/station/{id}
#define OFFLINE_POLL_MS   2000             // slower poll while offline: a dead server costs up to 800 ms a try
#define WIFI_CHECK_MS     2000             // keepWifiAlive cadence
#define WIFI_FAILS_OFFLINE 3               // failed checks before showing offline
#define HTTP_FAILS_OFFLINE 3               // consecutive failed requests before showing offline
#define DEDUPE_MS         3000             // same UID within 3 s is ignored

// Station colors match the wall's v5 colors: Entrance raspberry, Table 2 green.
#if STATION_ID == 1
#define STATION_R 200
#define STATION_G 92
#define STATION_B 132
#else
#define STATION_R 92
#define STATION_G 200
#define STATION_B 160
#endif

// The 9 states from the contract. ST_OFFLINE is only ever set by the station itself.
enum StationState {
  ST_IDLE, ST_COLLECTING, ST_CHECKED_IN, ST_JOINED, ST_REPEAT,
  ST_CLAIM, ST_CLAIMED, ST_UNKNOWN, ST_OFFLINE
};

struct StationReply {
  StationState state;
  int count;
};

// Contract strings: idle collecting checked_in joined repeat claim claimed unknown offline.
inline StationState parseState(const char* s) {
  if (!s) return ST_IDLE;
  if (!strcmp(s, "collecting")) return ST_COLLECTING;
  if (!strcmp(s, "checked_in")) return ST_CHECKED_IN;
  if (!strcmp(s, "joined"))     return ST_JOINED;
  if (!strcmp(s, "repeat"))     return ST_REPEAT;
  if (!strcmp(s, "claim"))      return ST_CLAIM;
  if (!strcmp(s, "claimed"))    return ST_CLAIMED;
  if (!strcmp(s, "unknown"))    return ST_UNKNOWN;
  if (!strcmp(s, "offline"))    return ST_OFFLINE;
  return ST_IDLE;
}

inline const char* stateName(StationState s) {
  static const char* names[] = {"idle", "collecting", "checked_in", "joined", "repeat",
                                "claim", "claimed", "unknown", "offline"};
  return names[s];
}
