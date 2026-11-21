// RC522 badge reader: reads UIDs through the lid and returns only new taps.
// Serial lines from here: "READER version=0x92" at boot, "READER reinit version=0x.." after a self-heal.
#pragma once
#include <SPI.h>
#include <MFRC522.h>
#include "config.h"

static MFRC522 mfrc(PIN_RC522_SS, PIN_RC522_RST);

// Debounce ring: the last few UIDs and when each was last seen, so two badges alternating are each deduped.
static const int RECENT_UIDS = 8;
static const int UID_TEXT_MAX = 21;               // 10 bytes max = 20 hex chars + NUL
static const unsigned long HEAL_MS = 5000;        // how often to check that the chip still answers
static const unsigned long HELD_CHECK_MS = 250;   // how often to look for a badge still lying on the reader
struct RecentUid {
  char uid[UID_TEXT_MAX];
  unsigned long lastSeen;
  bool used;
};
static RecentUid recentUids[RECENT_UIDS];
static unsigned long lastHealMs = 0;
static unsigned long lastHeldCheck = 0;
static bool cardMayBeHeld = false;   // a badge was read and may still be on the reader
static int wakeMisses = 0;           // presence checks in a row that found no card

static byte readerVersion() {
  return mfrc.PCD_ReadRegister(mfrc.VersionReg);
}

// Init the chip and set max antenna gain so badges read through a 3 mm lid.
static void readerInitChip() {
  mfrc.PCD_Init();
  mfrc.PCD_SetAntennaGain(mfrc.RxGain_max);
}

static void readerBegin() {
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_RC522_SS);
  readerInitChip();
  lastHealMs = millis();
  Serial.printf("READER version=0x%02X\n", readerVersion());   // 0x00 or 0xFF: the RC522 is not answering on SPI
}

// Every HEAL_MS, read the version register. 0x00 or 0xFF means the chip glitched, so re-init it.
// PCD_Init blocks for 50 to 150 ms, which only happens while the reader is not answering anyway.
static void readerSelfHeal(unsigned long now) {
  if (now - lastHealMs < HEAL_MS) return;
  lastHealMs = now;
  byte version = readerVersion();
  if (version == 0x00 || version == 0xFF) {
    readerInitChip();
    Serial.printf("READER reinit version=0x%02X\n", readerVersion());
  }
}

static RecentUid* readerFind(const char* uid) {
  for (int i = 0; i < RECENT_UIDS; i++) {
    if (recentUids[i].used && strcmp(recentUids[i].uid, uid) == 0) return &recentUids[i];
  }
  return nullptr;
}

// Remember a new UID in a free slot, or in place of the one seen longest ago. A badge that keeps
// being refreshed (held on the reader) is therefore never pushed out.
static void readerRemember(const char* uid, unsigned long now) {
  RecentUid* slot = &recentUids[0];
  for (int i = 0; i < RECENT_UIDS; i++) {
    RecentUid& e = recentUids[i];
    if (!e.used) {
      slot = &e;
      break;
    }
    if (now - e.lastSeen > now - slot->lastSeen) slot = &e;
  }
  strlcpy(slot->uid, uid, sizeof(slot->uid));
  slot->lastSeen = now;
  slot->used = true;
}

// True for a new tap. A UID seen within DEDUPE_MS of its last sighting is a repeat, and every
// sighting refreshes lastSeen, so a badge that keeps re-reading stays one tap.
static bool readerIsNewTap(const char* uid, unsigned long now) {
  RecentUid* e = readerFind(uid);
  if (!e) {
    readerRemember(uid, now);
    return true;
  }
  bool fresh = (now - e->lastSeen) >= DEDUPE_MS;
  e->lastSeen = now;
  return fresh;
}

// Like PICC_IsNewCardPresent(), but with WUPA, which also wakes the badges we halted.
static bool readerAnyCardInField() {
  byte atqa[2];
  byte size = sizeof(atqa);
  mfrc.PCD_WriteRegister(mfrc.TxModeReg, 0x00);
  mfrc.PCD_WriteRegister(mfrc.RxModeReg, 0x00);
  mfrc.PCD_WriteRegister(mfrc.ModWidthReg, 0x26);
  MFRC522::StatusCode r = mfrc.PICC_WakeupA(atqa, &size);
  return r == MFRC522::STATUS_OK || r == MFRC522::STATUS_COLLISION;
}

// Call from loop(). Returns true only for a NEW tap; uidOut gets uppercase hex, no separators.
// Every badge is halted after a read, so a held badge stays quiet and the next badge can still be
// read. While a badge may still be on the reader, a presence check every HELD_CHECK_MS wakes it and
// refreshes its debounce time, so a badge held for 10 s (or left on the lid) never counts twice.
static bool readCardIfPresent(char* uidOut, size_t len) {
  unsigned long now = millis();
  readerSelfHeal(now);

  bool presenceCheck = false;
  if (!mfrc.PICC_IsNewCardPresent()) {
    if (!cardMayBeHeld || now - lastHeldCheck < HELD_CHECK_MS) return false;
    lastHeldCheck = now;
    if (!readerAnyCardInField()) {
      if (++wakeMisses >= 2) cardMayBeHeld = false;   // two empty checks in a row: nothing on the reader
      return false;
    }
    presenceCheck = true;
  }
  if (!mfrc.PICC_ReadCardSerial()) return false;

  byte n = mfrc.uid.size;
  bool fits = (size_t)(n * 2 + 1) <= len && n * 2 + 1 <= UID_TEXT_MAX;
  if (fits) {
    for (byte i = 0; i < n; i++) {
      snprintf(&uidOut[i * 2], 3, "%02X", mfrc.uid.uidByte[i]);
    }
    uidOut[n * 2] = '\0';
  }

  // Halt the card so it stays silent on the next REQA (a held card then reads only once).
  mfrc.PICC_HaltA();
  mfrc.PCD_StopCrypto1();
  cardMayBeHeld = true;
  wakeMisses = 0;
  lastHeldCheck = now;
  if (!fits) return false;

  if (presenceCheck) {
    // A badge we already know, still on the reader: refresh it, it is not a new tap.
    RecentUid* e = readerFind(uidOut);
    if (e) {
      e->lastSeen = now;
      return false;
    }
  }
  return readerIsNewTap(uidOut, now);
}
