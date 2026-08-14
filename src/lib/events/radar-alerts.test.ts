/**
 * Live RADAR alert poll-diff semantics.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RADAR_ALERT_LIFETIME_MS,
  diffRadarQualifications,
  pruneExpiredRadarAlerts,
  radarAlertSlotForEventId,
} from "@/lib/events/radar-alerts";

const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("radar alert detection", () => {
  it("first fetch seeds seen ids and produces no alerts", () => {
    const result = diffRadarQualifications({
      previousSeen: new Set(),
      seeded: false,
      qualifications: [
        { eventId: ID_A, tokenAddress: TOKEN_A, occurredAt: "2026-08-14T12:00:00.000Z" },
        { eventId: ID_B, tokenAddress: TOKEN_B, occurredAt: "2026-08-14T12:01:00.000Z" },
      ],
      nowMs: 1_000_000,
    });
    assert.equal(result.seeded, true);
    assert.equal(result.newAlerts.length, 0);
    assert.ok(result.nextSeen.has(ID_A));
    assert.ok(result.nextSeen.has(ID_B));
  });

  it("later unseen eventId produces one alert; repeat does not duplicate", () => {
    const seeded = diffRadarQualifications({
      previousSeen: new Set(),
      seeded: false,
      qualifications: [
        { eventId: ID_A, tokenAddress: TOKEN_A, occurredAt: "2026-08-14T12:00:00.000Z" },
      ],
      nowMs: 1_000_000,
    });

    const first = diffRadarQualifications({
      previousSeen: seeded.nextSeen,
      seeded: true,
      qualifications: [
        { eventId: ID_A, tokenAddress: TOKEN_A, occurredAt: "2026-08-14T12:00:00.000Z" },
        { eventId: ID_B, tokenAddress: TOKEN_B, occurredAt: "2026-08-14T12:05:00.000Z" },
      ],
      nowMs: 1_100_000,
    });
    assert.equal(first.newAlerts.length, 1);
    assert.equal(first.newAlerts[0]!.eventId, ID_B);
    assert.equal(first.newAlerts[0]!.tokenAddress, TOKEN_B);
    assert.equal(
      first.newAlerts[0]!.expiresAtMs,
      1_100_000 + RADAR_ALERT_LIFETIME_MS,
    );

    const repeat = diffRadarQualifications({
      previousSeen: first.nextSeen,
      seeded: true,
      qualifications: [
        { eventId: ID_A, tokenAddress: TOKEN_A, occurredAt: "2026-08-14T12:00:00.000Z" },
        { eventId: ID_B, tokenAddress: TOKEN_B, occurredAt: "2026-08-14T12:05:00.000Z" },
      ],
      nowMs: 1_200_000,
    });
    assert.equal(repeat.newAlerts.length, 0);
  });

  it("multiple new ids behave deterministically; remount seed avoids historical alerts", () => {
    const afterSeed = diffRadarQualifications({
      previousSeen: new Set(),
      seeded: false,
      qualifications: [
        { eventId: ID_A, tokenAddress: TOKEN_A, occurredAt: "2026-08-14T12:00:00.000Z" },
      ],
      nowMs: 1,
    });
    const multi = diffRadarQualifications({
      previousSeen: afterSeed.nextSeen,
      seeded: true,
      qualifications: [
        { eventId: ID_B, tokenAddress: TOKEN_B, occurredAt: "2026-08-14T12:01:00.000Z" },
        { eventId: ID_C, tokenAddress: TOKEN_A, occurredAt: "2026-08-14T12:02:00.000Z" },
      ],
      nowMs: 2,
    });
    assert.deepEqual(
      multi.newAlerts.map((a) => a.eventId),
      [ID_B, ID_C],
    );

    // Fresh session (remount): seed again — no fake historical alerts.
    const remount = diffRadarQualifications({
      previousSeen: new Set(),
      seeded: false,
      qualifications: [
        { eventId: ID_A, tokenAddress: TOKEN_A, occurredAt: "2026-08-14T12:00:00.000Z" },
        { eventId: ID_B, tokenAddress: TOKEN_B, occurredAt: "2026-08-14T12:01:00.000Z" },
        { eventId: ID_C, tokenAddress: TOKEN_A, occurredAt: "2026-08-14T12:02:00.000Z" },
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
