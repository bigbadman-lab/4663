/**
 * Stage 10B.7 — movable PlayHTML live PONS objects (structural).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import {
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
  PLAYHTML_LOGO_ID,
  playhtmlEventElementId,
} from "@/lib/canvas/hero";
import { assignSlots } from "@/lib/canvas/slots";
import {
  LIVE_OBJECT_MAX_AGE_MS,
  LIVE_OBJECT_MAX_VISIBLE_DESKTOP,
  LIVE_OBJECT_MAX_VISIBLE_NARROW,
} from "@/lib/canvas/visible-events";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage 10B.7 movable live PONS objects", () => {
  it("1–3. stable PlayHTML id + CanMoveElement direct DOM host", () => {
    const eventId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    assert.equal(
      playhtmlEventElementId(eventId),
      `4663-event-${eventId}`,
    );

    const movable = readSrc(
      "src/components/canvas/movable-pons-buying-activity-object.tsx",
    );
    assert.ok(movable.includes("CanMoveElement"));
    assert.ok(movable.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
    assert.ok(movable.includes("playhtmlEventElementId(event.id)"));
    assert.ok(movable.includes("<div"));
    assert.ok(movable.includes("id={playhtmlEventElementId(event.id)}"));
    // PlayHTML walks props.children — custom component as sole child throws.
    assert.equal(
      /<CanMoveElement[^>]*>\s*<PonsBuyingActivityObject\b/.test(movable),
      false,
    );
    assert.equal(movable.includes("<PonsBuyingActivityObject"), false);
    assert.ok(movable.includes("PonsBuyingActivityContent"));
    assert.ok(movable.includes("isolateAddressPointer"));
    assert.equal(PLAYHTML_CANVAS_BOUNDS_ID, "4663-canvas");

    const object = readSrc(
      "src/components/canvas/pons-buying-activity-object.tsx",
    );
    assert.ok(object.includes("playhtmlEventElementId(event.id)"));
    assert.equal(object.includes('from "@playhtml/react"'), false);
    assert.equal(object.includes("CanMoveElement bounds"), false);
  });

  it("4–6. slot % origin on outer; centering only on inner", () => {
    const movable = readSrc(
      "src/components/canvas/movable-pons-buying-activity-object.tsx",
    );
    assert.ok(movable.includes("left: `${slot.leftPct}%`"));
    assert.ok(movable.includes("top: `${slot.topPct}%`"));
    assert.ok(movable.includes("ponsBuyingActivityHostClassName(true)"));

    const source = readSrc(
      "src/components/canvas/pons-buying-activity-object.tsx",
    );
    assert.ok(source.includes("left: `${slot.leftPct}%`"));
    assert.ok(source.includes("top: `${slot.topPct}%`"));
    assert.ok(
      source.includes(
        '"absolute z-[15] cursor-grab touch-manipulation select-none active:cursor-grabbing"',
      ),
    );
    assert.equal(
      source.includes(
        '"absolute z-[15] cursor-grab touch-manipulation select-none active:cursor-grabbing -translate',
      ),
      false,
    );
    assert.ok(source.includes("-translate-x-1/2 -translate-y-1/2"));
    assert.ok(source.includes("<article"));
  });

  it("7–9. address stops move-start; still copies full address quietly", async () => {
    const source = readSrc(
      "src/components/canvas/pons-buying-activity-object.tsx",
    );
    assert.ok(source.includes("stopMoveStart={isolateAddressPointer ? stopMoveStart : undefined}"));
    assert.ok(source.includes("PonsAddressCopyControl"));
    assert.ok(source.includes("copyTextQuiet"));

    const movable = readSrc(
      "src/components/canvas/movable-pons-buying-activity-object.tsx",
    );
    assert.ok(movable.includes("isolateAddressPointer"));

    const control = readSrc(
      "src/components/canvas/pons-address-copy-control.tsx",
    );
    assert.ok(control.includes("onPointerDown={stopMoveStart}"));
    assert.ok(control.includes("onMouseDown={stopMoveStart}"));
    assert.ok(control.includes("onTouchStart={stopMoveStart}"));
    assert.ok(control.includes("stopPropagation"));
    assert.ok(control.includes("data-4663-event-address"));

    const full = "0xabcdef0123456789abcdef0123456789abcdef01";
    let written: string | undefined;
    assert.equal(
      await copyTextQuiet(full, async (value) => {
        written = value;
      }),
      true,
    );
    assert.equal(written, full);
    assert.equal(
      await copyTextQuiet(full, async () => {
        throw new Error("denied");
      }),
      false,
    );
  });

  it("PlayHTML: SUMMON and live movable both use direct DOM hosts", () => {
    const summoned = readSrc(
      "src/components/canvas/summoned-pons-object.tsx",
    );
    assert.ok(summoned.includes("CanMoveElement"));
    assert.ok(/<CanMoveElement[^>]*>\s*\{node\}/.test(summoned));
    assert.ok(summoned.includes("<div"));
    assert.ok(summoned.includes("playhtmlSummonedElementId"));

    const movable = readSrc(
      "src/components/canvas/movable-pons-buying-activity-object.tsx",
    );
    assert.ok(
      /<CanMoveElement[^>]*>\s*<div\b/.test(movable),
      "CanMoveElement must wrap a direct <div>",
    );
    // Single playhtmlEventElementId call site on the host (no nested duplicate id).
    assert.equal(
      (movable.match(/playhtmlEventElementId\(event\.id\)/g) ?? []).length,
      1,
    );
    assert.equal(movable.includes("<PonsBuyingActivityObject"), false);
    assert.equal(
      movable.includes('from "@/components/canvas/pons-buying-activity-object"'),
      true,
    );
  });

  it("10–12. lifetime, caps, and assignSlots remain unchanged", () => {
    assert.equal(LIVE_OBJECT_MAX_AGE_MS, 90_000);
    assert.equal(LIVE_OBJECT_MAX_VISIBLE_DESKTOP, 6);
    assert.equal(LIVE_OBJECT_MAX_VISIBLE_NARROW, 4);

    const slotsSource = readSrc("src/lib/canvas/slots.ts");
    assert.ok(slotsSource.includes("preferredSlotIndex"));
    assert.ok(slotsSource.includes("export function assignSlots"));

    const rootSource = readSrc("src/components/canvas/canvas-root.tsx");
    assert.ok(rootSource.includes("assignSlots"));
    assert.ok(rootSource.includes("selectVisibleLiveEvents"));
    assert.equal(typeof assignSlots, "function");
  });

  it("13–14. hero/logo ids unchanged; single PlayProvider; SSR-safe split", () => {
    assert.equal(PLAYHTML_HERO_TITLE_ID, "4663-hero-title");
    assert.equal(PLAYHTML_HERO_SUBTITLE_ID, "4663-hero-subtitle");
    assert.equal(PLAYHTML_LOGO_ID, "4663-logo");

    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.equal((playTree.match(/<PlayProvider\b/g) ?? []).length, 1);

    const rootSource = readSrc("src/components/canvas/canvas-root.tsx");
    assert.equal((rootSource.match(/<PlayProvider\b/g) ?? []).length, 0);
    assert.ok(rootSource.includes("LiveEventLayer"));
    assert.equal(rootSource.includes("MovableLiveEventLayer"), false);

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("MovableLiveEventLayer"));

    const staticLayer = readSrc("src/components/canvas/live-event-layer.tsx");
    assert.equal(staticLayer.includes("@playhtml/react"), false);
  });
});
