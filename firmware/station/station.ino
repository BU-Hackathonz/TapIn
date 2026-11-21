// Tap In station: ESP32 + RC522 reader + 5 NeoPixel LEDs.
//
// The station is dumb. It sends each badge UID to the server and lights whatever state the server says.
//   POST /api/tap          {"station_id": 1, "uid": "04A1B2C3D4E5F6"}  -> {"state", "count", "color"}
//   GET  /api/station/{id} every 500 ms                                -> same shape
//
// Rules that keep it from freezing: no delay() in loop(), every animation is computed from millis(),
// and every HTTP call times out after 800 ms. "collecting" shows the moment a card is read, before the
// server answers.
//
// Setup: copy secrets.example.h to secrets.h (it is gitignored) and fill in the Wi-Fi password.
// Set STATION_ID below to 1 (Entrance) or 2 (Table 2), then upload.
//
// Libraries (Arduino Library Manager): MFRC522 (GithubCommunity), Adafruit NeoPixel, ArduinoJson (v7).
// Board: ESP32 Dev Module.

#include <SPI.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <MFRC522.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>
#include "secrets.h"  // WIFI_SSID, WIFI_PASS, SERVER

// ---- Per-station setting ----
const int STATION_ID = 1;  // 1 = Entrance (raspberry), 2 = Table 2 (green)

// ---- Pins (see the wiring table in the README) ----
const int SS_PIN = 5;    // RC522 SDA
const int RST_PIN = 22;  // RC522 RST
const int LED_PIN = 16;  // through a 330 ohm resistor to LED 1 DIN
const int LED_COUNT = 5;
const uint8_t BRIGHTNESS = 64;  // out of 255, keeps USB power happy

// ---- Timing ----
const uint32_t POLL_MS = 500;           // station state poll
const uint32_t HTTP_TIMEOUT_MS = 800;   // POST and poll
const uint32_t SAME_CARD_MS = 3000;     // ignore the same badge held on the reader
const uint32_t WIFI_CHECK_MS = 2000;    // reconnect check
const int WIFI_FAILS_TO_OFFLINE = 3;    // failed checks before showing offline
const int HTTP_FAILS_TO_OFFLINE = 3;    // failed requests in a row before showing offline
const uint32_t READER_CHECK_MS = 10000; // re-init the RC522 if it stops answering

MFRC522 reader(SS_PIN, RST_PIN);
Adafruit_NeoPixel leds(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

enum State { IDLE, COLLECTING, CHECKED_IN, JOINED, REPEAT, CLAIM, CLAIMED, UNKNOWN, OFFLINE };

State state = IDLE;
int scanCount = 0;
uint32_t stateSince = 0;
uint8_t stationR, stationG, stationB;

String lastUid = "";
uint32_t lastUidAt = 0;
uint32_t lastPoll = 0;
uint32_t lastWifiCheck = 0;
uint32_t lastReaderCheck = 0;
int wifiFails = 0;
int httpFails = 0;

// ---------------------------------------------------------------- state

State parseState(const char* s) {
  if (!s) return IDLE;
  if (!strcmp(s, "collecting")) return COLLECTING;
  if (!strcmp(s, "checked_in")) return CHECKED_IN;
  if (!strcmp(s, "joined")) return JOINED;
  if (!strcmp(s, "repeat")) return REPEAT;
  if (!strcmp(s, "claim")) return CLAIM;
  if (!strcmp(s, "claimed")) return CLAIMED;
  if (!strcmp(s, "unknown")) return UNKNOWN;
  return IDLE;
}

void setState(State s, int count) {
  if (s != state) stateSince = millis();
  state = s;
  scanCount = count;
}

// Applies a server reply: {"state": "...", "count": n, "color": "#RRGGBB"}.
bool applyReply(const String& body) {
  JsonDocument doc;
  if (deserializeJson(doc, body)) return false;
  setState(parseState(doc["state"] | "idle"), doc["count"] | 0);
  return true;
}

void noteHttp(bool ok) {
  if (ok) {
    httpFails = 0;
    if (state == OFFLINE) setState(IDLE, 0);
  } else if (++httpFails >= HTTP_FAILS_TO_OFFLINE) {
    setState(OFFLINE, 0);
  }
}

// ---------------------------------------------------------------- network

void keepWifiAlive(uint32_t now) {
  if (now - lastWifiCheck < WIFI_CHECK_MS) return;
  lastWifiCheck = now;
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiFails) Serial.println("wifi: back");
    wifiFails = 0;
    return;
  }
  wifiFails++;
  Serial.printf("wifi: down (%d), reconnecting\n", wifiFails);
  WiFi.reconnect();
  if (wifiFails >= WIFI_FAILS_TO_OFFLINE) setState(OFFLINE, 0);
}

void postTap(const String& uid) {
  if (WiFi.status() != WL_CONNECTED) { noteHttp(false); return; }
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.begin(String(SERVER) + "/api/tap");
  http.addHeader("Content-Type", "application/json");
  String payload = String("{\"station_id\":") + STATION_ID + ",\"uid\":\"" + uid + "\"}";
  uint32_t t0 = millis();
  int code = http.POST(payload);
  String body = code > 0 ? http.getString() : "";
  http.end();
  Serial.printf("tap %s -> %d in %lu ms %s\n", uid.c_str(), code, (unsigned long)(millis() - t0), body.c_str());
  noteHttp(code == 200);
  if (code == 200) applyReply(body);
}

