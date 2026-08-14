/**
 * Live RADAR alert poll-diff — visible tokens[] membership + viewport spawn.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RADAR_ALERT_LIFETIME_MS,
  applyRadarWatchlistSnapshot,
  diffRadarVisibleTokens,
  pruneExpiredRadarAlerts,
  radarAlertFallbackWorldPct,
  radarAlertSlotForEventId,
  radarAlertSpawnWorldPct,
  radarAlertViewportSafeBand,
} from "@/lib/events/radar-alerts";
import {
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
  homePctToWorldPct,
  visibleWorldSize,
  type CanvasCamera,
  type ViewportRect,
} from "@/lib/canvas/world-camera";

const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ID_D = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const ID_E = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const ID_F = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const ID_G = "11111111-1111-1111-1111-111111111111";
const ID_H = "22222222-2222-2222-2222-222222222222";

const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_C = "0xcccccccccccccccccccccccccccccccccccccccc";
const TOKEN_D = "0xdddddddddddddddddddddddddddddddddddddddd";
const TOKEN_E = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const TOKEN_F = "0xffffffffffffffffffffffffffffffffffffffff";
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

function worldPctToPoint(pct: { leftPct: number; topPct: number }) {
  return {
    x: (pct.leftPct / 100) * WORLD_WIDTH_PX,
    y: (pct.topPct / 100) * WORLD_HEIGHT_PX,
  };
}

function assertInsideVisibleWorld(
  pct: { leftPct: number; topPct: number },
  camera: CanvasCamera,
  viewport: ViewportRect,
  padFrac = 0.02,
) {
  const { width, height } = visibleWorldSize(
    viewport.width,
    viewport.height,
    camera.scale,
  );
  const point = worldPctToPoint(pct);
  const padX = width * padFrac;
  const padY = height * padFrac;
  assert.ok(point.x >= camera.x - padX, `x ${point.x} >= cam ${camera.x}`);
  assert.ok(
    point.x <= camera.x + width + padX,
    `x ${point.x} <= cam+w ${camera.x + width}`,
  );
  assert.ok(point.y >= camera.y - padY, `y ${point.y} >= cam ${camera.y}`);
  assert.ok(
    point.y <= camera.y + height + padY,
    `y ${point.y} <= cam+h ${camera.y + height}`,
  );
}

describe("radar alert detection (visible tokens[] membership)", () => {
  it("initial seed of tokens produces no alerts", () => {
    const result = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: TOP5,
      nowMs: 1_000_000,
    });
    assert.equal(result.seeded, true);
    assert.equal(result.newAlerts.length, 0);
    for (const t of TOP5) assert.ok(result.nextSeen.has(t.eventId));
  });

  it("new token entering visible RADAR produces exactly one alert", () => {
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: TOP5,
      nowMs: 1_000_000,
    });

    const next = [
      tok(ID_G, TOKEN_G),
      tok(ID_A, TOKEN_A),
      tok(ID_B, TOKEN_B),
      tok(ID_C, TOKEN_C),
      tok(ID_D, TOKEN_D),
    ];
    const first = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: next,
      nowMs: 1_100_000,
    });
    assert.equal(first.newAlerts.length, 1);
    assert.equal(first.newAlerts[0]!.eventId, ID_G);
    assert.equal(first.newAlerts[0]!.tokenAddress, TOKEN_G);
    assert.equal(
      first.newAlerts[0]!.expiresAtMs,
      1_100_000 + RADAR_ALERT_LIFETIME_MS,
    );
    assert.ok(first.nextSeen.has(ID_E), "E remains seen after leaving top-5");
  });

  it("same subsequent response does not duplicate", () => {
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: TOP5,
      nowMs: 1,
    });
    const withG = [
      tok(ID_G, TOKEN_G),
      tok(ID_A, TOKEN_A),
      tok(ID_B, TOKEN_B),
      tok(ID_C, TOKEN_C),
      tok(ID_D, TOKEN_D),
    ];
    const first = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: withG,
      nowMs: 2,
    });
    const repeat = diffRadarVisibleTokens({
      previousSeen: first.nextSeen,
      seeded: true,
      tokens: withG,
      nowMs: 3,
    });
    assert.equal(first.newAlerts.length, 1);
    assert.equal(repeat.newAlerts.length, 0);
  });

  it("reorder of same membership produces no alert", () => {
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: TOP5,
      nowMs: 1,
    });
    const reordered = [
      tok(ID_B, TOKEN_B),
      tok(ID_A, TOKEN_A),
      tok(ID_C, TOKEN_C),
      tok(ID_D, TOKEN_D),
      tok(ID_E, TOKEN_E),
    ];
    const result = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: reordered,
      nowMs: 2,
    });
    assert.equal(result.newAlerts.length, 0);
  });

  it("token exit is silent; replacement F alerts once", () => {
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: TOP5,
      nowMs: 1,
    });
    const replaced = [
      tok(ID_A, TOKEN_A),
      tok(ID_B, TOKEN_B),
      tok(ID_C, TOKEN_C),
      tok(ID_D, TOKEN_D),
      tok(ID_F, TOKEN_F),
    ];
    const first = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: replaced,
      nowMs: 2,
    });
    assert.equal(first.newAlerts.length, 1);
    assert.equal(first.newAlerts[0]!.eventId, ID_F);
    assert.ok(first.nextSeen.has(ID_E));
  });

  it("leave and re-enter does not alert again in the same session", () => {
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: TOP5,
      nowMs: 1,
    });
    const withF = [
      tok(ID_F, TOKEN_F),
      tok(ID_A, TOKEN_A),
      tok(ID_B, TOKEN_B),
      tok(ID_C, TOKEN_C),
      tok(ID_D, TOKEN_D),
    ];
    const enter = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: withF,
      nowMs: 2,
    });
    assert.equal(enter.newAlerts.length, 1);

    const withoutF = [
      tok(ID_A, TOKEN_A),
      tok(ID_B, TOKEN_B),
      tok(ID_C, TOKEN_C),
      tok(ID_D, TOKEN_D),
      tok(ID_E, TOKEN_E),
    ];
    const left = diffRadarVisibleTokens({
      previousSeen: enter.nextSeen,
      seeded: true,
      tokens: withoutF,
      nowMs: 3,
    });
    assert.equal(left.newAlerts.length, 0);

    const reenter = diffRadarVisibleTokens({
      previousSeen: left.nextSeen,
      seeded: true,
      tokens: withF,
      nowMs: 4,
    });
    assert.equal(reenter.newAlerts.length, 0);
  });

  it("qualification outside tokens does not affect alerts (caller uses tokens only)", () => {
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: TOP5,
      nowMs: 1,
    });
    const unchanged = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: TOP5,
      nowMs: 2,
    });
    assert.equal(unchanged.newAlerts.length, 0);
    assert.equal(unchanged.nextSeen.has(ID_H), false);
  });

  it("multiple new visible ids emit one alert each in tokens order", () => {
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: [
        tok(ID_A, TOKEN_A),
        tok(ID_B, TOKEN_B),
        tok(ID_C, TOKEN_C),
      ],
      nowMs: 1,
    });
    const multi = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: [
        tok(ID_G, TOKEN_G),
        tok(ID_H, TOKEN_H),
        tok(ID_A, TOKEN_A),
        tok(ID_B, TOKEN_B),
        tok(ID_C, TOKEN_C),
      ],
      nowMs: 2,
    });
    assert.deepEqual(
      multi.newAlerts.map((a) => a.eventId),
      [ID_G, ID_H],
    );
  });

  it("fresh session seed avoids historical alerts", () => {
    const remount = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: [
        tok(ID_A, TOKEN_A),
        tok(ID_B, TOKEN_B),
        tok(ID_C, TOKEN_C),
      ],
      nowMs: 3,
    });
    assert.equal(remount.newAlerts.length, 0);
  });

  it("expired alerts prune; fallback slot helper is stable", () => {
    const slot = radarAlertSlotForEventId(ID_A);
    assert.equal(typeof slot.leftPct, "number");
    assert.equal(typeof slot.topPct, "number");
    assert.deepEqual(radarAlertSlotForEventId(ID_A), slot);
    assert.deepEqual(radarAlertFallbackWorldPct(ID_A, 0), slot);

    const alerts = [
      {
        eventId: ID_A,
        tokenAddress: TOKEN_A,
        createdAtMs: 0,
        expiresAtMs: 100,
        leftPct: 1,
        topPct: 2,
      },
      {
        eventId: ID_B,
        tokenAddress: TOKEN_B,
        createdAtMs: 0,
        expiresAtMs: 200,
        leftPct: 3,
        topPct: 4,
      },
    ];
    assert.equal(pruneExpiredRadarAlerts(alerts, 100).length, 1);
    assert.equal(pruneExpiredRadarAlerts(alerts, 100)[0]!.eventId, ID_B);
    assert.equal(pruneExpiredRadarAlerts(alerts, 201).length, 0);
  });
});

describe("radar alert viewport spawn", () => {
  const desktopViewport: ViewportRect = {
    left: 0,
    top: 0,
    width: 1440,
    height: 900,
  };
  const mobileViewport: ViewportRect = {
    left: 0,
    top: 0,
    width: 390,
    height: 844,
  };

  it("spawns inside current visible world bounds (home camera)", () => {
    const camera: CanvasCamera = { x: 1680, y: 1150, scale: 1 };
    const pct = radarAlertSpawnWorldPct({
      viewport: desktopViewport,
      camera,
      index: 0,
    });
    assertInsideVisibleWorld(pct, camera, desktopViewport);
  });

  it("pan away from home still spawns inside the new viewport", () => {
    const camera: CanvasCamera = { x: 2800, y: 1900, scale: 1 };
    const homeish = homePctToWorldPct(68, 38);
    const pct = radarAlertSpawnWorldPct({
      viewport: desktopViewport,
      camera,
      index: 0,
    });
    assertInsideVisibleWorld(pct, camera, desktopViewport);
    // Not the old fixed home-slot world position.
    assert.ok(
      Math.hypot(pct.leftPct - homeish.leftPct, pct.topPct - homeish.topPct) >
        1,
    );
  });

  it("accounts for camera scale when mapping viewport → world", () => {
    const camera: CanvasCamera = { x: 1000, y: 800, scale: 0.5 };
    const pct = radarAlertSpawnWorldPct({
      viewport: desktopViewport,
      camera,
      index: 0,
    });
    assertInsideVisibleWorld(pct, camera, desktopViewport);
    const vis = visibleWorldSize(
      desktopViewport.width,
      desktopViewport.height,
      camera.scale,
    );
    assert.ok(vis.width > desktopViewport.width);
  });

  it("mobile ~390px keeps spawn inside safe viewport band", () => {
    const camera: CanvasCamera = { x: 1700, y: 1200, scale: 1 };
    const band = radarAlertViewportSafeBand(390);
    assert.ok(band.left >= 0.2);
    assert.ok(band.bottom <= 0.65);
    const pct = radarAlertSpawnWorldPct({
      viewport: mobileViewport,
      camera,
      index: 0,
    });
    assertInsideVisibleWorld(pct, camera, mobileViewport);
  });

  it("multiple alerts receive distinct staggered positions", () => {
    const camera: CanvasCamera = { x: 1680, y: 1150, scale: 1 };
    const a = radarAlertSpawnWorldPct({
      viewport: desktopViewport,
      camera,
      index: 0,
    });
    const b = radarAlertSpawnWorldPct({
      viewport: desktopViewport,
      camera,
      index: 1,
    });
    const c = radarAlertSpawnWorldPct({
      viewport: desktopViewport,
      camera,
      index: 2,
    });
    assert.notDeepEqual(a, b);
    assert.notDeepEqual(b, c);
    assertInsideVisibleWorld(a, camera, desktopViewport);
    assertInsideVisibleWorld(b, camera, desktopViewport);
    assertInsideVisibleWorld(c, camera, desktopViewport);
  });

  it("spawn position is frozen on the alert and does not track later camera", () => {
    const cameraA: CanvasCamera = { x: 1680, y: 1150, scale: 1 };
    const cameraB: CanvasCamera = { x: 3000, y: 2000, scale: 1 };
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: TOP5,
      nowMs: 1,
    });
    const created = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: [
        tok(ID_G, TOKEN_G),
        tok(ID_A, TOKEN_A),
        tok(ID_B, TOKEN_B),
        tok(ID_C, TOKEN_C),
        tok(ID_D, TOKEN_D),
      ],
      nowMs: 2,
      resolvePosition: (_id, index) =>
        radarAlertSpawnWorldPct({
          viewport: desktopViewport,
          camera: cameraA,
          index,
        }),
    });
    const frozen = {
      leftPct: created.newAlerts[0]!.leftPct,
      topPct: created.newAlerts[0]!.topPct,
    };
    const laterViewportSpawn = radarAlertSpawnWorldPct({
      viewport: desktopViewport,
      camera: cameraB,
      index: 0,
    });
    assert.notDeepEqual(frozen, laterViewportSpawn);
    assert.equal(created.newAlerts[0]!.leftPct, frozen.leftPct);
    assert.equal(created.newAlerts[0]!.topPct, frozen.topPct);
  });

  it("diff resolvePosition wires viewport spawn into new alerts", () => {
    const camera: CanvasCamera = { x: 2000, y: 1400, scale: 1 };
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: [tok(ID_A, TOKEN_A)],
      nowMs: 1,
    });
    const expected = radarAlertSpawnWorldPct({
      viewport: desktopViewport,
      camera,
      index: 0,
    });
    const next = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: [tok(ID_G, TOKEN_G), tok(ID_A, TOKEN_A)],
      nowMs: 2,
      resolvePosition: (_id, index) =>
        radarAlertSpawnWorldPct({
          viewport: desktopViewport,
          camera,
          index,
        }),
    });
    assert.equal(next.newAlerts.length, 1);
    assert.deepEqual(
      {
        leftPct: next.newAlerts[0]!.leftPct,
        topPct: next.newAlerts[0]!.topPct,
      },
      expected,
    );
  });
});

describe("radar alert client lifetime (independent of qualification age)", () => {
  it("delayed qualification still gets full 4 minutes from client creation", () => {
    const seeded = diffRadarVisibleTokens({
      previousSeen: new Set(),
      seeded: false,
      tokens: TOP5,
      nowMs: 1,
    });
    // Qualification occurred ~3m30s ago — irrelevant to lifetime.
    const createAt = 10_000_000;
    const created = diffRadarVisibleTokens({
      previousSeen: seeded.nextSeen,
      seeded: true,
      tokens: [
        tok(ID_G, TOKEN_G),
        tok(ID_A, TOKEN_A),
        tok(ID_B, TOKEN_B),
        tok(ID_C, TOKEN_C),
        tok(ID_D, TOKEN_D),
      ],
      nowMs: createAt,
    });
    assert.equal(created.newAlerts.length, 1);
    assert.equal(created.newAlerts[0]!.createdAtMs, createAt);
    assert.equal(
      created.newAlerts[0]!.expiresAtMs,
      createAt + RADAR_ALERT_LIFETIME_MS,
    );
    assert.equal(
      pruneExpiredRadarAlerts(created.newAlerts, createAt + 3 * 60 * 1000 + 59_000)
        .length,
      1,
    );
    assert.equal(
      pruneExpiredRadarAlerts(
        created.newAlerts,
        createAt + RADAR_ALERT_LIFETIME_MS,
      ).length,
      0,
    );
  });

  it("hidden poll updates tokens without emitting alerts or advancing seen", () => {
    const seeded = applyRadarWatchlistSnapshot({
      previousSeen: new Set(),
      seeded: false,
      previousAlerts: [],
      tokens: TOP5,
      nowMs: 1,
      emitAlerts: true,
    });
    assert.equal(seeded.alerts.length, 0);

    const hidden = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [
        tok(ID_G, TOKEN_G),
        tok(ID_A, TOKEN_A),
        tok(ID_B, TOKEN_B),
        tok(ID_C, TOKEN_C),
        tok(ID_D, TOKEN_D),
      ],
      nowMs: 2,
      emitAlerts: false,
    });
    assert.equal(hidden.alerts.length, 0);
    assert.equal(hidden.nextSeen.has(ID_G), false);

    const visibleAt = 50_000;
    const visible = applyRadarWatchlistSnapshot({
      previousSeen: hidden.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: [
        tok(ID_G, TOKEN_G),
        tok(ID_A, TOKEN_A),
        tok(ID_B, TOKEN_B),
        tok(ID_C, TOKEN_C),
        tok(ID_D, TOKEN_D),
      ],
      nowMs: visibleAt,
      emitAlerts: true,
    });
    assert.equal(visible.alerts.length, 1);
    assert.equal(visible.alerts[0]!.eventId, ID_G);
    assert.equal(visible.alerts[0]!.createdAtMs, visibleAt);
    assert.equal(
      visible.alerts[0]!.expiresAtMs,
      visibleAt + RADAR_ALERT_LIFETIME_MS,
    );
  });

  it("realtime wake without top-5 membership creates no alert after refresh diff", () => {
    const seeded = applyRadarWatchlistSnapshot({
      previousSeen: new Set(),
      seeded: false,
      previousAlerts: [],
      tokens: TOP5,
      nowMs: 1,
      emitAlerts: true,
    });
    // H qualified (realtime wake) but tokens unchanged → no alert.
    const same = applyRadarWatchlistSnapshot({
      previousSeen: seeded.nextSeen,
      seeded: true,
      previousAlerts: [],
      tokens: TOP5,
      nowMs: 2,
      emitAlerts: true,
    });
    assert.equal(same.alerts.length, 0);
  });
});
