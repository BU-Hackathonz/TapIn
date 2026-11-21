// Tap In station: Wi-Fi keep-alive and HTTP calls to the server.
// Nothing here blocks for long: Wi-Fi connects in the background and every request has an 800 ms timeout.
// Serial lines from here: "WIFI connecting ssid=..", "WIFI up ip=..", "WIFI down". station.ino logs the rest.
#pragma once
#include "config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

static WiFiClient netClient;          // one client, reused by every request
static int wifiFails = 0;             // consecutive failed Wi-Fi checks
static int httpFails = 0;             // consecutive failed requests made while Wi-Fi was up
static bool wifiWasUp = false;        // for the WIFI up / WIFI down lines
static unsigned long lastWifiCheck = 0;

static void connectWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);   // returns at once; the connection finishes in the background
}

inline void netBegin() {
  WiFi.persistent(false);             // keep the Wi-Fi config in RAM, so reconnects never write flash
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);               // lower latency for taps
  WiFi.setAutoReconnect(true);        // the core rejoins by itself after most drops
  Serial.printf("WIFI connecting ssid=%s\n", WIFI_SSID);
  connectWifi();
  lastWifiCheck = millis();
}

// Call from loop(). Does work only every WIFI_CHECK_MS.
inline void keepWifiAlive(unsigned long now) {
  if (now - lastWifiCheck < WIFI_CHECK_MS) return;
  lastWifiCheck = now;

  wl_status_t st = WiFi.status();
  if (st == WL_CONNECTED) {
    wifiFails = 0;
    if (!wifiWasUp) {
      wifiWasUp = true;
      Serial.printf("WIFI up ip=%s\n", WiFi.localIP().toString().c_str());
    }
    return;
  }

  wifiFails++;
  if (wifiWasUp) {
    wifiWasUp = false;
    Serial.println("WIFI down");
  }
  // Auto-reconnect keeps retrying after a drop, so step in only when it gave up (WL_CONNECT_FAILED),
  // and start over every 5th failed check (about 10 s). Never reconnect on every check: the station is
  // "not connected" until DHCP finishes, and a reconnect then would drop a join that was about to work.
  if (wifiFails % 5 == 0) {
    WiFi.disconnect();
    connectWifi();
  } else if (st == WL_CONNECT_FAILED) {
    WiFi.reconnect();
  }
}

inline bool netOffline() {
  return wifiFails >= WIFI_FAILS_OFFLINE || httpFails >= HTTP_FAILS_OFFLINE;
}

// Parses {"state": "...", "count": n, ...}. Returns false if the JSON is bad or has no state.
static bool parseReplyBody(const String& payload, StationReply& out) {
  JsonDocument doc;
  if (deserializeJson(doc, payload)) return false;
  if (!doc["state"].is<const char*>()) return false;
  out.state = parseState(doc["state"].as<const char*>());
  out.count = doc["count"] | 0;
  return true;
}

// One request to the server: a POST when body is set, else a GET. True only on HTTP 200 with a valid
// reply. While Wi-Fi is down it fails at once and is not counted (wifiFails already covers that), so a
// station that is still joining after boot does not flash offline.
static bool netRequest(const char* path, const char* body, StationReply& out) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(netClient, String(SERVER_URL) + path);
  int code;
  if (body) {
    http.addHeader("Content-Type", "application/json");
    code = http.POST(body);
  } else {
    code = http.GET();
  }
  bool ok = code == 200 && parseReplyBody(http.getString(), out);
  http.end();

  httpFails = ok ? 0 : httpFails + 1;
  return ok;
}

// POST /api/tap with {"station_id": id, "uid": "..."}.
inline bool postTap(int stationId, const char* uid, StationReply& out) {
  char body[96];
  snprintf(body, sizeof(body), "{\"station_id\":%d,\"uid\":\"%s\"}", stationId, uid);
  return netRequest("/api/tap", body, out);
}

// GET /api/station/{id}.
inline bool pollState(int stationId, StationReply& out) {
  char path[32];
  snprintf(path, sizeof(path), "/api/station/%d", stationId);
  return netRequest(path, nullptr, out);
}
