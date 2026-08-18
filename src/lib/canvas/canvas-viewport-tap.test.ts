/**
 * Full-viewport empty-canvas tap classification — centre, edges, corners.
 * Spatially uniform: empty-hit OR the viewport/world shell itself.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX,
  isCanvasPanHitTarget,
  panCamera,
  homeCameraForViewport,
} from "@/lib/canvas/world-camera";
import {
  createCanvasPanGesture,
  isUsableCanvasPointer,
  shouldPromoteCanvasPan,
  shouldTrackCanvasPan,
} from "@/lib/canvas/canvas-pan-gesture";
import {
  CANVAS_VIEWPORT_TAP_SAMPLES,
  viewportTapClientPoint,
} from "@/lib/canvas/canvas-viewport-tap";

function viewportTarget() {
  return {
    matches(sel: string) {
      return sel.includes("canvas-viewport");
    },
    closest() {
      return null;
    },
  };
}

function emptyHitTarget() {
  return {
    matches() {
      return false;
    },
    closest(sel: string) {
      if (sel.includes("canvas-empty-hit") || sel.includes("world-pan-hit")) {
        return this;
      }
      return null;
    },
  };
}

function buttonTarget() {
  return {
    matches() {
      return false;
    },
    closest(sel: string) {
      if (sel.includes("button") || sel.includes("data-4663-interactive-control")) {
        return this;
      }
      return null;
    },
  };
}

const viewportBox = { left: 0, top: 0, width: 390, height: 844 };

const baseDown = {
  isPrimary: true,
  button: 0,
  createUiBlocksPan: false,
  overlayInteractive: null as Element | null,
};

describe("canvas viewport tap — full usable area", () => {
  it("centre, four edges, and four corners are empty-canvas taps on the viewport shell", () => {
    const target = viewportTarget() as unknown as EventTarget;
    assert.equal(CANVAS_VIEWPORT_TAP_SAMPLES.length, 9);
    for (const sample of CANVAS_VIEWPORT_TAP_SAMPLES) {
      const point = viewportTapClientPoint(sample, viewportBox);
      assert.ok(point.clientX >= 0 && point.clientX <= viewportBox.width);
      assert.ok(point.clientY >= 0 && point.clientY <= viewportBox.height);
      assert.equal(
        shouldTrackCanvasPan({ ...baseDown, target }),
        true,
        sample.id,
      );
      assert.equal(isCanvasPanHitTarget(target), true, sample.id);
    }
  });

  it("the same points on empty-hit also start pan tracking", () => {
    const target = emptyHitTarget() as unknown as EventTarget;
    for (const sample of CANVAS_VIEWPORT_TAP_SAMPLES) {
      assert.equal(
        shouldTrackCanvasPan({ ...baseDown, target }),
        true,
        sample.id,
      );
    }
  });

  it("click/tap on an interactive child does not trigger empty-canvas action", () => {
    const target = buttonTarget() as unknown as EventTarget;
    for (const sample of CANVAS_VIEWPORT_TAP_SAMPLES) {
      void sample;
      assert.equal(
        shouldTrackCanvasPan({ ...baseDown, target }),
        false,
      );
    }
    assert.equal(
      shouldTrackCanvasPan({
        ...baseDown,
        target: emptyHitTarget() as unknown as EventTarget,
        overlayInteractive: buttonTarget() as unknown as Element,
      }),
      false,
    );
  });

  it("tiny movement remains a tap; movement past threshold becomes pan", () => {
    const mouse = createCanvasPanGesture({
      pointerId: 1,
      pointerType: "mouse",
      clientX: 10,
      clientY: 10,
    });
    const touch = createCanvasPanGesture({
      pointerId: 2,
      pointerType: "touch",
      clientX: 10,
      clientY: 10,
    });
    assert.equal(shouldPromoteCanvasPan(mouse, 10 + 5, 10), false);
    assert.equal(
      shouldPromoteCanvasPan(mouse, 10 + CANVAS_PAN_DRAG_THRESHOLD_PX, 10),
      true,
    );
    assert.equal(
      shouldPromoteCanvasPan(touch, 10 + CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX - 1, 10),
      false,
    );
    assert.equal(
      shouldPromoteCanvasPan(touch, 10 + CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX, 10),
      true,
    );
  });

  it("Safari 15 omitted isPrimary and button -1 remain usable", () => {
    assert.equal(isUsableCanvasPointer({}), true);
    assert.equal(isUsableCanvasPointer({ button: -1 }), true);
    assert.equal(isUsableCanvasPointer({ isPrimary: false }), false);
    const target = viewportTarget() as unknown as EventTarget;
    assert.equal(
      shouldTrackCanvasPan({
        createUiBlocksPan: false,
        overlayInteractive: null,
        target,
        button: -1,
      }),
      true,
    );
  });
});

describe("canvas pan camera delta", () => {
  it("pointer-down → threshold → pan delta is opposite the drag; pointerup sample is included", () => {
    const origin = homeCameraForViewport(1440, 900);
    const afterMoves = panCamera(origin, 12, -8, 1440, 900);
    assert.equal(afterMoves.x, origin.x - 12);
    assert.equal(afterMoves.y, origin.y + 8);
    const afterUp = panCamera(origin, 18, -8, 1440, 900);
    assert.equal(afterUp.x, origin.x - 18);
    assert.equal(afterUp.y, origin.y + 8);
  });
});
