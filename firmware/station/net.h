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
static volatile int lastDisconnectReason = 0;  // set by the Wi-Fi event task, printed on the next retry line

// Common ESP32 reasons: 201 = network not found (wrong SSID, 5 GHz only, router Wi-Fi off),
// 15 / 202 / 204 = handshake or auth failed (wrong password). 8 and 36 (our own leave) are never stored.
static const char* reasonName(int r) {
  switch (r) {
    case 201: return "no_ap_found";
    case 15: case 202: case 204: return "auth_failed";
    case 2: case 200: return "beacon_or_auth_timeout";
    case 0: return "none_yet";
    default: return "other";
  }
}

static void connectWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);   // returns at once; the connection finishes in the background
}

inline void netBegin() {
  WiFi.persistent(false);             // keep the Wi-Fi config in RAM, so reconnects never write flash
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);               // lower latency for taps
  WiFi.setAutoReconnect(true);        // the core rejoins by itself after most drops
  WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t info) {
    int r = info.wifi_sta_disconnected.reason;
    if (r != 8 && r != 36) lastDisconnectReason = r;  // 8 / 36 = our own disconnect before a retry; keep the real cause
  }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
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
    // Say why, so a wrong SSID (no_ssid) is told apart from a wrong password (connect_failed) at a glance.
    const char* why = st == WL_NO_SSID_AVAIL ? "no_ssid" : st == WL_CONNECT_FAILED ? "connect_failed"
                    : st == WL_DISCONNECTED ? "disconnected" : st == WL_IDLE_STATUS ? "idle" : "other";
    int r = lastDisconnectReason;
    Serial.printf("WIFI retry status=%s (%d) reason=%s (%d)\n", why, (int)st, reasonName(r), r);
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
