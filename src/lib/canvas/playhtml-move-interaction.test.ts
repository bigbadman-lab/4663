/**
 * PlayHTML movable-host overlap / drag interaction.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INTERACTIVE_CONTROL_ATTR,
} from "@/lib/canvas/interactive-control";
import {
  PLAYHTML_DRAG_HANDLE_SELECTOR,
  isPlayhtmlDragHandleTarget,
  playhtmlHostHasDragHandle,
} from "@/lib/canvas/playhtml-drag-handle";
import {
  PLAYHTML_MOVE_FOREGROUND_ATTR,
  PLAYHTML_MOVE_FOREGROUND_Z_INDEX,
  PLAYHTML_MOVE_HIT_ATTR,
  applyPlayhtmlMoveForeground,
  beginPlayhtmlMoveForeground,
  capturePlayhtmlMovePointer,
  releasePlayhtmlMovePointer,
  shouldBeginPlayhtmlMoveForeground,
} from "@/lib/canvas/playhtml-move-interaction";

function mockHost() {
  let zIndex = "";
  const attrs = new Map<string, string>();
  const captured = new Set<number>();
  return {
    style: {
      get zIndex() {
        return zIndex;
      },
      set zIndex(value: string) {
        zIndex = value;
      },
    },
    setAttribute(name: string, value: string) {
      attrs.set(name, value);
    },
    getAttribute(name: string) {
      return attrs.get(name) ?? null;
    },
    setPointerCapture(id: number) {
      captured.add(id);
    },
    hasPointerCapture(id: number) {
      return captured.has(id);
    },
    releasePointerCapture(id: number) {
      captured.delete(id);
    },
    captured,
  };
}

describe("PlayHTML move foreground helpers", () => {
  it("skips protected interactive controls", () => {
    assert.equal(shouldBeginPlayhtmlMoveForeground(null), true);
    const control = {
      closest(selector: string) {
        return selector.includes(INTERACTIVE_CONTROL_ATTR) ||
          selector.includes("button")
          ? this
          : null;
      },
    };
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(control as unknown as EventTarget),
      false,
    );
    const card = {
      closest() {
        return null;
      },
    };
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(card as unknown as EventTarget),
      true,
    );
  });

  it("promotes session z-order on the active host", () => {
    const host = mockHost();
    applyPlayhtmlMoveForeground(host as unknown as HTMLElement);
    assert.equal(host.style.zIndex, String(PLAYHTML_MOVE_FOREGROUND_Z_INDEX));
    assert.equal(
      host.getAttribute(PLAYHTML_MOVE_FOREGROUND_ATTR),
      "true",
    );
    assert.equal(PLAYHTML_MOVE_FOREGROUND_Z_INDEX, 50);
  });

  it("captures the pointer for the drag and releases on pointerup", () => {
    const host = mockHost();
    capturePlayhtmlMovePointer(host as unknown as HTMLElement, 7);
    assert.equal(host.hasPointerCapture(7), true);
    releasePlayhtmlMovePointer(host as unknown as HTMLElement, 7);
    assert.equal(host.hasPointerCapture(7), false);
  });

  it("releases pointer capture on pointercancel", () => {
    const host = mockHost();
    capturePlayhtmlMovePointer(host as unknown as HTMLElement, 3);
    assert.equal(host.hasPointerCapture(3), true);
    releasePlayhtmlMovePointer(host as unknown as HTMLElement, 3);
    assert.equal(host.hasPointerCapture(3), false);
  });

  it("repeated begin after release still captures", () => {
    const host = mockHost();
    const el = host as unknown as HTMLElement;
    assert.equal(
      beginPlayhtmlMoveForeground(el, { target: null, pointerId: 1 }),
      true,
    );
    releasePlayhtmlMovePointer(el, 1);
    assert.equal(
      beginPlayhtmlMoveForeground(el, { target: null, pointerId: 2 }),
      true,
    );
    assert.equal(host.hasPointerCapture(2), true);
    assert.equal(host.style.zIndex, String(PLAYHTML_MOVE_FOREGROUND_Z_INDEX));
  });

  it("does not capture when the target is an interactive control", () => {
    const host = mockHost();
    const control = {
      closest(selector: string) {
        return selector.includes(INTERACTIVE_CONTROL_ATTR) ||
          selector.includes("button")
          ? this
          : null;
      },
    };
    assert.equal(
      beginPlayhtmlMoveForeground(host as unknown as HTMLElement, {
        target: control as unknown as EventTarget,
        pointerId: 9,
      }),
      false,
    );
    assert.equal(host.captured.size, 0);
  });

  it("hosts with a drag handle only begin move from that handle", () => {
    const handle = {
      closest(selector: string) {
        return selector === PLAYHTML_DRAG_HANDLE_SELECTOR ? this : null;
      },
    };
    const body = {
      closest() {
        return null;
      },
    };
    const host = {
      querySelector(selector: string) {
        return selector === PLAYHTML_DRAG_HANDLE_SELECTOR ? handle : null;
      },
      style: { zIndex: "" },
      setAttribute() {},
      setPointerCapture() {},
      hasPointerCapture() {
        return false;
      },
      releasePointerCapture() {},
    };
    assert.equal(playhtmlHostHasDragHandle(host as unknown as Element), true);
    assert.equal(
      isPlayhtmlDragHandleTarget(handle as unknown as EventTarget),
      true,
    );
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(
        handle as unknown as EventTarget,
        host as unknown as Element,
      ),
      true,
    );
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(
        body as unknown as EventTarget,
        host as unknown as Element,
      ),
      false,
    );
    assert.equal(
      beginPlayhtmlMoveForeground(host as unknown as HTMLElement, {
        target: body as unknown as EventTarget,
        pointerId: 3,
      }),
      false,
    );
  });

  it("hosts without a drag handle keep full-box move", () => {
    const surface = {
      closest() {
        return null;
      },
    };
    assert.equal(
      shouldBeginPlayhtmlMoveForeground(surface as unknown as EventTarget),
      true,
    );
  });

  it("capture helpers swallow setPointerCapture failure", () => {
    const host = {
      setPointerCapture() {
        throw new Error("InvalidStateError");
      },
      hasPointerCapture() {
        return false;
      },
      releasePointerCapture() {
        throw new Error("InvalidStateError");
      },
    };
    assert.doesNotThrow(() =>
      capturePlayhtmlMovePointer(host as unknown as HTMLElement, 1),
    );
    assert.doesNotThrow(() =>
      releasePlayhtmlMovePointer(host as unknown as HTMLElement, 1),
    );
  });
});

describe("PlayHTML move hit fill contract", () => {
  it("hit-fill attribute is the solid pointer target", () => {
    assert.equal(PLAYHTML_MOVE_HIT_ATTR, "data-4663-playhtml-move-hit");
  });
});

describe("PlayHTML move foreground hook", () => {
  it("uses currentTarget because CanMoveElement overwrites child refs", () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    const hook = readFileSync(
      path.join(root, "src/components/canvas/use-playhtml-move-foreground.ts"),
      "utf8",
    );
    assert.ok(hook.includes("event.currentTarget"));
    assert.equal(hook.includes("useRef"), false);
    const playhtmlReact = readFileSync(
      path.join(root, "node_modules/@playhtml/react/dist/react-playhtml.es.js"),
      "utf8",
    );
    assert.ok(playhtmlReact.includes("ref: P"));
  });
});
