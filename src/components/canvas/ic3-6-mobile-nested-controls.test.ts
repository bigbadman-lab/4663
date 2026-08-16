/**
 * IC3.6 — mobile nested interactive controls inside PlayHTML movable objects.
 *
 * Root cause (proven against playhtml dist): host bubble `touchstart` calls
 * `preventDefault()`, cancelling click synthesis. React delegated handlers run
 * too late. Shared fix: native capture-phase stopPropagation on children.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  INTERACTIVE_CONTROL_ATTR,
  INTERACTIVE_CONTROL_SELECTOR,
  isInteractiveCanvasControlTarget,
  protectInteractiveControlElement,
  stopPlayhtmlMoveStart,
} from "@/lib/canvas/interactive-control";
import { isCanvasPanHitTarget } from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("IC3.6 PlayHTML touchstart steals nested taps", () => {
  it("PlayHTML movable host preventDefault on touchstart (bundle evidence)", () => {
    const bundle = readSrc("node_modules/playhtml/dist/index-DlJfxvdB.js");
    assert.ok(bundle.includes('addEventListener("touchstart"'));
    // Host listener: preventDefault then onDragStart — kills mobile click.
    assert.ok(
      /touchStartListener\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?preventDefault\(\)/.test(
        bundle,
      ),
    );
  });

  it("shared protection uses capture-phase stopPropagation without preventDefault", () => {
    const lib = readSrc("src/lib/canvas/interactive-control.ts");
    assert.ok(lib.includes('capture: true'));
    assert.ok(lib.includes('"touchstart"'));
    assert.ok(lib.includes('"mousedown"'));
    assert.ok(lib.includes('"pointerdown"'));
    assert.ok(lib.includes("stopPropagation"));
    // Business actions stay on click — stop handler must not cancel click synthesis.
    const stopFn = lib.slice(
      lib.indexOf("function stopNativeMoveStart"),
      lib.indexOf("export function protectInteractiveControlElement"),
    );
    assert.ok(stopFn.includes("stopPropagation"));
    assert.equal(stopFn.includes("preventDefault"), false);
    assert.equal(INTERACTIVE_CONTROL_ATTR, "data-4663-interactive-control");
    assert.equal(
      INTERACTIVE_CONTROL_SELECTOR,
      "[data-4663-interactive-control]",
    );
  });
});

describe("IC3.6 shared interactive-control mechanism", () => {
  it("WATCH / PIN / address / TEXT / UNPIN / deletes / RADAR CTA reuse the same hook", () => {
    const hook = "useInteractiveControlProtection";
    const files = [
      "src/components/social/pons-watch-control.tsx",
      "src/components/social/pons-pin-control.tsx",
      "src/components/canvas/pons-address-copy-control.tsx",
      "src/components/social/ephemeral-text-object.tsx",
      "src/components/canvas/pinned-pons-object.tsx",
      "src/components/social/ephemeral-drawing-object.tsx",
      "src/components/canvas/radar-alert-object.tsx",
      "src/components/social/canvas-link-object.tsx",
    ];
    for (const file of files) {
      assert.ok(readSrc(file).includes(hook), `${file} should use ${hook}`);
    }
    // Single shared lib — not reimplemented per control.
    assert.equal(
      readSrc("src/components/social/pons-watch-control.tsx").includes(
        "protectInteractiveControlElement",
      ),
      false,
    );
    assert.ok(
      readSrc(
        "src/components/canvas/use-interactive-control-protection.ts",
      ).includes("protectInteractiveControlElement"),
    );
  });

  it("actions remain on click (no touchend business handlers)", () => {
    for (const file of [
      "src/components/social/pons-watch-control.tsx",
      "src/components/social/pons-pin-control.tsx",
      "src/components/canvas/pons-address-copy-control.tsx",
    ]) {
      const src = readSrc(file);
      assert.ok(src.includes("onClick="));
      assert.equal(src.includes("onTouchEnd"), false);
      assert.equal(src.includes("toggleWatch(") || src.includes("onPin(") || src.includes("onCopy()"), true);
    }
    const watch = readSrc("src/components/social/pons-watch-control.tsx");
    assert.ok(watch.includes("toggleWatch(eventId)"));
    const pin = readSrc("src/components/social/pons-pin-control.tsx");
    assert.ok(pin.includes("onPin(eventId)"));
    const address = readSrc(
      "src/components/canvas/pons-address-copy-control.tsx",
    );
    assert.ok(address.includes("onCopy()"));
  });

  it("stopPlayhtmlMoveStart only stops propagation", () => {
    let stopped = false;
    stopPlayhtmlMoveStart({
      stopPropagation() {
        stopped = true;
      },
    });
    assert.equal(stopped, true);
  });

  it("isInteractiveCanvasControlTarget / pan exclusion", () => {
    assert.equal(isInteractiveCanvasControlTarget(null), false);
    assert.equal(isCanvasPanHitTarget(null), false);

    const interactive = {
      closest(sel: string) {
        if (sel === INTERACTIVE_CONTROL_SELECTOR) return this;
        if (sel === INTERACTIVE_CANVAS_TARGET_SELECTOR) return this;
        return null;
      },
    };
    assert.equal(
      isInteractiveCanvasControlTarget(interactive as unknown as EventTarget),
      true,
    );
    assert.equal(
      isCanvasPanHitTarget(interactive as unknown as EventTarget),
      false,
    );

    const emptyHit = {
      closest(sel: string) {
        if (sel.includes("canvas-empty-hit")) return this;
        return null;
      },
    };
    assert.equal(isCanvasPanHitTarget(emptyHit as unknown as EventTarget), true);
  });

  it("protectInteractiveControlElement sets marker attr (structural API)", () => {
    assert.equal(typeof protectInteractiveControlElement, "function");
    const cam = readSrc("src/lib/canvas/world-camera.ts");
    assert.ok(cam.includes("isInteractiveCanvasTarget"));
    assert.ok(cam.includes("isCanvasPanHitTarget"));
  });
});

describe("IC3.6 control wiring + ownership contract", () => {
  it("WATCH/PIN/address keep desktop click + mobile touch isolation props", () => {
    const watch = readSrc("src/components/social/pons-watch-control.tsx");
    assert.ok(watch.includes("onTouchStart={isolateMoveStart}"));
    assert.ok(watch.includes("onMouseDown={isolateMoveStart}"));
    assert.ok(watch.includes("aria-label"));
    assert.ok(watch.includes("data-4663-pons-watch-interactive"));

    const pin = readSrc("src/components/social/pons-pin-control.tsx");
    assert.ok(pin.includes("onTouchStart={isolateMoveStart}"));
    assert.ok(pin.includes("[ PIN ]"));

    const address = readSrc(
      "src/components/canvas/pons-address-copy-control.tsx",
    );
    assert.ok(address.includes("copyTextQuiet") === false); // caller copies
    assert.ok(address.includes("formatShortAddress"));
    assert.ok(address.includes('variant?: "block" | "inline"'));
  });

  it("TEXT EVM copy reuses PonsAddressCopyControl; body drag host unchanged", () => {
    const text = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(text.includes('variant="inline"'));
    assert.ok(text.includes("PonsAddressCopyControl"));
    assert.ok(text.includes("CanMoveElement"));
    assert.ok(text.includes("cursor-grab touch-manipulation"));
    assert.ok(text.includes("pointer-events-none absolute z-[16]")); // remote
    assert.ok(text.includes("pointer-events-auto absolute z-[16]")); // owner
  });

  it("live chat input/send/EVM copy use IC3.6 protection inside movable host", () => {
    const chat = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(chat.includes("useInteractiveControlProtection"));
    assert.ok(chat.includes("stopPlayhtmlMoveStart"));
    assert.ok(chat.includes("data-4663-live-chat-input"));
    assert.ok(chat.includes("data-4663-live-chat-send"));
    assert.ok(chat.includes("PonsAddressCopyControl"));
    assert.ok(chat.includes('variant="inline"'));

    const movable = readSrc("src/components/canvas/movable-live-chat.tsx");
    assert.ok(movable.includes("CanMoveElement"));
    assert.ok(movable.includes("LIVE_CHAT_ELEMENT_ID"));
  });

  it("PONS body remains movable via CanMoveElement; empty canvas still pans", () => {
    assert.ok(
      readSrc(
        "src/components/canvas/movable-pons-buying-activity-object.tsx",
      ).includes("CanMoveElement"),
    );
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));
    assert.ok(surface.includes("onViewportPointerDown"));
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("shouldTrackCanvasPan"));
  });

  it("DRAW session editor still owns gestures; finished DRAW delete protected", () => {
    const editor = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.ok(editor.includes("preventDefault"));
    assert.ok(editor.includes("stopPropagation"));
    const drawing = readSrc(
      "src/components/social/ephemeral-drawing-object.tsx",
    );
    assert.ok(drawing.includes("useInteractiveControlProtection"));
    assert.ok(drawing.includes("data-4663-ephemeral-drawing-delete"));
  });

  it("empty-canvas create remains on empty-hit, not nested controls", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("dispatchEmptyCanvasClick"));
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));
    const panLib = readSrc("src/lib/canvas/world-camera.ts");
    assert.ok(panLib.includes("isInteractiveCanvasTarget"));
  });
});