void pollState(uint32_t now) {
  if (now - lastPoll < POLL_MS) return;
  lastPoll = now;
  if (WiFi.status() != WL_CONNECTED) return;  // keepWifiAlive decides when that means offline
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.begin(String(SERVER) + "/api/station/" + STATION_ID);
  int code = http.GET();
  String body = code > 0 ? http.getString() : "";
  http.end();
  noteHttp(code == 200);
  if (code == 200) applyReply(body);
}

// ---------------------------------------------------------------- reader

String uidHex(const MFRC522::Uid& uid) {
  String s;
  for (byte i = 0; i < uid.size; i++) {
    if (uid.uidByte[i] < 0x10) s += "0";
    s += String(uid.uidByte[i], HEX);
  }
  s.toUpperCase();  // 04A1B2C3D4E5F6: uppercase hex, no separators
  return s;
}

void checkReader(uint32_t now) {
  if (now - lastReaderCheck < READER_CHECK_MS) return;
  lastReaderCheck = now;
  byte v = reader.PCD_ReadRegister(MFRC522::VersionReg);
  if (v == 0x00 || v == 0xFF) {
    Serial.println("reader: not answering, re-init");
    reader.PCD_Init();
  }
}

void readCardIfPresent(uint32_t now) {
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;
  String uid = uidHex(reader.uid);
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
  if (uid == lastUid && now - lastUidAt < SAME_CARD_MS) return;  // same card, same station, < 3 s
  lastUid = uid;
  lastUidAt = now;
  // Feels instant: show collecting before the server answers.
  setState(COLLECTING, state == COLLECTING ? min(scanCount + 1, LED_COUNT) : 1);
  renderLeds(millis());
  postTap(uid);
}

// ---------------------------------------------------------------- lights

uint32_t scaled(uint8_t r, uint8_t g, uint8_t b, float k) {
  return leds.Color(r * k, g * k, b * k);
}

void fillAll(uint32_t c) {
  for (int i = 0; i < LED_COUNT; i++) leds.setPixelColor(i, c);
}

float wave(uint32_t t, uint32_t periodMs) {  // 0..1..0 sine
  return 0.5f - 0.5f * cosf(2.0f * PI * (t % periodMs) / periodMs);
}

bool blink(uint32_t t, uint32_t periodMs) {
  return (t % periodMs) < periodMs / 2;
}

void renderLeds(uint32_t now) {
  uint32_t t = now - stateSince;
  switch (state) {
    case IDLE:  // station color, slow breathe
      fillAll(scaled(stationR, stationG, stationB, 0.15f + 0.85f * wave(now, 3000)));
      break;
    case COLLECTING: {  // fast pulse, one LED per badge in the scan
      float k = 0.35f + 0.65f * wave(t, 400);
      int lit = max(1, min(scanCount, LED_COUNT));
      for (int i = 0; i < LED_COUNT; i++) leds.setPixelColor(i, i < lit ? scaled(stationR, stationG, stationB, k) : 0);
      break;
    }
    case CHECKED_IN:  // station color flash
      fillAll(blink(t, 300) ? leds.Color(stationR, stationG, stationB) : 0);
      break;
    case JOINED:  // rainbow spin
      for (int i = 0; i < LED_COUNT; i++)
        leds.setPixelColor(i, leds.gamma32(leds.ColorHSV((uint16_t)(t * 60 + i * 65536L / LED_COUNT))));
      break;
    case REPEAT:  // soft flash
      fillAll(scaled(stationR, stationG, stationB, 0.1f + 0.4f * wave(t, 1000)));
      break;
    case CLAIM:  // white pulse
      fillAll(scaled(255, 255, 255, 0.1f + 0.9f * wave(now, 1200)));
      break;
    case CLAIMED:  // solid green
      fillAll(leds.Color(0, 255, 0));
      break;
    case UNKNOWN:  // red blink
      fillAll(blink(t, 300) ? leds.Color(255, 0, 0) : 0);
      break;
    case OFFLINE:  // amber blink
      fillAll(blink(now, 1000) ? leds.Color(255, 140, 0) : 0);
      break;
  }
  leds.show();
}

// ---------------------------------------------------------------- main

void setup() {
  Serial.begin(115200);
  if (STATION_ID == 2) { stationR = 92;  stationG = 200; stationB = 160; }  // Table 2 green
  else                 { stationR = 200; stationG = 92;  stationB = 132; }  // Entrance raspberry

  leds.begin();
  leds.setBrightness(BRIGHTNESS);
  leds.show();

  SPI.begin();
  reader.PCD_Init();
  Serial.printf("Tap In station %d, reader firmware 0x%02X\n", STATION_ID,
                reader.PCD_ReadRegister(MFRC522::VersionReg));

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("wifi: joining %s, server %s\n", WIFI_SSID, SERVER);
  stateSince = millis();
}

void loop() {
  uint32_t now = millis();
  keepWifiAlive(now);
  readCardIfPresent(now);
  pollState(now);
  checkReader(now);
  renderLeds(millis());
}
