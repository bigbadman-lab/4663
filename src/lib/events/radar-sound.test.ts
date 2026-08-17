/**
 * Optional RADAR sound — preference, trigger boundary, and fail-soft playback.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RADAR_ALERT_LIFETIME_MS,
  applyRadarWatchlistSnapshot,
} from "@/lib/events/radar-alerts";
import {
  DEFAULT_RADAR_SOUND_ENABLED,
  DEFAULT_RADAR_SOUND_VOLUME,
  RADAR_SOUND_STORAGE_KEY,
  RADAR_SOUND_VOLUME_STORAGE_KEY,
  RADAR_SOUND_VOLUMES,
  normalizeRadarSoundVolume,
  readRadarSoundEnabled,
  readRadarSoundVolume,
  writeRadarSoundEnabled,
  writeRadarSoundVolume,
} from "@/lib/events/radar-sound-preference";
import {
  RADAR_PING_PEAK_GAIN_HIGH,
  RADAR_PING_PEAK_GAIN_LOW,
  notifyRadarSoundForNewAlerts,
  playRadarPing,
  resolveRadarPingPeakGain,
  setRadarSoundTestHooks,
} from "@/lib/events/radar-sound";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    raw: map,
  };
}

const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ID_D = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const ID_E = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const ID_G = "11111111-1111-1111-1111-111111111111";
const ID_H = "22222222-2222-2222-2222-222222222222";

const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_C = "0xcccccccccccccccccccccccccccccccccccccccc";
const TOKEN_D = "0xdddddddddddddddddddddddddddddddddddddddd";
const TOKEN_E = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const TOKEN_G = "0x1111111111111111111111111111111111111111";
const TOKEN_H = "0x2222222222222222222222222222222222222222";

function tok(eventId: string, tokenAddress: string) {
  return { eventId, tokenAddress };
}

const TOP5 = [
  tok(ID_A, TOKEN_A),
  tok(ID_B, TOKEN_B),
  tok(ID_C, TOKEN_C),
  tok(ID_D, TOKEN_D),
  tok(ID_E, TOKEN_E),
];

function seedVisible() {
  return applyRadarWatchlistSnapshot({
    previousSeen: new Set(),
    seeded: false,
    previousAlerts: [],
    tokens: TOP5,
    nowMs: 1,
    emitAlerts: true,
  });
}

describe("radar sound preference", () => {
  it("1. default sound preference is OFF", () => {
    assert.equal(DEFAULT_RADAR_SOUND_ENABLED, false);
    assert.equal(RADAR_SOUND_STORAGE_KEY, "4663:radar-sound");
    const storage = memoryStorage();
    assert.equal(readRadarSoundEnabled(storage), false);

    const hook = readSrc("src/lib/events/use-radar-sound-preference.ts");
    assert.ok(hook.includes("useSyncExternalStore"));
    assert.ok(hook.includes("getServerSnapshot"));
    assert.ok(hook.includes("DEFAULT_RADAR_SOUND_ENABLED"));
  });

  it("2. toggling ON persists to localStorage", () => {
    const storage = memoryStorage();
    writeRadarSoundEnabled(true, storage);
    assert.equal(storage.getItem(RADAR_SOUND_STORAGE_KEY), "on");
    assert.equal(readRadarSoundEnabled(storage), true);
  });

  it("3. toggling OFF persists", () => {
    const storage = memoryStorage({ [RADAR_SOUND_STORAGE_KEY]: "on" });
    writeRadarSoundEnabled(false, storage);
    assert.equal(storage.getItem(RADAR_SOUND_STORAGE_KEY), "off");
    assert.equal(readRadarSoundEnabled(storage), false);
  });
});

describe("radar sound trigger + dedupe", () => {
  it("4. new radar event + sound OFF → no playback", () => {
    const seeded = seedVisible();
    const next = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 2,
      emitAlerts: true,
    });
    assert.equal(next.newAlerts.length, 1);

    let plays = 0;
    notifyRadarSoundForNewAlerts(next.newAlerts.length, {
      enabled: false,
      visible: true,
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 0);
  });

  it("5. new radar event + sound ON → one playback", () => {
    const seeded = seedVisible();
    const next = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 2,
      emitAlerts: true,
    });
    assert.equal(next.newAlerts.length, 1);

    let plays = 0;
    notifyRadarSoundForNewAlerts(next.newAlerts.length, {
      enabled: true,
      visible: true,
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 1);
  });

  it("6. duplicate poll → no replay", () => {
    const seeded = seedVisible();
    const first = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 2,
      emitAlerts: true,
    });
    const poll = applyRadarWatchlistSnapshot({
      previousSeen: first.nextSeen,
      seeded: true,
      previousAlerts: first.alerts,
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 3,
      emitAlerts: true,
    });
    assert.equal(poll.newAlerts.length, 0);

    let plays = 0;
    notifyRadarSoundForNewAlerts(first.newAlerts.length, {
      enabled: true,
      visible: true,
      play: () => {
        plays += 1;
      },
    });
    notifyRadarSoundForNewAlerts(poll.newAlerts.length, {
      enabled: true,
      visible: true,
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 1);
  });

  it("7. duplicate Realtime wake → no replay", () => {
    const hook = readSrc("src/components/canvas/use-continuation-watchlist.ts");
    assert.ok(hook.includes("realtimeWakeIds"));
    assert.ok(hook.includes("requestWatchlistRefresh"));
    assert.equal(hook.includes("playRadarPing()"), false);
    const realtime = readSrc("src/lib/events/radar-realtime.ts");
    assert.equal(realtime.includes("playRadarPing"), false);
    assert.equal(realtime.includes("notifyRadarSoundForNewAlerts"), false);

    const seeded = seedVisible();
    const wake = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: TOP5,
      nowMs: 2,
      emitAlerts: true,
    });
    assert.equal(wake.newAlerts.length, 0);

    let plays = 0;
    notifyRadarSoundForNewAlerts(wake.newAlerts.length, {
      enabled: true,
      visible: true,
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 0);
  });

  it("8. React re-render/remount → no replay", () => {
    const object = readSrc("src/components/canvas/radar-alert-object.tsx");
    const layer = readSrc("src/components/canvas/radar-alert-layer.tsx");
    assert.equal(object.includes("playRadarPing"), false);
    assert.equal(object.includes("notifyRadarSoundForNewAlerts"), false);
    assert.equal(layer.includes("playRadarPing"), false);
    assert.equal(layer.includes("notifyRadarSoundForNewAlerts"), false);

    const hook = readSrc("src/components/canvas/use-continuation-watchlist.ts");
    assert.ok(
      hook.includes("notifyRadarSoundForNewAlerts(applied.newAlerts.length)"),
    );
    assert.ok(hook.includes("seenIds"));
  });

  it("9. initial seed → no sound", () => {
    const seeded = seedVisible();
    assert.equal(seeded.alerts.length, 0);
    assert.equal(seeded.newAlerts.length, 0);

    let plays = 0;
    notifyRadarSoundForNewAlerts(seeded.newAlerts.length, {
      enabled: true,
      visible: true,
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 0);
  });

  it("10. hidden tab → no sound", () => {
    const seeded = seedVisible();
    const hidden = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 2,
      emitAlerts: false,
    });
    assert.equal(hidden.newAlerts.length, 0);

    let plays = 0;
    notifyRadarSoundForNewAlerts(1, {
      enabled: true,
      visible: false,
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 0);

    const visible = applyRadarWatchlistSnapshot({
      previousSeen: hidden.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 50_000,
      emitAlerts: true,
    });
    assert.equal(visible.newAlerts.length, 1);
    notifyRadarSoundForNewAlerts(visible.newAlerts.length, {
      enabled: true,
      visible: true,
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 1);
  });

  it("11. two new alerts in one snapshot → one ping", () => {
    const seeded = seedVisible();
    const batch = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [
        tok(ID_G, TOKEN_G),
        tok(ID_H, TOKEN_H),
        tok(ID_A, TOKEN_A),
        tok(ID_B, TOKEN_B),
        tok(ID_C, TOKEN_C),
      ],
      nowMs: 2,
      emitAlerts: true,
    });
    assert.equal(batch.newAlerts.length, 2);

    let plays = 0;
    notifyRadarSoundForNewAlerts(batch.newAlerts.length, {
      enabled: true,
      visible: true,
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 1);
  });

  it("12. audio failure / suspended context does not break radar", () => {
    const seeded = seedVisible();
    const next = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 2,
      emitAlerts: true,
    });
    assert.equal(next.newAlerts.length, 1);
    assert.equal(next.alerts.length, 1);

    assert.doesNotThrow(() => {
      notifyRadarSoundForNewAlerts(next.newAlerts.length, {
        enabled: true,
        visible: true,
        play: () => {
          throw new Error("AudioContext suspended");
        },
      });
    });

    setRadarSoundTestHooks({
      getContext: () => ({
        state: "suspended",
        currentTime: 0,
        resume: () => Promise.reject(new Error("blocked")),
        createOscillator: () => {
          throw new Error("should not play");
        },
        createGain: () => {
          throw new Error("should not play");
        },
        destination: {} as AudioDestinationNode,
      }),
    });
    assert.doesNotThrow(() => playRadarPing());
    setRadarSoundTestHooks(null);

    assert.equal(next.alerts[0]!.eventId, ID_G);
  });

  it("13. radar lifetime remains 4 minutes", () => {
    assert.equal(RADAR_ALERT_LIFETIME_MS, 4 * 60 * 1000);
    const alerts = readSrc("src/lib/events/radar-alerts.ts");
    assert.ok(alerts.includes("RADAR_ALERT_LIFETIME_MS = 4 * 60 * 1000"));
    const sound = readSrc("src/lib/events/radar-sound.ts");
    assert.equal(sound.includes("RADAR_ALERT_LIFETIME_MS"), false);
    assert.equal(sound.includes("expiresAtMs"), false);
  });

  it("14. [ TAKE A LOOK ] behaviour remains unchanged", () => {
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    const ctaIdx = alert.indexOf("data-4663-radar-alert-open");
    assert.ok(ctaIdx > 0);
    const ctaWindow = alert.slice(ctaIdx, ctaIdx + 550);
    assert.ok(ctaWindow.includes("onOpen(alert.tokenAddress, alert.launchpad)"));
    assert.equal(ctaWindow.includes("onDismiss"), false);
    assert.equal(alert.includes("dismissRadarAlert"), false);
    assert.equal(alert.includes("playRadarPing"), false);

    const layer = readSrc("src/components/canvas/radar-alert-layer.tsx");
    assert.ok(layer.includes("onOpen={openToToken}"));
    assert.equal(layer.includes("onDismiss"), false);
  });
});

describe("radar sound wiring + audio implementation", () => {
  it("toggle lives in the RADAR panel, not on ephemeral cards", () => {
    const panel = readSrc("src/components/canvas/pons-monitoring-panel.tsx");
    assert.ok(panel.includes("RadarSoundToggle"));
    assert.ok(panel.includes("[ CLOSE ]"));

    const toggle = readSrc("src/components/canvas/radar-sound-toggle.tsx");
    assert.ok(toggle.includes("SOUND ON"));
    assert.ok(toggle.includes("SOUND OFF"));
    assert.ok(toggle.includes("VOL LOW"));
    assert.ok(toggle.includes("VOL HIGH"));
    assert.ok(toggle.includes("data-4663-radar-sound"));
    assert.ok(toggle.includes("data-4663-radar-sound-volume"));
    assert.equal(toggle.includes("playRadarPing"), false);
    assert.equal(toggle.includes("notifyRadarSoundForNewAlerts"), false);

    const object = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.equal(object.includes("RadarSoundToggle"), false);
    assert.equal(object.includes("SOUND ON"), false);
    assert.equal(object.includes("VOL LOW"), false);
    assert.equal(object.includes("VOL HIGH"), false);
  });

  it("uses native Web Audio only; no assets or third-party audio libs", () => {
    const sound = readSrc("src/lib/events/radar-sound.ts");
    assert.ok(sound.includes("AudioContext"));
    assert.ok(sound.includes("webkitAudioContext"));
    assert.ok(sound.includes("createOscillator"));
    assert.ok(sound.includes('type = "sine"'));
    assert.ok(sound.includes("0.045"));
    assert.ok(sound.includes("0.18"));
    assert.ok(sound.includes("peakGain * 0.7"));
    assert.ok(sound.includes("620"));
    assert.ok(sound.includes("880"));
    assert.equal(sound.includes(".mp3"), false);
    assert.equal(sound.includes(".wav"), false);
    assert.equal(sound.includes("howler"), false);
    assert.equal(sound.includes("from \"tone\""), false);

    const pkg = readSrc("package.json");
    assert.equal(pkg.includes("howler"), false);
    assert.equal(pkg.includes("tone\""), false);
  });

  it("unlocks audio from a user gesture; never forces autoplay on load", () => {
    const sound = readSrc("src/lib/events/radar-sound.ts");
    assert.ok(sound.includes("unlockRadarAudio"));
    assert.ok(sound.includes("armRadarAudioUnlockFromNextGesture"));
    assert.ok(sound.includes("pointerdown"));
    assert.ok(sound.includes('ctx.state === "suspended"'));

    const hook = readSrc("src/lib/events/use-radar-sound-preference.ts");
    assert.ok(hook.includes("unlockRadarAudio"));
    assert.ok(hook.includes("armRadarAudioUnlockFromNextGesture"));
    assert.equal(hook.includes("playRadarPing"), false);
    const toggleVolumeFn = hook.slice(hook.indexOf("const toggleVolume"));
    assert.ok(toggleVolumeFn.includes("commitVolume"));
    assert.equal(toggleVolumeFn.includes("unlockRadarAudio"), false);
    const commitVolumeFn = hook.slice(
      hook.indexOf("function commitVolume"),
      hook.indexOf("function hydrateFromStorage"),
    );
    assert.equal(commitVolumeFn.includes("unlockRadarAudio"), false);
    assert.equal(commitVolumeFn.includes("playRadarPing"), false);
  });
});

describe("radar sound volume", () => {
  it("1. volume defaults to LOW", () => {
    assert.equal(DEFAULT_RADAR_SOUND_VOLUME, "low");
    assert.deepEqual([...RADAR_SOUND_VOLUMES], ["low", "high"]);
    assert.equal(RADAR_SOUND_VOLUME_STORAGE_KEY, "4663:radar-sound-volume");
    assert.equal(RADAR_PING_PEAK_GAIN_LOW, 0.045);
    assert.equal(RADAR_PING_PEAK_GAIN_HIGH, 0.18);
    assert.equal(resolveRadarPingPeakGain("low"), 0.045);
    assert.equal(readRadarSoundVolume(memoryStorage()), "low");
  });

  it("2. LOW persists", () => {
    const storage = memoryStorage({
      [RADAR_SOUND_VOLUME_STORAGE_KEY]: "high",
    });
    writeRadarSoundVolume("low", storage);
    assert.equal(storage.getItem(RADAR_SOUND_VOLUME_STORAGE_KEY), "low");
    assert.equal(readRadarSoundVolume(storage), "low");
    assert.equal(
      storage.getItem(RADAR_SOUND_STORAGE_KEY),
      null,
      "must not rewrite SOUND ON/OFF",
    );
  });

  it("3. HIGH persists", () => {
    const storage = memoryStorage();
    writeRadarSoundVolume("high", storage);
    assert.equal(storage.getItem(RADAR_SOUND_VOLUME_STORAGE_KEY), "high");
    assert.equal(readRadarSoundVolume(storage), "high");
  });

  it("4. malformed stored value resolves to LOW", () => {
    assert.equal(normalizeRadarSoundVolume("HIGH"), "low");
    assert.equal(normalizeRadarSoundVolume("medium"), "low");
    assert.equal(normalizeRadarSoundVolume("true"), "low");
    assert.equal(normalizeRadarSoundVolume(1), "low");
    assert.equal(normalizeRadarSoundVolume(null), "low");
    assert.equal(
      readRadarSoundVolume(
        memoryStorage({ [RADAR_SOUND_VOLUME_STORAGE_KEY]: "loud" }),
      ),
      "low",
    );
  });

  it("5. SOUND ON + LOW new event uses 0.045", () => {
    const seeded = seedVisible();
    const next = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 2,
      emitAlerts: true,
    });
    assert.equal(next.newAlerts.length, 1);

    const gains: number[] = [];
    notifyRadarSoundForNewAlerts(next.newAlerts.length, {
      enabled: true,
      visible: true,
      volume: "low",
      play: (peakGain) => {
        gains.push(peakGain);
      },
    });
    assert.deepEqual(gains, [RADAR_PING_PEAK_GAIN_LOW]);
  });

  it("6. SOUND ON + HIGH new event uses 0.18", () => {
    const seeded = seedVisible();
    const next = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 2,
      emitAlerts: true,
    });
    assert.equal(next.newAlerts.length, 1);

    const gains: number[] = [];
    notifyRadarSoundForNewAlerts(next.newAlerts.length, {
      enabled: true,
      visible: true,
      volume: "high",
      play: (peakGain) => {
        gains.push(peakGain);
      },
    });
    assert.deepEqual(gains, [RADAR_PING_PEAK_GAIN_HIGH]);
  });

  it("7. SOUND OFF never plays regardless of volume", () => {
    let plays = 0;
    notifyRadarSoundForNewAlerts(1, {
      enabled: false,
      visible: true,
      volume: "high",
      play: () => {
        plays += 1;
      },
    });
    notifyRadarSoundForNewAlerts(1, {
      enabled: false,
      visible: true,
      volume: "low",
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 0);
  });

  it("8. changing volume does not play a ping", () => {
    let plays = 0;
    writeRadarSoundVolume("high", memoryStorage());
    writeRadarSoundVolume("low", memoryStorage());
    notifyRadarSoundForNewAlerts(0, {
      enabled: true,
      visible: true,
      volume: "high",
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 0);

    const toggle = readSrc("src/components/canvas/radar-sound-toggle.tsx");
    assert.ok(toggle.includes("toggleVolume()"));
    assert.equal(toggle.includes("playRadarPing"), false);
    const hook = readSrc("src/lib/events/use-radar-sound-preference.ts");
    const commitVolumeFn = hook.slice(
      hook.indexOf("function commitVolume"),
      hook.indexOf("function hydrateFromStorage"),
    );
    assert.equal(commitVolumeFn.includes("playRadarPing"), false);
    assert.equal(commitVolumeFn.includes("notifyRadarSoundForNewAlerts"), false);
  });

  it("9. duplicate event still does not replay", () => {
    const seeded = seedVisible();
    const first = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 2,
      emitAlerts: true,
    });
    const poll = applyRadarWatchlistSnapshot({
      previousSeen: first.nextSeen,
      seeded: true,
      previousAlerts: first.alerts,
      tokens: [tok(ID_G, TOKEN_G), ...TOP5.slice(0, 4)],
      nowMs: 3,
      emitAlerts: true,
    });
    assert.equal(poll.newAlerts.length, 0);

    let plays = 0;
    notifyRadarSoundForNewAlerts(first.newAlerts.length, {
      enabled: true,
      visible: true,
      volume: "high",
      play: () => {
        plays += 1;
      },
    });
    notifyRadarSoundForNewAlerts(poll.newAlerts.length, {
      enabled: true,
      visible: true,
      volume: "high",
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 1);
  });

  it("10. batch of multiple new alerts still produces one ping", () => {
    const seeded = seedVisible();
    const batch = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [
        tok(ID_G, TOKEN_G),
        tok(ID_H, TOKEN_H),
        tok(ID_A, TOKEN_A),
        tok(ID_B, TOKEN_B),
        tok(ID_C, TOKEN_C),
      ],
      nowMs: 2,
      emitAlerts: true,
    });
    assert.equal(batch.newAlerts.length, 2);

    const gains: number[] = [];
    notifyRadarSoundForNewAlerts(batch.newAlerts.length, {
      enabled: true,
      visible: true,
      volume: "high",
      play: (peakGain) => {
        gains.push(peakGain);
      },
    });
    assert.deepEqual(gains, [RADAR_PING_PEAK_GAIN_HIGH]);
  });

  it("11. audio failure remains fail-soft", () => {
    assert.doesNotThrow(() => {
      notifyRadarSoundForNewAlerts(1, {
        enabled: true,
        visible: true,
        volume: "high",
        play: () => {
          throw new Error("AudioContext suspended");
        },
      });
    });
  });

  it("12. existing 4-minute alert lifetime unchanged", () => {
    assert.equal(RADAR_ALERT_LIFETIME_MS, 4 * 60 * 1000);
    const hook = readSrc("src/components/canvas/use-continuation-watchlist.ts");
    assert.ok(
      hook.includes("notifyRadarSoundForNewAlerts(applied.newAlerts.length)"),
    );
    assert.equal(hook.includes("volume"), false);
  });

  it("13. [ TAKE A LOOK ] remains open-only", () => {
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(alert.includes("onOpen(alert.tokenAddress, alert.launchpad)"));
    assert.equal(alert.includes("onDismiss"), false);
    assert.equal(alert.includes("data-4663-radar-sound-volume"), false);
  });

  it("14. initial seed remains silent", () => {
    const seeded = seedVisible();
    assert.equal(seeded.newAlerts.length, 0);
    let plays = 0;
    notifyRadarSoundForNewAlerts(seeded.newAlerts.length, {
      enabled: true,
      visible: true,
      volume: "high",
      play: () => {
        plays += 1;
      },
    });
    assert.equal(plays, 0);
  });
});
