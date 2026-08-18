/**
 * Shared proportional resize session — uniform scale, last pointerup sample.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginObjectScaleResize,
  clampObjectScale,
  finishObjectScaleResize,
  moveObjectScaleResize,
  objectScaleFromCornerDelta,
} from "@/lib/canvas/object-scale-resize";

describe("object scale resize session", () => {
  it("clamps invalid and out-of-range scales", () => {
    assert.equal(clampObjectScale(1, 0.5, 3), 1);
    assert.equal(clampObjectScale(0, 0.5, 3), 0.5);
    assert.equal(clampObjectScale(9, 0.5, 3), 3);
    assert.equal(clampObjectScale(Number.NaN, 0.5, 3), 1);
  });

  it("preserves aspect by applying a uniform scale", () => {
    const next = objectScaleFromCornerDelta({
      startWidthPx: 100,
      startHeightPx: 50,
      startScale: 1,
      deltaX: 100,
      deltaY: 0,
      minScale: 0.25,
      maxScale: 8,
    });
    assert.equal(next, 2);
    assert.equal((100 * next) / (50 * next), 2);
  });

  it("shrinks when the pointer moves toward the origin", () => {
    const next = objectScaleFromCornerDelta({
      startWidthPx: 100,
      startHeightPx: 100,
      startScale: 1,
      deltaX: -40,
      deltaY: -40,
      minScale: 0.25,
      maxScale: 8,
    });
    assert.equal(next, 0.6);
  });

  it("pointerup commits the final sample; pointercancel keeps last move", () => {
    const gesture = beginObjectScaleResize({
      pointerId: 4,
      clientX: 200,
      clientY: 200,
      scale: 1,
      widthPx: 80,
      heightPx: 40,
      minScale: 0.5,
      maxScale: 4,
    });
    const moved = moveObjectScaleResize(gesture, {
      pointerId: 4,
      deltaX: 40,
      deltaY: 20,
    });
    assert.ok(moved);
    assert.equal(moved!.scale, 1.5);

    const committed = finishObjectScaleResize(moved!, {
      type: "pointerup",
      pointerId: 4,
      deltaX: 80,
      deltaY: 40,
    });
    assert.equal(committed, 2);

    const cancelled = finishObjectScaleResize(moved!, {
      type: "pointercancel",
      pointerId: 4,
      deltaX: 0,
      deltaY: 0,
    });
    assert.equal(cancelled, 1.5);
  });

  it("ignores a mismatched pointer id", () => {
    const gesture = beginObjectScaleResize({
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      scale: 1,
      widthPx: 40,
      heightPx: 40,
      minScale: 0.5,
      maxScale: 4,
    });
    assert.equal(
      moveObjectScaleResize(gesture, { pointerId: 2, deltaX: 40, deltaY: 40 }),
      null,
    );
    assert.equal(
      finishObjectScaleResize(gesture, {
        type: "pointerup",
        pointerId: 2,
        deltaX: 40,
        deltaY: 40,
      }),
      1,
    );
  });
});
