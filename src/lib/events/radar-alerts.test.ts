/**
 * Live RADAR alert poll-diff — visible tokens[] membership semantics.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RADAR_ALERT_LIFETIME_MS,
  diffRadarVisibleTokens,
  pruneExpiredRadarAlerts,
  radarAlertSlotForEventId,
} from "@/lib/events/radar-alerts";

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
    // H would appear in recentQualifications but tokens unchanged → no alert.
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

  it("expired alerts prune; slot is stable per eventId", () => {
    const slot = radarAlertSlotForEventId(ID_A);
    assert.equal(typeof slot.leftPct, "number");
    assert.equal(typeof slot.topPct, "number");
    assert.deepEqual(radarAlertSlotForEventId(ID_A), slot);

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
