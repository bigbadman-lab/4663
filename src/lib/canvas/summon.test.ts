/**
 * Stage 10B.9 / Social 5 — SUMMON helpers + structural wiring.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { playhtmlEventElementId } from "@/lib/canvas/hero";
import { CANVAS_SLOTS } from "@/lib/canvas/slots";
import {
  canClaimActiveSummon,
  clearActiveSummonIfOwner,
  createActiveSummonState,
  normalizeActiveSummonPageData,
  normalizeActiveSummonState,
  retainActiveSummonForPresentOwner,
  ACTIVE_SUMMON_PAGE_DATA_NAME,
} from "@/lib/canvas/active-summon";
import {
  assignSummonSlots,
  canDispatchSummon,
  playhtmlSummonedElementId,
  resolveSummonEvents,
  selectSummonEventIds,
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
import { PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION } from "@/lib/events/types";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const NOW = Date.parse("2026-08-12T12:00:00.000Z");
const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const OTHER = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function event(
  overrides: Partial<PublicEvent> & Pick<PublicEvent, "id" | "occurredAt">,
): PublicEvent {
  return {
    type: PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
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

describe("Stage 10B.9 summon selection + payload", () => {
  it("1–3. selects newest max 4 historical continuation; excludes live; empty => null payload", () => {
    const events = [
      event({ id: idAt(0), occurredAt: isoAgo(1_000) }), // live
      event({ id: idAt(1), occurredAt: isoAgo(2_000) }), // live
      ...Array.from({ length: 10 }, (_, i) =>
        event({
          id: idAt(i + 10),
          occurredAt: isoAgo(LIVE_OBJECT_MAX_AGE_MS + 60_000 + i * 1_000),
        }),
      ),
    ];
    const ids = selectSummonEventIds(events, NOW);
    assert.equal(ids.length, SUMMON_MAX_EVENTS);
    assert.equal(SUMMON_MAX_EVENTS, 4);
    assert.equal(ids.includes(idAt(0)), false);
    assert.equal(ids.includes(idAt(1)), false);
    assert.equal(createActiveSummonState({ ownerSessionId: OWNER, eventIds: [] }), null);
  });

  it("4–6. payload shape, order preserved, malformed ignored", () => {
    const state = createActiveSummonState({
      ownerSessionId: OWNER,
      eventIds: [idAt(1), idAt(2)],
      summonId: idAt(99),
      startedAt: "2026-08-13T00:00:00.000Z",
    });
    assert.ok(state);
    assert.equal(state!.ownerSessionId, OWNER);
    assert.equal(ACTIVE_SUMMON_PAGE_DATA_NAME, "4663-active-summon");
    assert.equal(normalizeActiveSummonState(null), null);
    assert.equal(
      normalizeActiveSummonState({
        summonId: "x",
        ownerSessionId: OWNER,
        eventIds: [idAt(1)],
        startedAt: "2026-08-13T00:00:00.000Z",
      }),
      null,
    );
    assert.equal(
      normalizeActiveSummonState({
        summonId: idAt(99),
        ownerSessionId: OWNER,
        eventIds: [idAt(1), idAt(1)],
        startedAt: "2026-08-13T00:00:00.000Z",
      }),
      null,
    );
  });
});

describe("Stage 10B.9 summon slots + ids + resolve", () => {
  it("7–9. deterministic SUMMON_SLOTS; summoned ids distinct from live", () => {
    assert.equal(SUMMON_SLOTS.length, 4);
    assert.equal(SUMMON_SLOTS.length, SUMMON_MAX_EVENTS);
    assert.notDeepEqual(
      SUMMON_SLOTS.map((s) => `${s.leftPct},${s.topPct}`),
      CANVAS_SLOTS.map((s) => `${s.leftPct},${s.topPct}`),
    );
    const events = [event({ id: idAt(1), occurredAt: isoAgo(200_000) })];
    const slotted = assignSummonSlots(events);
    assert.equal(slotted[0]?.slot.id, "summon-0");
    assert.notEqual(
      playhtmlSummonedElementId(idAt(99), idAt(1)),
      playhtmlEventElementId(idAt(1)),
    );
  });

  it("10. live duplicate suppression", () => {
    const events = [
      event({ id: idAt(1), occurredAt: isoAgo(200_000) }),
      event({ id: idAt(2), occurredAt: isoAgo(200_000) }),
    ];
    const live = new Set([idAt(1)]);
    assert.deepEqual(
      suppressLiveDuplicates(events, live).map((e) => e.id),
      [idAt(2)],
    );
  });

  it("11–13. owner clear / presence retain / mutex", () => {
    const state = createActiveSummonState({
      ownerSessionId: OWNER,
      eventIds: [idAt(1)],
      summonId: idAt(99),
      startedAt: "2026-08-13T00:00:00.000Z",
    })!;
    const data = { active: state };
    assert.equal(
      clearActiveSummonIfOwner(data, OTHER).active?.summonId,
      state.summonId,
    );
    assert.equal(clearActiveSummonIfOwner(data, OWNER).active, null);
    assert.equal(
      retainActiveSummonForPresentOwner(data, new Set([OTHER])).active,
      null,
    );
    assert.equal(
      retainActiveSummonForPresentOwner(data, new Set([OWNER])).active?.summonId,
      state.summonId,
    );
    assert.equal(canClaimActiveSummon({ active: null }, new Set()), true);
    assert.equal(
      canClaimActiveSummon(data, new Set([OWNER])),
      false,
    );
    assert.equal(
      canClaimActiveSummon(data, new Set([OTHER])),
      true,
    );
  });

  it("14–17. resolve order, missing ignored, recovery merge", () => {
    const a = event({ id: idAt(1), occurredAt: isoAgo(200_000) });
    const b = event({ id: idAt(2), occurredAt: isoAgo(200_000) });
    const resolved = resolveSummonEvents(
      [idAt(2), idAt(1), idAt(3)],
      [a],
      [b],
    );
    assert.deepEqual(
      resolved.map((e) => e.id),
      [idAt(2), idAt(1)],
    );
  });

  it("18. 4s cooldown still available", () => {
    assert.equal(SUMMON_COOLDOWN_MS, 4_000);
    assert.equal(canDispatchSummon(null, NOW), true);
    assert.equal(canDispatchSummon(NOW - 3_999, NOW), false);
    assert.equal(canDispatchSummon(NOW - 4_000, NOW), true);
  });
});

describe("Social 5 summon session semantics", () => {
  it("fixed timer no longer drives active lifetime in controller", () => {
    const controller = readSrc("src/components/canvas/use-summon-controller.ts");
    assert.equal(controller.includes("SUMMON_LIFETIME_MS"), false);
    assert.equal(controller.includes("setTimeout"), false);
    assert.ok(controller.includes("ACTIVE_SUMMON_PAGE_DATA_NAME"));
    assert.ok(controller.includes("registerSessionEndedHandler"));
    assert.ok(controller.includes("retainActiveSummonForPresentOwner"));
    assert.ok(controller.includes("usePageData"));
    // Constant retained as deprecated marker only.
    assert.equal(SUMMON_LIFETIME_MS, 20_000);
  });

  it("page-data active state + named gate + Summon toggle + RESET wiring", () => {
    assert.equal(
      normalizeActiveSummonPageData({ active: null }).active,
      null,
    );
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("canSummon"));
    assert.equal(palette.includes("onDismissSummon"), false);
    assert.equal(palette.includes("[ DISMISS ]"), false);
    assert.ok(palette.includes("isSummonDockDisabled"));
    assert.ok(palette.includes("onReset"));
    assert.ok(palette.includes('item.id === "reset"'));

    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.ok(playTree.includes("resetContent"));
    assert.ok(playTree.includes("isSummonOwner"));
    assert.equal(playTree.includes("onDismissSummon"), false);

    const controller = readSrc("src/components/canvas/use-summon-controller.ts");
    assert.ok(controller.includes("shouldDismissActiveSummonOnClick"));

    const summoned = readSrc("src/components/canvas/summoned-pons-object.tsx");
    assert.equal(summoned.includes("PonsWatchControl"), false);
    assert.equal(summoned.includes("PIN"), false);
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(summoned) || summoned.includes("<CanMoveElement"));
  });

  it("19–24. palette Summon wiring; providers/stream/live semantics unchanged", () => {
    assert.equal(LIVE_OBJECT_MAX_AGE_MS, 10 * 60 * 1000);
    assert.equal(LIVE_OBJECT_MAX_VISIBLE_DESKTOP, 6);
    assert.equal(LIVE_OBJECT_MAX_VISIBLE_NARROW, 4);
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("onSummon"));
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("SummonLayer"));
    assert.ok(surface.includes("CanvasControlPalette"));
  });
});
