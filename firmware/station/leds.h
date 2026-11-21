// Tap In station LEDs: 5 NeoPixels plus the board's built-in LED as a fallback, every frame computed from millis(). Never calls delay().
#pragma once
#include <Adafruit_NeoPixel.h>
#include "config.h"

static Adafruit_NeoPixel strip(NUM_LEDS, PIN_LEDS, NEO_GRB + NEO_KHZ800);

static StationState ledState = ST_IDLE;
static int ledCount = 0;
static unsigned long ledStart = 0;      // millis() when the current state was entered
static unsigned long ledLastShow = 0;   // millis() of the last strip.show()
static bool ledDirty = true;            // a state or count change: draw the next frame at once
static const unsigned long LED_FRAME_MS = 20;

// Scale an RGB color by level (0 = off, 255 = full).
static uint32_t scaleColor(uint8_t r, uint8_t g, uint8_t b, uint8_t level) {
  return strip.Color(r * level / 255, g * level / 255, b * level / 255);
}

// Triangle wave 0..255 over `period` ms. Cheap stand-in for a sine. Period must be even.
static uint8_t triangle(unsigned long t, unsigned long period) {
  unsigned long p = t % period;
  unsigned long half = period / 2;
  unsigned long v = (p < half) ? p * 255 / half : (period - p) * 255 / half;
  return (uint8_t)(v > 255 ? 255 : v);
}

// Square wave: on for the first half of each period.
static bool blinkOn(unsigned long t, unsigned long period) {
  return (t % period) < period / 2;
}

static void fillAll(uint32_t c) {
  for (int i = 0; i < NUM_LEDS; i++) strip.setPixelColor(i, c);
}

// The board's built-in LED: one color, so each state gets its own rhythm. Written only when it changes.
static int onboardLast = -1;
static void onboardLed(bool on) {
  if (PIN_ONBOARD_LED < 0 || (int)on == onboardLast) return;
  onboardLast = on;
  digitalWrite(PIN_ONBOARD_LED, on ? HIGH : LOW);
}

// t = ms since the state started. Rhythms are picked to be told apart without color.
static bool onboardPattern(StationState s, unsigned long t) {
  switch (s) {
    case ST_IDLE:       return t % 3000 < 150;                // heartbeat blip every 3 s: alive
    case ST_COLLECTING: return true;                          // solid: badge read, window open
    case ST_CHECKED_IN: return blinkOn(t, 333);               // 3 Hz blink
    case ST_JOINED:     return blinkOn(t, 100);               // 10 Hz flicker: the big moment
    case ST_REPEAT:     return t < 400;                       // one soft 0.4 s blink
    case ST_CLAIM:      return blinkOn(t, 1000);              // slow 1 Hz: waiting for a badge
    case ST_CLAIMED:    return true;                          // solid after the slow claim blink
    case ST_UNKNOWN: {  unsigned long p = t % 1000;           // double blink, repeating
                        return p < 100 || (p >= 200 && p < 300); }
    case ST_OFFLINE:    return t % 2000 < 150;                // brief blink every 2 s: no Wi-Fi / server
  }
  return false;
}

void ledsBegin() {
  if (PIN_ONBOARD_LED >= 0) {
    pinMode(PIN_ONBOARD_LED, OUTPUT);
    // Hello at boot: 3 clear blinks (about 1 s) so you can find the LED and see the board started.
    // delay() is fine here: this runs once from setup(), before loop() and before any tap can arrive.
    for (int i = 0; i < 3; i++) {
      digitalWrite(PIN_ONBOARD_LED, HIGH); delay(180);
      digitalWrite(PIN_ONBOARD_LED, LOW);  delay(180);
    }
    onboardLed(false);
  }
  strip.begin();
  strip.setBrightness(LED_BRIGHTNESS);
  strip.clear();
  strip.show();
}

// Called from the poll and tap paths. Restarts the animation only when the state changes,
// so repeated polls of the same state do not reset it. A count change just updates the LEDs.
void ledsSetState(StationState s, int count, unsigned long now) {
  if (s != ledState) {
    ledState = s;
    ledStart = now;
  }
  ledCount = count;
  ledDirty = true;
}

// Draws one frame from the clock. Call it from loop() with millis(); after ledsSetState() the next
// call draws at once, so the tap path can show collecting before its POST goes out.
void renderLeds(unsigned long now) {
  if (!ledDirty && now - ledLastShow < LED_FRAME_MS) return;   // about 50 fps is plenty
  ledDirty = false;
  ledLastShow = now;

  unsigned long t = now - ledStart;
  onboardLed(onboardPattern(ledState, t));

  switch (ledState) {
    case ST_IDLE: {
      // 3 s breathe between about 16% and 100%, never fully dark.
      uint8_t level = 40 + triangle(t, 3000) * 215 / 255;
      fillAll(scaleColor(STATION_R, STATION_G, STATION_B, level));
      break;
    }
    case ST_COLLECTING: {
      // Fast 4 Hz pulse on the first ledCount LEDs. It starts at full brightness (the tap shows at
      // once) and never goes dark, so the count stays readable. Counts above NUM_LEDS light all five.
      uint8_t level = 255 - triangle(t, 250) * 175 / 255;
      uint32_t c = scaleColor(STATION_R, STATION_G, STATION_B, level);
      for (int i = 0; i < NUM_LEDS; i++) strip.setPixelColor(i, i < ledCount ? c : 0);
      break;
    }
    case ST_CHECKED_IN: {
      // Hard flash of the station color, about 3 Hz.
      fillAll(blinkOn(t, 333) ? strip.Color(STATION_R, STATION_G, STATION_B) : 0);
      break;
    }
    case ST_JOINED: {
      // Rainbow spin: one full turn every 1.5 s, LEDs spread evenly around the hue wheel.
      uint32_t base = (t % 1500) * 65536UL / 1500;
      for (int i = 0; i < NUM_LEDS; i++) {
        uint16_t hue = (uint16_t)(base + i * 65536UL / NUM_LEDS);
        strip.setPixelColor(i, strip.ColorHSV(hue, 255, 255));
      }
      break;
    }
    case ST_REPEAT: {
      // Soft, low-amplitude dim pulse of the station color, about 1.5 Hz.
      uint8_t level = 50 + triangle(t, 666) * 100 / 255;
      fillAll(scaleColor(STATION_R, STATION_G, STATION_B, level));
      break;
    }
    case ST_CLAIM: {
      // White pulse on every LED, 1 s period, never fully dark.
      uint8_t level = 30 + triangle(t, 1000) * 225 / 255;
      fillAll(scaleColor(255, 255, 255, level));
      break;
    }
    case ST_CLAIMED: {
      fillAll(strip.Color(0, 255, 0));
      break;
    }
    case ST_UNKNOWN: {
      // Red blink, about 4 Hz.
      fillAll(blinkOn(t, 250) ? strip.Color(255, 0, 0) : 0);
      break;
    }
    case ST_OFFLINE: {
      // Amber blink (255,140,0), about 1 Hz.
      fillAll(blinkOn(t, 1000) ? strip.Color(255, 140, 0) : 0);
      break;
    }
  }

  strip.show();
}
