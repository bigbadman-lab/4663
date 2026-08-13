/**
 * Stage IC3.1 — responsive HOME framing (updated for IC3.2 fit scale).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOME_FRAME_BOTTOM_CHROME_PX,
  HOME_FRAME_DESKTOP_MIN_WIDTH_PX,
  HOME_FRAME_TOP_CHROME_PX,
  HOME_HERO_SUBTITLE_WORLD,
  HOME_HERO_TITLE_WORLD,
  HOME_LOGO_WORLD,
  HOME_REGION_HEIGHT_PX,
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  HOME_REGION_WIDTH_PX,
  homeCameraForViewport,
  initialHomeCameraForViewport,
  isWorldPointInCameraView,
  visibleWorldSize,
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

function assertInWorldBounds(
  cam: { x: number; y: number; scale: number },
  vw: number,
  vh: number,
) {
  const vis = visibleWorldSize(vw, vh, cam.scale);
  assert.ok(cam.x >= 0);
  assert.ok(cam.y >= 0);
  assert.ok(cam.x + vis.width <= WORLD_WIDTH_PX + 1e-6);
  assert.ok(cam.y + vis.height <= WORLD_HEIGHT_PX + 1e-6);
}

describe("Stage IC3.1 responsive HOME framing", () => {
  it("1. desktop HOME remains canonical center-on-artboard", () => {
    const cam = homeCameraForViewport(1440, 900);
    assert.equal(cam.scale, 1);
    assert.equal(cam.x, HOME_REGION_LEFT_PX);
    assert.equal(cam.y, HOME_REGION_TOP_PX);

    const wide = homeCameraForViewport(1280, 800);
    assert.equal(wide.scale, 1);
    assert.equal(
      wide.x,
      HOME_REGION_LEFT_PX + HOME_REGION_WIDTH_PX / 2 - 640,
    );
    assert.equal(
      wide.y,
      HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX / 2 - 400,
    );
    assert.ok(HOME_FRAME_DESKTOP_MIN_WIDTH_PX === 1024);
  });

  it("2–5. mobile portrait boot uses scale 1 home-centred crop (IC3.10)", () => {
    for (const [vw, vh] of [
      [320, 568],
      [375, 812],
      [390, 844],
      [430, 932],
    ] as const) {
      const cam = initialHomeCameraForViewport(vw, vh);
      assertInWorldBounds(cam, vw, vh);
      assert.equal(cam.scale, 1);
      const homeCenterX = HOME_REGION_LEFT_PX + HOME_REGION_WIDTH_PX / 2;
      const titleScreenX = (homeCenterX - cam.x) * cam.scale;
      assert.ok(
        Math.abs(titleScreenX / vw - 0.5) < 0.08,
        `home centre at ${vw}x${vh}`,
      );
      assert.equal(homeCameraForViewport(vw, vh).scale, 1);
    }
  });

  it("3. home artboard centre visible on tablet / landscape-capable sizes", () => {
    for (const [vw, vh] of [
      [768, 1024],
      [820, 1180],
      [844, 390],
    ] as const) {
      const cam = initialHomeCameraForViewport(vw, vh);
      assert.equal(cam.scale, 1);
      const homeCenter = {
        x: HOME_REGION_LEFT_PX + HOME_REGION_WIDTH_PX / 2,
        y: HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX / 2,
      };
      assert.equal(
        isWorldPointInCameraView(homeCenter, cam, vw, vh),
        true,
        `home centre in view at ${vw}x${vh}`,
      );
      void HOME_LOGO_WORLD;
      void HOME_HERO_TITLE_WORLD;
      void HOME_HERO_SUBTITLE_WORLD;
    }
  });

  it("6–9. phone widths + tablet/landscape produce bounded cameras", () => {
    for (const [vw, vh] of [
      [320, 568],
      [375, 812],
      [390, 844],
      [430, 932],
      [768, 1024],
      [1024, 768],
      [844, 390],
    ] as const) {
      assertInWorldBounds(homeCameraForViewport(vw, vh), vw, vh);
      assertInWorldBounds(initialHomeCameraForViewport(vw, vh), vw, vh);
      assert.equal(homeCameraForViewport(vw, vh).scale, 1);
    }
  });

  it("10–11. HOME after resize uses normal helper; boot uses initial", () => {
    const a = homeCameraForViewport(390, 844);
    const b = homeCameraForViewport(390, 844);
    assert.deepEqual(a, b);
    assert.equal(a.scale, 1);

    const afterRotate = homeCameraForViewport(844, 390);
    assert.notDeepEqual(a, afterRotate);
    assert.equal(afterRotate.scale, 1);

    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("homeCameraForViewport(vw, vh)"));
    assert.ok(cam.includes("initialHomeCameraForViewport(vw, vh)"));
    assert.ok(cam.includes("viewport?.clientWidth"));
    assert.ok(cam.includes("cancelActivePan"));
  });

  it("12–14. bounds + shared anchors unchanged + camera local only", () => {
    assert.equal(HOME_LOGO_WORLD.x, HOME_REGION_LEFT_PX + 24);
    assert.equal(HOME_LOGO_WORLD.y, HOME_REGION_TOP_PX + 24);
    assert.equal(HOME_HERO_TITLE_WORLD.x, HOME_REGION_LEFT_PX + 720);
    assert.equal(
      HOME_HERO_TITLE_WORLD.y,
      HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX * 0.42,
    );
    assert.equal(HOME_HERO_SUBTITLE_WORLD.x, HOME_REGION_LEFT_PX + 720);
    assert.equal(
      HOME_HERO_SUBTITLE_WORLD.y,
      HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX * 0.52,
    );

    const hero = readSrc("src/lib/canvas/hero.ts");
    assert.ok(hero.includes('left: "50%"'));
    assert.ok(hero.includes('top: "42%"'));
    assert.ok(hero.includes('left: "24px"'));
    assert.ok(hero.includes('top: "24px"'));

    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(cam.includes("usePageData"), false);
    assert.equal(cam.includes("setData"), false);
    assert.ok(HOME_FRAME_TOP_CHROME_PX > 0);
    assert.ok(HOME_FRAME_BOTTOM_CHROME_PX > 0);
  });

  it("15. pan helpers present; HOME fit scale is local-only framing", () => {
    const src = readSrc("src/lib/canvas/world-camera.ts");
    assert.ok(src.includes("panCamera"));
    assert.ok(src.includes("clampCamera"));
    assert.ok(src.includes("HOME_FIT_MIN_SCALE"));
    assert.ok(src.includes("homeFitContentBounds"));
    assert.ok(src.includes("scale("));
  });
});
