/**
 * Stage IC3 — mobile/touch empty-canvas pan + gesture ownership.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX,
  clampCamera,
  homeCameraForViewport,
  isCanvasPanHitTarget,
  panCamera,
  panDragThresholdPx,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage IC3 mobile pan + touch gesture ownership", () => {
  it("1–2. coarse/touch can start pan; desktop fine pointer path unchanged structurally", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(cam.includes("isDesktopPointer"), false);
    assert.equal(cam.includes("(hover: hover) and (pointer: fine)"), false);
    assert.ok(cam.includes("shouldTrackCanvasPan"));
    assert.ok(cam.includes("event.isPrimary"));
    assert.ok(cam.includes("shouldPromoteCanvasPan"));
    // Same Pointer Events model for mouse + touch.
    assert.ok(cam.includes("onViewportPointerDown"));
    assert.ok(cam.includes("setPointerCapture"));
    const downIdx = cam.indexOf("const onViewportPointerDown");
    const downFn = cam.slice(downIdx);
    assert.equal(downFn.includes("setPointerCapture"), false);
    const activeIdx = cam.indexOf("pan.active = true");
    const captureIdx = cam.indexOf("setPointerCapture", activeIdx);
    assert.ok(captureIdx > activeIdx);
    assert.ok(cam.includes("shouldPromoteCanvasPan"));
    assert.ok(cam.includes("overlayInteractiveTargetFromPoint"));
    assert.equal(cam.includes("preventDefault"), false);
    assert.ok(cam.includes("createCanvasPanFrameCoalescer"));
    assert.ok(cam.includes("panFrame.flush"));
    assert.ok(cam.includes("writeLayout: false"));
  });

  it("3–5. tap vs pan thresholds; camera bounds", () => {
    assert.equal(CANVAS_PAN_DRAG_THRESHOLD_PX, 6);
    assert.equal(CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX, 10);
    assert.equal(panDragThresholdPx("mouse"), 6);
    assert.equal(panDragThresholdPx("pen"), 6);
    assert.equal(panDragThresholdPx("touch"), 10);
    assert.equal(panDragThresholdPx(undefined), 6);

    const origin = homeCameraForViewport(1440, 900);
    const next = panCamera(origin, 40, -20, 1440, 900);
    assert.equal(next.x, origin.x - 40);
    assert.equal(next.y, origin.y + 20);

    const clamped = clampCamera({ x: -10, y: 99999, scale: 1 }, 390, 844);
    assert.equal(clamped.x, 0);
    assert.equal(clamped.y, WORLD_HEIGHT_PX - 844);
    assert.ok(clamped.x + 390 <= WORLD_WIDTH_PX);
  });

  it("6–9. object / DRAW / TEXT / control touch do not pan (hit + ownership)", () => {
    assert.equal(isCanvasPanHitTarget(null), false);

    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("createUiBlocksPan"));
    assert.ok(cam.includes("shouldTrackCanvasPan"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("touch-none"));
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));

    // Brand anchors (IC3.10) are non-movable viewport chrome.
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal(brand.includes("CanMoveElement"), false);
    assert.ok(brand.includes("pointer-events-none"));
    const pons = readSrc(
      "src/components/canvas/pons-buying-activity-object.tsx",
    );
    assert.ok(pons.includes("touch-manipulation"));
    const summoned = readSrc("src/components/canvas/summoned-pons-object.tsx");
    assert.ok(summoned.includes("touch-manipulation"));

    // DRAW owns surface with touch-none + pointer capture.
    const draw = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.ok(draw.includes("touch-none"));
    assert.ok(draw.includes("setPointerCapture"));
    assert.ok(draw.includes("stopPropagation"));

    // TEXT composer stops propagation; input remains native.
    const text = readSrc("src/components/social/ephemeral-text-composer.tsx");
    assert.ok(text.includes("stopPropagation"));
    assert.ok(text.includes("textarea"));
    assert.equal(text.includes("touch-none"), false);

    // Controls are outside the world transform / not pan hits.
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("data-4663-control-dock"));
    assert.equal(palette.includes("onViewportPointerDown"), false);
  });

  it("10–12. HOME cancels pan; camera local; no PlayHTML writes from camera", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("cancelActivePan"));
    assert.ok(cam.includes("homeCameraForViewport(vw, vh)"));
    assert.equal(cam.includes("usePageData"), false);
    assert.equal(cam.includes("setData"), false);
    assert.equal(cam.includes("Broadcast"), false);
    assert.equal(cam.includes("supabase"), false);
    assert.equal(cam.includes("fetch("), false);
  });

  it("13. orientation / viewport recalc uses current dimensions", () => {
    const portrait = homeCameraForViewport(390, 844);
    const landscape = homeCameraForViewport(844, 390);
    assert.equal(portrait.scale, 1);
    assert.equal(landscape.scale, 1);
    assert.notDeepEqual(portrait, landscape);
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("Clamp only") || cam.includes("do not reapply fitted scale") || cam.includes("do not auto-HOME on resize"));
    assert.ok(cam.includes("applyCamera(cameraRef.current)"));
  });

  it("14–15. TEXT/DRAW placement remain world-aware", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("screenPointToWorldPct"));
    assert.ok(layer.includes("dockCreateWorldPct"));
    assert.ok(layer.includes("drawingZoneOriginFromClick"));
  });

  it("16–17. Summon / PONS markers unchanged", () => {
    assert.ok(
      readSrc("src/lib/canvas/summon.ts").includes("SUMMON_MAX_EVENTS = 4"),
    );
    const movable = readSrc(
      "src/components/canvas/movable-pons-buying-activity-object.tsx",
    );
    assert.ok(movable.includes("CanMoveElement"));
    assert.ok(movable.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
  });

  it("no pinch/user-zoom/momentum introduced", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(cam.toLowerCase().includes("momentum"), false);
    assert.equal(cam.toLowerCase().includes("inertia"), false);
    assert.equal(cam.includes("worldZoom"), false);
    assert.equal(cam.includes("pinch"), false);
    assert.ok(cam.includes("isPrimary"));
  });
});
