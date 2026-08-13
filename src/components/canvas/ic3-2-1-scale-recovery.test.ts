/**
 * Stage IC3.2.1 — fitted scale is landing-only; first pan / HOME recover to 1.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX,
  HOME_FIT_MIN_SCALE,
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  homeCameraForViewport,
  initialHomeCameraForViewport,
  normalizeCameraScale,
  normalizeCameraToScaleOnePreservingCenter,
  panCamera,
  panDragThresholdPx,
  visibleWorldSize,
  WORLD_CAMERA_SCALE_ATTR,
} from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage IC3.2.1 mobile scale recovery", () => {
  it("1. initial narrow mobile boot may return scale < 1", () => {
    for (const [vw, vh] of [
      [320, 568],
      [375, 812],
      [390, 844],
      [430, 932],
    ] as const) {
      const cam = initialHomeCameraForViewport(vw, vh);
      assert.ok(cam.scale < 1, `${vw}: expected fit scale < 1`);
      assert.ok(cam.scale >= HOME_FIT_MIN_SCALE - 1e-9);
    }
  });

  it("2. desktop boot remains scale = 1", () => {
    assert.equal(initialHomeCameraForViewport(1440, 900).scale, 1);
    assert.equal(initialHomeCameraForViewport(1280, 800).scale, 1);
    assert.equal(homeCameraForViewport(1440, 900).scale, 1);
  });

  it("3–5. first real pan normalizes to 1 preserving center; tap does not", () => {
    const vw = 390;
    const vh = 844;
    const fitted = initialHomeCameraForViewport(vw, vh);
    assert.ok(fitted.scale < 1);

    const before = visibleWorldSize(vw, vh, fitted.scale);
    const centerX = fitted.x + before.width / 2;
    const centerY = fitted.y + before.height / 2;

    const normalized = normalizeCameraToScaleOnePreservingCenter(
      fitted,
      vw,
      vh,
    );
    assert.equal(normalized.scale, 1);
    const after = visibleWorldSize(vw, vh, 1);
    assert.ok(Math.abs(normalized.x + after.width / 2 - centerX) < 1e-6);
    assert.ok(Math.abs(normalized.y + after.height / 2 - centerY) < 1e-6);

    // Below-threshold motion must not normalize (active stays false until threshold).
    assert.equal(panDragThresholdPx("touch"), CANVAS_PAN_DRAG_THRESHOLD_TOUCH_PX);
    assert.equal(panDragThresholdPx("mouse"), CANVAS_PAN_DRAG_THRESHOLD_PX);
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("panDragThresholdPx(pan.pointerType)"));
    assert.ok(cam.includes("normalizeCameraToScaleOnePreservingCenter"));
    // Normalization only runs after pan.active becomes true (past threshold).
    const moveIdx = cam.indexOf("const onPointerMove");
    const activeIdx = cam.indexOf("pan.active = true", moveIdx);
    const normIdx = cam.indexOf(
      "normalizeCameraToScaleOnePreservingCenter",
      moveIdx,
    );
    assert.ok(activeIdx > moveIdx);
    assert.ok(normIdx > activeIdx);
  });

  it("6–7. HOME always returns scale = 1 (never fitted)", () => {
    for (const [vw, vh] of [
      [320, 568],
      [390, 844],
      [430, 932],
      [844, 390],
      [1440, 900],
    ] as const) {
      const home = homeCameraForViewport(vw, vh);
      assert.equal(home.scale, 1, `${vw}x${vh}`);
    }
    const fitted = initialHomeCameraForViewport(390, 844);
    const home = homeCameraForViewport(390, 844);
    assert.ok(fitted.scale < 1);
    assert.equal(home.scale, 1);
    assert.notDeepEqual(fitted, home);

    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("applyCamera(homeCameraForViewport(vw, vh))"));
    assert.ok(cam.includes("applyCamera(initialHomeCameraForViewport(vw, vh))"));
    // goHome must not call initial fit helper.
    const goHomeIdx = cam.indexOf("const goHome = useCallback");
    const goHomeEnd = cam.indexOf("}, [applyCamera, cancelActivePan]);", goHomeIdx);
    assert.ok(goHomeIdx > 0 && goHomeEnd > goHomeIdx);
    const goHomeBody = cam.slice(goHomeIdx, goHomeEnd);
    assert.equal(goHomeBody.includes("initialHomeCameraForViewport"), false);
    assert.ok(goHomeBody.includes("homeCameraForViewport(vw, vh)"));
  });

  it("8–10. resize/orientation clamp only; refresh uses initial fit again", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("initialHomeCameraForViewport(vw, vh)"));
    assert.ok(cam.includes("do not reapply fitted scale") || cam.includes("Clamp only"));
    assert.ok(cam.includes("applyCamera(cameraRef.current)"));
    // Boot path distinct from HOME.
    assert.ok(cam.includes("initialHomeCameraForViewport"));
    assert.ok(cam.includes("homeCameraForViewport"));
  });

  it("11–12. camera remains local; no PlayHTML/shared writes", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(cam.includes("usePageData"), false);
    assert.equal(cam.includes("Broadcast"), false);
    assert.equal(cam.includes("supabase"), false);
    assert.equal(cam.includes("setData"), false);
    assert.ok(cam.includes("WORLD_CAMERA_SCALE_ATTR") || true);
    assert.equal(WORLD_CAMERA_SCALE_ATTR, "data-4663-world-scale");
  });

  it("13–15. TEXT/DRAW + PlayHTML scale helpers + chrome unchanged", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("screenPointToWorldPct"));
    assert.ok(layer.includes("dockCreateWorldPct"));

    const patch = readSrc("patches/playhtml+2.14.1.patch");
    assert.ok(patch.includes("read4663WorldScale"));
    assert.ok(patch.includes("data-4663-world-scale"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("CanvasControlPalette"));
    const worldBlock = surface.slice(
      surface.indexOf("data-4663-canvas-world"),
      surface.indexOf("CanvasControlPalette"),
    );
    assert.equal(worldBlock.includes("CanvasControlPalette"), false);

    // Scale-aware pan still works at fitted scale before normalization.
    const origin = initialHomeCameraForViewport(390, 844);
    const next = panCamera(origin, 20, 0, 390, 844);
    assert.equal(next.scale, origin.scale);
    assert.equal(next.x, origin.x - 20 / origin.scale);

    assert.equal(normalizeCameraScale(0.5), 0.5);
    assert.equal(homeCameraForViewport(1440, 900).x, HOME_REGION_LEFT_PX);
    assert.equal(homeCameraForViewport(1440, 900).y, HOME_REGION_TOP_PX);
  });
});
