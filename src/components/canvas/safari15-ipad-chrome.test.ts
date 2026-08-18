/**
 * Safari 15 / coarse-pointer tablet chrome hit-testing + compact classification.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  activateOverlayInteractiveTarget,
  INTERACTIVE_CANVAS_TARGET_SELECTOR,
  overlayInteractiveTargetFromPoint,
} from "@/lib/canvas/interactive-control";
import {
  isUsableCanvasPointer,
  shouldTrackCanvasPan,
} from "@/lib/canvas/canvas-pan-gesture";
import {
  isCompactCanvasChrome,
  isDesktopCanvasChrome,
} from "@/lib/canvas/canvas-chrome-layout";
import { nextViewportCameraAction } from "@/lib/canvas/viewport-client-size";
import {
  homeCameraForViewport,
  initialHomeCameraForViewport,
} from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Safari 15 coarse-pointer tablet chrome", () => {
  it("compact chrome on phone and iPad-class coarse pointers, including 1280 coarse", () => {
    const coarse = { hoverHover: false, pointerFine: false };
    const fine = { hoverHover: true, pointerFine: true };

    assert.equal(
      isCompactCanvasChrome({ ...coarse, width: 390 }),
      true,
    );
    assert.equal(
      isCompactCanvasChrome({ ...coarse, width: 768 }),
      true,
    );
    assert.equal(
      isCompactCanvasChrome({ ...coarse, width: 1024 }),
      true,
    );
    assert.equal(
      isCompactCanvasChrome({ ...coarse, width: 1180 }),
      true,
    );
    assert.equal(
      isCompactCanvasChrome({ ...coarse, width: 1280 }),
      true,
    );
    assert.equal(
      isDesktopCanvasChrome({ ...fine, width: 1280 }),
      true,
    );
    assert.equal(
      isDesktopCanvasChrome({ ...fine, width: 1440 }),
      true,
    );
  });

  it("ENTER remains a tappable overlay control above the world", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    const trigger = readSrc(
      "src/components/social/participation-enter-trigger.tsx",
    );
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    const css = readSrc("src/app/globals.css");

    assert.ok(trigger.includes("onClick={handleClick}"));
    assert.ok(trigger.includes('type="button"'));
    assert.ok(trigger.includes("touch-manipulation"));
    assert.ok(trigger.includes("data-4663-participation-enter-trigger"));

    assert.ok(chrome.includes("ParticipationEnterTrigger"));
    assert.ok(chrome.includes("data-4663-chrome-participation"));
    assert.ok(chrome.includes("pointer-events-auto"));
    assert.ok(chrome.includes("z-[2]"));
    assert.ok(chrome.includes("pointer-events-none absolute inset-0 z-20"));

    assert.ok(surface.includes("absolute inset-0 z-10"));
    assert.ok(surface.includes("onPointerDown={onViewportPointerDown}"));
    assert.equal(surface.includes("BrandAnchors"), false);

    assert.ok(css.includes("translateZ(0)"));
    assert.ok(css.includes("[data-4663-canvas-chrome]"));
    assert.ok(css.includes("[data-4663-control-dock]"));
    assert.ok(css.includes("min-height: 100vh"));
    assert.ok(css.includes("min-height: 100dvh"));
  });

  it("compact/coarse tablet layout keeps ENTER interactive while pan handlers exist", () => {
    const clicks: string[] = [];
    const enter = {
      closest(selector: string) {
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return enter;
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return chrome;
        }
        return null;
      },
      getBoundingClientRect() {
        return {
          left: 300,
          right: 420,
          top: 500,
          bottom: 544,
          width: 120,
          height: 44,
        };
      },
      click() {
        clicks.push("enter");
      },
    };
    const chrome = {
      querySelectorAll(selector: string) {
        if (selector === INTERACTIVE_CANVAS_TARGET_SELECTOR) return [enter];
        return [];
      },
    };
    const rootNode = {
      querySelectorAll(selector: string) {
        if (selector === "[data-4663-canvas-chrome], [data-4663-control-dock]") {
          return [chrome];
        }
        return [];
      },
    };

    const emptyHit = {
      closest(sel: string) {
        if (sel.includes("canvas-empty-hit") || sel.includes("world-pan-hit")) {
          return this;
        }
        return null;
      },
    };

    const hit = overlayInteractiveTargetFromPoint(
      360,
      520,
      rootNode as unknown as ParentNode,
    );
    assert.equal(hit, enter);
    assert.equal(
      shouldTrackCanvasPan({
        isPrimary: true,
        button: 0,
        createUiBlocksPan: false,
        target: emptyHit as unknown as EventTarget,
        overlayInteractive: hit as unknown as Element,
      }),
      false,
    );
    activateOverlayInteractiveTarget(hit!);
    assert.deepEqual(clicks, ["enter"]);

    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    const downIdx = cam.indexOf("const onViewportPointerDown");
    const overlayIdx = cam.indexOf("overlayInteractiveTargetFromPoint", downIdx);
    const usableIdx = cam.indexOf("isUsableCanvasPointer", downIdx);
    assert.ok(overlayIdx > downIdx);
    assert.ok(usableIdx > overlayIdx);
  });

  it("Safari 15 pointer field quirks still allow overlay + pan classification", () => {
    assert.equal(isUsableCanvasPointer({}), true);
    assert.equal(isUsableCanvasPointer({ isPrimary: undefined, button: -1 }), true);
    assert.equal(isUsableCanvasPointer({ isPrimary: true, button: 0 }), true);
    assert.equal(isUsableCanvasPointer({ isPrimary: false, button: 0 }), false);
    assert.equal(isUsableCanvasPointer({ isPrimary: true, button: 2 }), false);

    const empty = {
      closest(sel: string) {
        if (sel.includes("canvas-empty-hit") || sel.includes("world-pan-hit")) {
          return this;
        }
        return null;
      },
    };
    assert.equal(
      shouldTrackCanvasPan({
        button: -1,
        createUiBlocksPan: false,
        target: empty as unknown as EventTarget,
        overlayInteractive: null,
      }),
      true,
    );
  });

  it("0×0 first layout does not frame a 1px camera; first real iPad size HOMEs at scale 1", () => {
    assert.equal(nextViewportCameraAction(false, null), "wait");
    const first = nextViewportCameraAction(false, {
      width: 768,
      height: 1024,
    });
    assert.equal(first, "initial-home");
    const cam = initialHomeCameraForViewport(768, 1024);
    assert.equal(cam.scale, 1);
    assert.equal(homeCameraForViewport(1024, 768).scale, 1);
    assert.equal(homeCameraForViewport(1180, 820).scale, 1);
    assert.equal(
      nextViewportCameraAction(true, { width: 1024, height: 768 }),
      "clamp",
    );
  });

  it("does not sniff iPad / userAgent for chrome or camera", () => {
    for (const rel of [
      "src/components/canvas/use-canvas-camera.ts",
      "src/components/canvas/canvas-chrome.tsx",
      "src/lib/canvas/canvas-chrome-layout.ts",
      "src/lib/canvas/viewport-client-size.ts",
      "src/lib/canvas/canvas-pan-gesture.ts",
    ]) {
      const src = readSrc(rel);
      assert.equal(src.includes("iPad"), false);
      assert.equal(src.includes("userAgent"), false);
    }
  });
});
