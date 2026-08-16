/**
 * Empty-canvas pan gesture classification — Pointer Events, no device sniffing.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canvasPanHasClaimedPointer,
  canvasPanMovementPx,
  createCanvasPanGesture,
  shouldActivateOverlayTargetOnRelease,
  shouldPreventDefaultForCanvasPan,
  shouldPromoteCanvasPan,
  shouldTrackCanvasPan,
} from "@/lib/canvas/canvas-pan-gesture";
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX,
} from "@/lib/canvas/world-camera";

function closestMock(kind: "empty" | "button" | "button-child" | "div") {
  const buttonSelf = {
    closest(sel: string) {
      if (sel.includes("button") || sel.includes("data-4663-interactive-control")) {
        return this;
      }
      return null;
    },
  };
  if (kind === "empty") {
    return {
      closest(sel: string) {
        if (sel.includes("canvas-empty-hit") || sel.includes("world-pan-hit")) {
          return this;
        }
        return null;
      },
    };
  }
  if (kind === "button") return buttonSelf;
  if (kind === "button-child") {
    return {
      closest(sel: string) {
        if (sel.includes("button") || sel.includes("data-4663-interactive-control")) {
          return buttonSelf;
        }
        if (sel.includes("canvas-empty-hit")) return this;
        return null;
      },
    };
  }
  return {
    closest() {
      return null;
    },
  };
}

const baseDown = {
  isPrimary: true,
  button: 0,
  createUiBlocksPan: false,
  overlayInteractive: null as Element | null,
};

describe("canvas pan gesture", () => {
  it("excludes interactive targets, including nested children of buttons/links", () => {
    assert.equal(
      shouldTrackCanvasPan({
        ...baseDown,
        target: closestMock("empty") as unknown as EventTarget,
      }),
      true,
    );
    assert.equal(
      shouldTrackCanvasPan({
        ...baseDown,
        target: closestMock("button") as unknown as EventTarget,
      }),
      false,
    );
    assert.equal(
      shouldTrackCanvasPan({
        ...baseDown,
        target: closestMock("button-child") as unknown as EventTarget,
      }),
      false,
    );
    assert.equal(
      shouldTrackCanvasPan({
        ...baseDown,
        target: closestMock("empty") as unknown as EventTarget,
        overlayInteractive: closestMock("button") as unknown as Element,
      }),
      false,
    );
  });

  it("uses the same rules for mouse and touch / coarse pointers", () => {
    const empty = closestMock("empty") as unknown as EventTarget;
    assert.equal(
      shouldTrackCanvasPan({ ...baseDown, target: empty }),
      true,
    );
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
    assert.equal(mouse.active, false);
    assert.equal(touch.active, false);
    assert.equal(shouldPromoteCanvasPan(mouse, 10, 10), false);
    assert.equal(shouldPromoteCanvasPan(touch, 10, 10), false);
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

  it("pointerdown alone is not a pan; movement past threshold claims the pointer", () => {
    const gesture = createCanvasPanGesture({
      pointerId: 1,
      pointerType: "mouse",
      clientX: 0,
      clientY: 0,
    });
    assert.equal(canvasPanHasClaimedPointer(gesture), false);
    assert.equal(shouldPreventDefaultForCanvasPan(gesture), false);
    assert.equal(shouldPromoteCanvasPan(gesture, 2, 2), false);
    assert.equal(canvasPanHasClaimedPointer(gesture), false);

    assert.equal(shouldPromoteCanvasPan(gesture, CANVAS_PAN_DRAG_THRESHOLD_PX, 0), true);
    gesture.active = true;
    assert.equal(canvasPanHasClaimedPointer(gesture), true);
    assert.equal(shouldPreventDefaultForCanvasPan(gesture), true);
    assert.equal(shouldPromoteCanvasPan(gesture, 40, 40), false);
  });

  it("pointerup before threshold remains a tap; cancel does not activate overlay", () => {
    const overlay = closestMock("button") as unknown as Element;
    assert.equal(
      shouldActivateOverlayTargetOnRelease({
        overlayElement: overlay,
        pointerMovedPx: 3,
        pointerType: "touch",
        eventTarget: closestMock("empty") as unknown as EventTarget,
      }),
      true,
    );
    assert.equal(
      shouldActivateOverlayTargetOnRelease({
        overlayElement: overlay,
        pointerMovedPx: CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX,
        pointerType: "touch",
        eventTarget: closestMock("empty") as unknown as EventTarget,
      }),
      false,
    );
    assert.equal(
      canvasPanMovementPx(
        { startX: 0, startY: 0 },
        3,
        4,
      ),
      5,
    );
  });

  it("does not start pan for non-primary / non-left / create-UI blocked pointers", () => {
    const empty = closestMock("empty") as unknown as EventTarget;
    assert.equal(
      shouldTrackCanvasPan({ ...baseDown, isPrimary: false, target: empty }),
      false,
    );
    assert.equal(
      shouldTrackCanvasPan({ ...baseDown, button: 2, target: empty }),
      false,
    );
    assert.equal(
      shouldTrackCanvasPan({
        ...baseDown,
        createUiBlocksPan: true,
        target: empty,
      }),
      false,
    );
  });
});
