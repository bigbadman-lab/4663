/**
 * Stage 8A.7 — Summon selects 4 verified continuation events only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  selectSummonEventIds,
  SUMMON_MAX_EVENTS,
  SUMMON_SLOTS,
  isSummonEligibleEventType,
} from "@/lib/canvas/summon";
import { LIVE_OBJECT_MAX_AGE_MS } from "@/lib/canvas/visible-events";
import {
  PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
  PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY,
  type PublicEvent,
} from "@/lib/events/types";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const NOW = Date.parse("2026-08-12T12:00:00.000Z");

function event(
  overrides: Partial<PublicEvent> & Pick<PublicEvent, "id" | "occurredAt" | "type">,
): PublicEvent {
  return {
    tokenAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
    newBuyers: 2,
    triggerBlockNumber: 34400000,
    triggerTxHash: null,
    ...overrides,
  };
}

function isoAgo(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function idAt(n: number): string {
  return `aaaaaaaa-bbbb-cccc-dddd-${String(n).padStart(12, "0")}`;
}

describe("Stage 8A.7 Summon continuation integrity + count", () => {
  it("1–3. only pons_buyer_continuation; buying activity excluded; max 4", () => {
    assert.equal(SUMMON_MAX_EVENTS, 4);
    assert.equal(SUMMON_SLOTS.length, 4);

    const mixed: PublicEvent[] = [
      event({
        id: idAt(1),
        type: PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY,
        occurredAt: isoAgo(LIVE_OBJECT_MAX_AGE_MS + 60_000),
      }),
      ...Array.from({ length: 6 }, (_, i) =>
        event({
          id: idAt(i + 10),
          type: PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
          occurredAt: isoAgo(LIVE_OBJECT_MAX_AGE_MS + 120_000 + i * 1_000),
        }),
      ),
    ];

    const ids = selectSummonEventIds(mixed, NOW);
    assert.equal(ids.length, 4);
    assert.equal(ids.includes(idAt(1)), false);
    for (const id of ids) {
      const row = mixed.find((e) => e.id === id)!;
      assert.equal(isSummonEligibleEventType(row), true);
      assert.equal(row.type, PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION);
    }
    assert.equal(new Set(ids).size, ids.length);
  });

  it("7–8. fewer than 4 valid returns only valid; no duplicates", () => {
    const events = [
      event({
        id: idAt(1),
        type: PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
        occurredAt: isoAgo(LIVE_OBJECT_MAX_AGE_MS + 60_000),
      }),
      event({
        id: idAt(1),
        type: PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
        occurredAt: isoAgo(LIVE_OBJECT_MAX_AGE_MS + 90_000),
      }),
      event({
        id: idAt(2),
        type: PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
        occurredAt: isoAgo(LIVE_OBJECT_MAX_AGE_MS + 120_000),
      }),
    ];
    const ids = selectSummonEventIds(events, NOW);
    assert.deepEqual(ids, [idAt(1), idAt(2)]);
  });

  it("live continuation excluded from historical summon", () => {
    const events = [
      event({
        id: idAt(1),
        type: PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
        occurredAt: isoAgo(1_000),
      }),
      event({
        id: idAt(2),
        type: PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
        occurredAt: isoAgo(LIVE_OBJECT_MAX_AGE_MS + 60_000),
      }),
    ];
    assert.deepEqual(selectSummonEventIds(events, NOW), [idAt(2)]);
  });

  it("controller fetches summon-history; live recent stream unchanged", () => {
    const controller = readSrc("src/components/canvas/use-summon-controller.ts");
    assert.ok(controller.includes("fetchSummonHistoryEvents"));
    assert.equal(controller.includes("fetchRecentPublicEvents"), false);
    assert.ok(controller.includes("selectSummonEventIds"));
    assert.ok(controller.includes("shouldDismissActiveSummonOnClick"));

    const recent = readSrc("src/lib/events/recent.ts");
    assert.ok(recent.includes("EVENT_TYPE_PONS_BUYING_ACTIVITY"));
    assert.equal(recent.includes("EVENT_TYPE_PONS_BUYER_CONTINUATION"), false);
    assert.equal(recent.includes("pons_buyer_continuation"), false);

    const history = readSrc("src/lib/events/summon-history.ts");
    assert.ok(history.includes("EVENT_TYPE_PONS_BUYER_CONTINUATION"));
    assert.ok(history.includes("verifyContinuationEventIntegrity"));
    assert.equal(history.includes("fire_pons_buyer_continuation"), false);
  });

  it("9–10. toggle + cooldown markers unchanged", () => {
    const toggle = readSrc("src/components/canvas/social8a3-summon-toggle.test.ts");
    assert.ok(toggle.includes("shouldDismissActiveSummonOnClick"));
    const summon = readSrc("src/lib/canvas/summon.ts");
    assert.ok(summon.includes("SUMMON_COOLDOWN_MS = 4_000"));
    assert.ok(summon.includes("SUMMON_MAX_EVENTS = 4"));
  });
});
