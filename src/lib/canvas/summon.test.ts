/**
 * Stage 10B.9 — shared SUMMON pure helpers + structural wiring.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { playhtmlEventElementId } from "@/lib/canvas/hero";
import { CANVAS_SLOTS } from "@/lib/canvas/slots";
import {
  assignSummonSlots,
  canDispatchSummon,
  createSummonPayload,
  isSummonExpired,
  isSummonStaleOnReceive,
  parseSummonPayload,
  PLAYHTML_SUMMON_EVENT_TYPE,
  playhtmlSummonedElementId,
  resolveSummonEvents,
  selectSummonEventIds,
  shouldApplySummon,
  SUMMON_COOLDOWN_MS,
  SUMMON_LIFETIME_MS,
  SUMMON_MAX_EVENTS,
  SUMMON_SLOTS,
  suppressLiveDuplicates,
} from "@/lib/canvas/summon";
import {
  LIVE_OBJECT_MAX_AGE_MS,
  LIVE_OBJECT_MAX_VISIBLE_DESKTOP,
  LIVE_OBJECT_MAX_VISIBLE_NARROW,
} from "@/lib/canvas/visible-events";
import type { PublicEvent } from "@/lib/events/types";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const NOW = Date.parse("2026-08-12T12:00:00.000Z");

function event(
  overrides: Partial<PublicEvent> & Pick<PublicEvent, "id" | "occurredAt">,
): PublicEvent {
  return {
    type: "pons_buying_activity",
    tokenAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
    newBuyers: 7,
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

describe("Stage 10B.9 summon selection + payload", () => {
  it("1–3. selects newest max 8 historical; excludes live; empty => null payload", () => {
    const events = [
      event({ id: idAt(0), occurredAt: isoAgo(1_000) }), // live
      event({ id: idAt(1), occurredAt: isoAgo(2_000) }), // live
      ...Array.from({ length: 10 }, (_, i) =>
        event({
          id: idAt(i + 10),
          occurredAt: isoAgo(120_000 + i * 1_000),
        }),
      ),
    ];
    const ids = selectSummonEventIds(events, NOW, SUMMON_MAX_EVENTS);
    assert.equal(ids.length, 8);
    assert.equal(ids.includes(idAt(0)), false);
    assert.equal(ids.includes(idAt(1)), false);
    assert.equal(ids[0], idAt(10));
    assert.equal(ids[7], idAt(17));

    assert.equal(createSummonPayload([]), null);
    assert.deepEqual(selectSummonEventIds([], NOW), []);
  });

  it("4–6. payload shape, order preserved, malformed ignored", () => {
    const payload = createSummonPayload([idAt(1), idAt(2)], {
      summonId: idAt(99),
      startedAt: NOW,
    });
    assert.ok(payload);
    assert.equal(payload!.summonId, idAt(99));
    assert.deepEqual(payload!.eventIds, [idAt(1), idAt(2)]);
    assert.equal(payload!.startedAt, NOW);
    assert.equal(PLAYHTML_SUMMON_EVENT_TYPE, "4663-summon");

    assert.equal(parseSummonPayload(null), null);
    assert.equal(parseSummonPayload({ summonId: "x", eventIds: [], startedAt: 1 }), null);
    assert.equal(
      parseSummonPayload({
        summonId: idAt(1),
        eventIds: ["not-a-uuid"],
        startedAt: NOW,
      }),
      null,
    );
    assert.deepEqual(
      parseSummonPayload({
        summonId: idAt(1),
        eventIds: [idAt(2), idAt(3)],
        startedAt: NOW,
      }),
      {
        summonId: idAt(1),
        eventIds: [idAt(2), idAt(3)],
        startedAt: NOW,
      },
    );
  });
});

describe("Stage 10B.9 summon slots + ids + resolve", () => {
  it("7–9. deterministic SUMMON_SLOTS; summoned ids distinct from live", () => {
    assert.equal(SUMMON_SLOTS.length, 8);
    assert.notDeepEqual(SUMMON_SLOTS, CANVAS_SLOTS);
    const events = [event({ id: idAt(1), occurredAt: isoAgo(200_000) })];
    const slotted = assignSummonSlots(events);
    assert.equal(slotted[0]!.slot.id, "summon-0");
    assert.equal(slotted[0]!.slot.leftPct, SUMMON_SLOTS[0]!.leftPct);

    const summonId = idAt(50);
    const eventId = idAt(1);
    assert.equal(
      playhtmlSummonedElementId(summonId, eventId),
      `4663-summoned-${summonId}-${eventId}`,
    );
    assert.notEqual(
      playhtmlSummonedElementId(summonId, eventId),
      playhtmlEventElementId(eventId),
    );
  });

  it("10. live duplicate suppression", () => {
    const events = [
      event({ id: idAt(1), occurredAt: isoAgo(200_000) }),
      event({ id: idAt(2), occurredAt: isoAgo(200_000) }),
    ];
    const filtered = suppressLiveDuplicates(events, new Set([idAt(1)]));
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.id, idAt(2));
  });

  it("11–13. replace / expiry / stale receive", () => {
    assert.equal(
      shouldApplySummon({
        payload: { summonId: idAt(1), eventIds: [], startedAt: NOW },
        activeSummonId: idAt(2),
        nowMs: NOW,
      }),
      "apply",
    );
    assert.equal(
      shouldApplySummon({
        payload: { summonId: idAt(1), eventIds: [], startedAt: NOW },
        activeSummonId: idAt(1),
        nowMs: NOW,
      }),
      "ignore-duplicate",
    );
    assert.equal(
      shouldApplySummon({
        payload: {
          summonId: idAt(3),
          eventIds: [],
          startedAt: NOW - SUMMON_LIFETIME_MS - 1,
        },
        activeSummonId: null,
        nowMs: NOW,
      }),
      "ignore-stale",
    );
    assert.equal(SUMMON_LIFETIME_MS, 20_000);
    assert.equal(isSummonExpired(NOW - 20_000, NOW), true);
    assert.equal(isSummonStaleOnReceive(NOW - 20_001, NOW), true);
  });

  it("14–17. resolve order, missing ignored, recovery merge, duplicate apply key", () => {
    const local = [event({ id: idAt(1), occurredAt: isoAgo(200_000) })];
    const recovery = [
      event({ id: idAt(2), occurredAt: isoAgo(210_000) }),
      event({ id: idAt(3), occurredAt: isoAgo(220_000) }),
    ];
    const resolved = resolveSummonEvents(
      [idAt(3), idAt(1), idAt(9), idAt(2)],
      local,
      recovery,
    );
    assert.deepEqual(
      resolved.map((e) => e.id),
      [idAt(3), idAt(1), idAt(2)],
    );

    assert.equal(
      shouldApplySummon({
        payload: { summonId: idAt(7), eventIds: [idAt(1)], startedAt: NOW },
        activeSummonId: idAt(7),
        nowMs: NOW,
      }),
      "ignore-duplicate",
    );
  });

  it("18. 4s cooldown", () => {
    assert.equal(SUMMON_COOLDOWN_MS, 4_000);
    assert.equal(canDispatchSummon(null, NOW), true);
    assert.equal(canDispatchSummon(NOW, NOW + 3_999), false);
    assert.equal(canDispatchSummon(NOW, NOW + 4_000), true);
  });
});

describe("Stage 10B.9 summon wiring", () => {
  it("19–24. palette Summon only; providers/stream/live semantics unchanged", () => {
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes('item.id === "summon"'));
    assert.ok(palette.includes("onSummon?.()"));
    assert.ok(palette.includes("onPlaceholderAction"));

    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.equal((playTree.match(/<PlayProvider\b/g) ?? []).length, 1);
    assert.ok(playTree.includes("useSummonController"));

    const root = readSrc("src/components/canvas/canvas-root.tsx");
    assert.equal((root.match(/usePublicEvents\(\)/g) ?? []).length, 1);
    assert.ok(root.includes("events={events}"));

    assert.equal(LIVE_OBJECT_MAX_AGE_MS, 90_000);
    assert.equal(LIVE_OBJECT_MAX_VISIBLE_DESKTOP, 6);
    assert.equal(LIVE_OBJECT_MAX_VISIBLE_NARROW, 4);
    assert.equal(CANVAS_SLOTS.length, 6);

    const summoned = readSrc("src/components/canvas/summoned-pons-object.tsx");
    assert.ok(summoned.includes(">earlier<") || summoned.includes("earlier"));
    assert.ok(summoned.includes("playhtmlSummonedElementId"));
    assert.ok(summoned.includes("CanMoveElement"));
    assert.equal(summoned.includes("aria-live"), false);

    const controller = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );
    assert.ok(controller.includes("registerPlayEventListener"));
    assert.ok(controller.includes("dispatchPlayEvent"));
    assert.ok(controller.includes("fetchRecentPublicEvents"));
    assert.ok(controller.includes("applyPayload(payload)"));
  });
});
