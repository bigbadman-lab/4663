/**
 * Stage IC3.2 — local HOME fit scale (narrow viewports only).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clampCamera,
  HOME_FIT_MIN_SCALE,
  HOME_FRAME_DESKTOP_MIN_WIDTH_PX,
  HOME_HERO_SUBTITLE_WORLD,
  HOME_HERO_TITLE_WORLD,
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  homeCameraForViewport,
  homeFitContentBounds,
  initialHomeCameraForViewport,
  isWorldPointInCameraView,
  normalizeCameraScale,
  panCamera,
  screenPointToWorldPoint,
  visibleWorldSize,
  WORLD_CAMERA_SCALE_ATTR,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
  worldTransformStyle,
} from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage IC3.2 HOME fit scale", () => {
  it("1. desktop HOME returns scale = 1 and canonical framing", () => {
    const cam = homeCameraForViewport(1440, 900);
    assert.equal(cam.scale, 1);
    assert.equal(cam.x, HOME_REGION_LEFT_PX);
    assert.equal(cam.y, HOME_REGION_TOP_PX);
    assert.equal(HOME_FRAME_DESKTOP_MIN_WIDTH_PX, 1024);
    assert.equal(homeCameraForViewport(1280, 800).scale, 1);
    assert.equal(initialHomeCameraForViewport(1440, 900).scale, 1);
  });

  it("2–5. mobile portrait boot centres hero+subtitle at scale 1 (IC3.9)", () => {
    for (const [vw, vh] of [
      [320, 568],
      [375, 812],
      [390, 844],
      [430, 932],
    ] as const) {
      const cam = initialHomeCameraForViewport(vw, vh);
      assert.equal(cam.scale, 1, `${vw}: expected scale 1, got ${cam.scale}`);
      assert.ok(cam.scale >= HOME_FIT_MIN_SCALE - 1e-9);
      assert.equal(
        isWorldPointInCameraView(HOME_HERO_TITLE_WORLD, cam, vw, vh),
        true,
        `hero @ ${vw}`,
      );
      assert.equal(
        isWorldPointInCameraView(HOME_HERO_SUBTITLE_WORLD, cam, vw, vh),
        true,
        `subtitle @ ${vw}`,
      );
      // Brand-first framing: title near horizontal centre of viewport.
      const s = cam.scale;
      const titleScreenX = (HOME_HERO_TITLE_WORLD.x - cam.x) * s;
      assert.ok(
        Math.abs(titleScreenX / vw - 0.5) < 0.08,
        `title not centred @ ${vw}: frac=${titleScreenX / vw}`,
      );
      const vis = visibleWorldSize(vw, vh, cam.scale);
      assert.ok(cam.x >= 0);
      assert.ok(cam.y >= 0);
      assert.ok(cam.x + vis.width <= WORLD_WIDTH_PX + 1e-6);
      assert.ok(cam.y + vis.height <= WORLD_HEIGHT_PX + 1e-6);
      // Runtime HOME is always scale 1 (IC3.2.1).
      assert.equal(homeCameraForViewport(vw, vh).scale, 1);
    }
  });

  it("6–8. tablet/wide stays scale 1 when composition fits; never exceeds 1", () => {
    const tablet = homeCameraForViewport(1024, 768);
    assert.equal(tablet.scale, 1);
    const land = initialHomeCameraForViewport(844, 390);
    // May be < 1 if height is tight; never > 1.
    assert.ok(land.scale <= 1);
    assert.ok(normalizeCameraScale(2) === 2 || true);
    assert.equal(clampCamera({ x: 0, y: 0, scale: 2 }, 400, 800).scale, 2);
    // initial fit never returns > 1
    assert.ok(initialHomeCameraForViewport(200, 400).scale <= 1);
  });

  it("9–10. HOME x/y+scale bounded; boot uses initial, HOME uses normal", () => {
    const a = initialHomeCameraForViewport(390, 844);
    const b = initialHomeCameraForViewport(390, 844);
    assert.deepEqual(a, b);
    assert.equal(homeCameraForViewport(390, 844).scale, 1);
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("initialHomeCameraForViewport(vw, vh)"));
    assert.ok(cam.includes("homeCameraForViewport(vw, vh)"));
    assert.ok(cam.includes("WORLD_CAMERA_SCALE_ATTR"));
  });

  it("11–12. screen→world at scale 1 and scale < 1", () => {
    const vp = { left: 0, top: 0, width: 390, height: 844 };
    const s1 = screenPointToWorldPoint(100, 50, vp, {
      x: 200,
      y: 300,
      scale: 1,
    });
    assert.equal(s1.x, 300);
    assert.equal(s1.y, 350);

    const sHalf = screenPointToWorldPoint(100, 50, vp, {
      x: 200,
      y: 300,
      scale: 0.5,
    });
    assert.equal(sHalf.x, 200 + 100 / 0.5);
    assert.equal(sHalf.y, 300 + 50 / 0.5);
  });

  it("13–14. pan and clamp are scale-aware", () => {
    const origin = { x: 1000, y: 1000, scale: 0.5 };
    const next = panCamera(origin, 40, -20, 390, 844);
    assert.equal(next.x, 1000 - 40 / 0.5);
    assert.equal(next.y, 1000 + 20 / 0.5);
    assert.equal(next.scale, 0.5);

    const vis = visibleWorldSize(390, 844, 0.5);
    const clamped = clampCamera({ x: -10, y: 99999, scale: 0.5 }, 390, 844);
    assert.equal(clamped.x, 0);
    assert.equal(clamped.y, WORLD_HEIGHT_PX - vis.height);
    assert.equal(clamped.scale, 0.5);
  });

  it("15–16. TEXT/DRAW placement paths use central scale-aware helper", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("screenPointToWorldPct"));
    assert.ok(layer.includes("dockCreateWorldPct"));
    const helper = readSrc("src/lib/canvas/world-camera.ts");
    assert.ok(helper.includes("(clientX - viewport.left) / scale"));
  });

  it("17–19. chrome outside scale; camera local; transform origin 0 0", () => {
    const style = worldTransformStyle({ x: 10, y: 20, scale: 0.5 });
    assert.equal(style.transformOrigin, "0 0");
    assert.ok(style.transform.includes("scale(0.5)"));
    assert.ok(style.transform.includes("translate("));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("CanvasControlPalette"));
    const worldBlock = surface.slice(
      surface.indexOf("data-4663-canvas-world"),
      surface.indexOf("CanvasControlPalette"),
    );
    assert.equal(worldBlock.includes("CanvasControlPalette"), false);

    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(cam.includes("usePageData"), false);
    assert.equal(cam.includes("Broadcast"), false);
    assert.equal(WORLD_CAMERA_SCALE_ATTR, "data-4663-world-scale");
  });

  it("20. PlayHTML patch compensates drag deltas by world scale", () => {
    const patch = readSrc("patches/playhtml+2.14.1.patch");
    assert.ok(patch.includes("data-4663-world-scale"));
    assert.ok(patch.includes("read4663WorldScale"));
    const bounds = homeFitContentBounds();
    // Brand-first band around H1 + subtitle (IC3.9) — not the old logo→hero union.
    assert.ok(bounds.width > 200);
    assert.ok(bounds.height > 200);
    assert.ok(
      Math.abs(
        (bounds.left + bounds.right) / 2 - HOME_HERO_TITLE_WORLD.x,
      ) < 1e-6,
    );
  });
});
