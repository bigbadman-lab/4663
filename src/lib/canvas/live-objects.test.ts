/**
 * Stage 10B — visible live events, slots, address, clipboard.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { formatShortAddress } from "@/lib/canvas/format-address";
import { assignSlots, CANVAS_SLOTS, preferredSlotIndex } from "@/lib/canvas/slots";
import {
  isEventVisibleByAge,
  LIVE_OBJECT_MAX_AGE_MS,
  selectVisibleLiveEvents,
} from "@/lib/canvas/visible-events";
import type { PublicEvent } from "@/lib/events/types";

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

describe("selectVisibleLiveEvents / age window", () => {
  it("1. events older than 90s are excluded", () => {
    const events = [
      event({ id: "aaaaaaaa-bbbb-cccc-dddd-000000000001", occurredAt: isoAgo(90_001) }),
    ];
    assert.deepEqual(selectVisibleLiveEvents(events, NOW, 6), []);
  });

  it("2. event exactly 90s old is included", () => {
    const e = event({
      id: "aaaaaaaa-bbbb-cccc-dddd-000000000002",
      occurredAt: isoAgo(LIVE_OBJECT_MAX_AGE_MS),
    });
    assert.equal(isEventVisibleByAge(e, NOW), true);
    assert.equal(selectVisibleLiveEvents([e], NOW, 6).length, 1);
  });

  it("3. event >90s excluded", () => {
    const e = event({
      id: "aaaaaaaa-bbbb-cccc-dddd-000000000003",
      occurredAt: isoAgo(LIVE_OBJECT_MAX_AGE_MS + 1),
    });
    assert.equal(isEventVisibleByAge(e, NOW), false);
  });

  it("4. newest max 6 selected", () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      event({
        id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`,
        occurredAt: isoAgo(i * 1000),
        newBuyers: i + 1,
      }),
    );
    const visible = selectVisibleLiveEvents(events, NOW, 6);
    assert.equal(visible.length, 6);
    assert.equal(visible[0]!.id, "aaaaaaaa-bbbb-cccc-dddd-000000000000");
    assert.equal(visible[5]!.id, "aaaaaaaa-bbbb-cccc-dddd-000000000005");
  });

  it("5. deterministic ordering by occurredAt then id", () => {
    const a = event({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      occurredAt: isoAgo(1000),
    });
    const b = event({
      id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
      occurredAt: isoAgo(1000),
    });
    const c = event({
      id: "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee",
      occurredAt: isoAgo(500),
    });
    const visible = selectVisibleLiveEvents([a, b, c], NOW, 6);
    assert.deepEqual(
      visible.map((e) => e.id),
      [c.id, b.id, a.id],
    );
  });

  it("12. initial old history produces zero objects", () => {
    const history = Array.from({ length: 20 }, (_, i) =>
      event({
        id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`,
        occurredAt: isoAgo(120_000 + i * 1000),
      }),
    );
    assert.deepEqual(selectVisibleLiveEvents(history, NOW, 6), []);
  });

  it("11. visible objects disappear when age tick passes 90s", () => {
    const e = event({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      occurredAt: isoAgo(89_000),
    });
    assert.equal(selectVisibleLiveEvents([e], NOW, 6).length, 1);
    const later = NOW + 2_000;
    assert.equal(selectVisibleLiveEvents([e], later, 6).length, 0);
  });
});

describe("assignSlots", () => {
  it("6. deterministic slot assignment", () => {
    const e = event({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      occurredAt: isoAgo(1000),
    });
    const a = assignSlots([e]);
    const b = assignSlots([e]);
    assert.deepEqual(a, b);
    assert.equal(a[0]!.slot.id, CANVAS_SLOTS[preferredSlotIndex(e.id, CANVAS_SLOTS.length)]!.id);
  });

  it("7. no duplicate slot among visible set", () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      event({
        id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`,
        occurredAt: isoAgo(i * 500),
      }),
    );
    const slotted = assignSlots(events);
    const slotIds = slotted.map((s) => s.slot.id);
    assert.equal(new Set(slotIds).size, slotIds.length);
    assert.equal(slotted.length, 6);
  });
});

describe("formatShortAddress / clipboard", () => {
  it("8. short address formatter", () => {
    assert.equal(
      formatShortAddress("0xABCDEF0123456789ABCDEF0123456789ABCDEF01"),
      "0xabcd…ef01",
    );
  });

  it("9. full address copied, not shortened address", async () => {
    const full = "0xabcdef0123456789abcdef0123456789abcdef01";
    let written = "";
    const ok = await copyTextQuiet(full, async (value) => {
      written = value;
    });
    assert.equal(ok, true);
    assert.equal(written, full);
    assert.equal(written.includes("…"), false);
  });

  it("10. clipboard failure does not throw into UI", async () => {
    const ok = await copyTextQuiet("0xabcdef0123456789abcdef0123456789abcdef01", async () => {
      throw new Error("denied");
    });
    assert.equal(ok, false);
  });
});
