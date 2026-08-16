/**
 * RADAR alert object remains draggable when overlapping other PlayHTML hosts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("RADAR alert overlap drag", () => {
  it("1. RADAR object can be dragged normally", () => {
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(alert.includes("CanMoveElement"));
    assert.ok(alert.includes("cursor-grab"));
    assert.ok(alert.includes("usePlayhtmlMoveForeground"));
    assert.ok(alert.includes("onPointerDown={move.onPointerDown}"));
    assert.equal(alert.includes("ref={move.ref}"), false);
  });

  it("2. RADAR remains draggable after overlapping another PlayHTML object", () => {
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(alert.includes("PlayhtmlMoveHitFill"));
    assert.ok(alert.includes("relative -translate-x-1/2"));
    const fill = readSrc("src/components/canvas/playhtml-move-hit-fill.tsx");
    assert.ok(fill.includes("pointer-events-auto absolute inset-0"));
    assert.ok(fill.includes("data-4663-playhtml-move-hit"));
  });

  it("3. pointermove continues after crossing an overlapping object", () => {
    const hook = readSrc(
      "src/components/canvas/use-playhtml-move-foreground.ts",
    );
    const lib = readSrc("src/lib/canvas/playhtml-move-interaction.ts");
    assert.ok(hook.includes("beginPlayhtmlMoveForeground"));
    assert.ok(hook.includes("event.currentTarget"));
    assert.equal(hook.includes("useRef"), false);
    assert.ok(lib.includes("setPointerCapture"));
    const playhtml = readSrc("node_modules/playhtml/dist/index-DlJfxvdB.js");
    assert.ok(playhtml.includes('document.addEventListener("mousemove"'));
    assert.ok(playhtml.includes('document.addEventListener("touchmove"'));
  });

  it("4. repeated drag after release still works", () => {
    const hook = readSrc(
      "src/components/canvas/use-playhtml-move-foreground.ts",
    );
    assert.ok(hook.includes("releasePlayhtmlMovePointer"));
    assert.ok(hook.includes("onPointerUp"));
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(alert.includes("onPointerUp={move.onPointerUp}"));
    assert.ok(alert.includes("onPointerCancel={move.onPointerCancel}"));
  });

  it("5. active object receives/promotes interaction z-order", () => {
    const lib = readSrc("src/lib/canvas/playhtml-move-interaction.ts");
    assert.ok(lib.includes("PLAYHTML_MOVE_FOREGROUND_Z_INDEX = 50"));
    assert.ok(lib.includes("element.style.zIndex"));
    assert.ok(lib.includes("data-4663-playhtml-move-foreground"));
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(alert.includes("z-[16]"));
    assert.equal(alert.includes("z-[999999]"), false);
    assert.equal(alert.includes("z-[1000000]"), false);
  });

  it("6. pointer capture is released on pointerup", () => {
    const hook = readSrc(
      "src/components/canvas/use-playhtml-move-foreground.ts",
    );
    const up = hook.slice(
      hook.indexOf("const onPointerUp"),
      hook.indexOf("const onPointerCancel"),
    );
    assert.ok(up.includes("releasePlayhtmlMovePointer"));
  });

  it("7. pointer capture is released on pointercancel", () => {
    const hook = readSrc(
      "src/components/canvas/use-playhtml-move-foreground.ts",
    );
    const cancel = hook.slice(hook.indexOf("const onPointerCancel"));
    assert.ok(cancel.includes("releasePlayhtmlMovePointer"));
  });

  it("8. [ TAKE A LOOK ] remains clickable and open-only", () => {
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    const ctaIdx = alert.indexOf("data-4663-radar-alert-open");
    assert.ok(ctaIdx > 0);
    const cta = alert.slice(Math.max(0, ctaIdx - 450), ctaIdx + 700);
    assert.ok(cta.includes("onOpen(alert.tokenAddress)"));
    assert.ok(cta.includes("stopPlayhtmlMoveStart"));
    assert.ok(cta.includes("relative z-[1]"));
    assert.equal(cta.includes("onDismiss"), false);
    assert.equal(alert.includes("dismissRadarAlert"), false);
  });

  it("9. other interactive controls remain clickable", () => {
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(alert.includes("useInteractiveControlProtection"));
    const lib = readSrc("src/lib/canvas/playhtml-move-interaction.ts");
    assert.ok(lib.includes("isInteractiveCanvasTarget"));
    assert.ok(lib.includes("shouldBeginPlayhtmlMoveForeground"));
  });

  it("10. another movable object still remains draggable after the fix", () => {
    const pons = readSrc(
      "src/components/canvas/movable-pons-monitoring-object.tsx",
    );
    assert.ok(pons.includes("CanMoveElement"));
    assert.ok(pons.includes("usePlayhtmlMoveForeground"));
    assert.ok(pons.includes("onPointerDown={move.onPointerDown}"));
    assert.equal(pons.includes("ref={move.ref}"), false);
    const content = readSrc(
      "src/components/canvas/pons-monitoring-object.tsx",
    );
    assert.ok(content.includes("PlayhtmlMoveHitFill"));
    assert.ok(content.includes("data-4663-pons-monitoring-open"));
    assert.ok(content.includes("stopPlayhtmlMoveStart"));
    assert.ok(content.includes("relative z-[1]"));
    const terminal = readSrc(
      "src/components/canvas/movable-pons-monitor-terminal.tsx",
    );
    assert.ok(terminal.includes("CanMoveElement"));
    assert.ok(terminal.includes("usePlayhtmlMoveForeground"));
    assert.ok(
      readSrc("src/components/canvas/pons-monitor-terminal.tsx").includes(
        "PlayhtmlMoveHitFill",
      ),
    );
  });
});
