// Tap In station firmware. One sketch for both stations:
// set STATION_ID in config.h, or build with -DSTATION_ID=2 (see firmware/README.md).
// Never call delay() from loop(): every animation runs from millis().
//
// Serial log at 115200 baud, one line per event. firmware/serial_monitor.py parses these exact prefixes:
//   BOOT station=1               READER version=0x92        READER reinit version=0x92
//   WIFI connecting ssid=TapIn   WIFI up ip=192.168.8.45    WIFI down
//   TAP uid=04A1B2C3D4E5F6       POST ok ms=84 state=collecting count=1    POST fail ms=801
//   STATE collecting count=1     OFFLINE                    ONLINE
#include "config.h"
#include "leds.h"
#include "reader.h"
#include "net.h"

static StationReply cur = {ST_IDLE, 0};   // last state from the server, or the local one after a tap
static unsigned long lastPoll = 0;        // millis() when the last poll finished
static bool wasOffline = false;
static bool shownValid = false;
static StationState lastShown = ST_IDLE;
static int lastCount = 0;

// Works out what the LEDs should show and only touches the LEDs and Serial on change.
static void showState(unsigned long now) {
  bool off = netOffline();
  if (off != wasOffline) {
    Serial.println(off ? "OFFLINE" : "ONLINE");
    wasOffline = off;
  }
  StationState s = off ? ST_OFFLINE : cur.state;
  int count = off ? 0 : cur.count;
  if (shownValid && s == lastShown && count == lastCount) return;
  shownValid = true;
  lastShown = s;
  lastCount = count;
  Serial.printf("STATE %s count=%d\n", stateName(s), count);
  ledsSetState(s, count, now);
}

static void onTap(const char* uid) {
  Serial.printf("TAP uid=%s\n", uid);
  // Local feedback first: light collecting now, before the POST goes out, so the tap feels instant.
  StationReply before = cur;
  cur = StationReply{ST_COLLECTING, (cur.state == ST_COLLECTING ? cur.count : 0) + 1};
  showState(millis());
  renderLeds(millis());

  StationReply r;
  unsigned long t0 = millis();
  bool ok = postTap(STATION_ID, uid, r);
  unsigned long ms = millis() - t0;
  if (ok) {
    cur = r;
    Serial.printf("POST ok ms=%lu state=%s count=%d\n", ms, stateName(r.state), r.count);
  } else {
    cur = before;   // the server never got this tap, so stop showing it as collecting
    Serial.printf("POST fail ms=%lu\n", ms);
  }
  showState(millis());
}

void setup() {
  Serial.begin(115200);
  Serial.printf("BOOT station=%d\n", STATION_ID);
  ledsBegin();
  readerBegin();
  netBegin();
}

void loop() {
  keepWifiAlive(millis());

  char uid[24];
  if (readCardIfPresent(uid, sizeof(uid))) onTap(uid);

  // Keep polling while offline, since a good poll is how the station notices the server is back,
  // only slower. The gap starts when the last poll finished, so even an 800 ms timeout leaves the
  // reader and the LEDs a full gap to run before the next poll.
  if (millis() - lastPoll >= (netOffline() ? OFFLINE_POLL_MS : POLL_MS)) {
    StationReply r;
    if (pollState(STATION_ID, r)) cur = r;
    lastPoll = millis();
  }

  unsigned long now = millis();
  showState(now);
  renderLeds(now);
}
