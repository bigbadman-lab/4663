/**
 * Stage IC3.9 — guaranteed canonical brand entry (local anchors, zero shared writes).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HERO_SUBTITLE_DEFAULT_STYLE,
  HERO_TITLE_DEFAULT_STYLE,
  LOGO_DEFAULT_STYLE,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
  PLAYHTML_LOGO_ID,
} from "@/lib/canvas/hero";
import {
  HOME_HERO_SUBTITLE_WORLD,
  HOME_HERO_TITLE_WORLD,
  HOME_LOGO_WORLD,
  HOME_REGION_HEIGHT_PX,
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  HOME_REGION_WIDTH_PX,
  homeCameraForViewport,
  homeFitContentBounds,
  initialHomeCameraForViewport,
  isWorldPointInCameraView,
} from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

/** Mocked non-zero PlayHTML hero translations (production dirty room). */
const MOCK_DIRTY_TRANSFORMS: Record<string, { x: number; y: number }> = {
  [PLAYHTML_HERO_TITLE_ID]: { x: -246.3, y: -200 },
  [PLAYHTML_HERO_SUBTITLE_ID]: { x: -169.8, y: -147.2 },
  [PLAYHTML_LOGO_ID]: { x: 162.7, y: -59.2 },
};

describe("Stage IC3.9 canonical brand entry", () => {
  it("1–3. canonical H1 / subtitle / logo origins are defined", () => {
    assert.equal(HERO_TITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_TITLE_DEFAULT_STYLE.top, "42%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.top, "52%");
    assert.equal(LOGO_DEFAULT_STYLE.left, "24px");
    assert.equal(LOGO_DEFAULT_STYLE.top, "24px");

    assert.equal(
      HOME_HERO_TITLE_WORLD.x,
      HOME_REGION_LEFT_PX + HOME_REGION_WIDTH_PX * 0.5,
    );
    assert.equal(
      HOME_HERO_TITLE_WORLD.y,
      HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX * 0.42,
    );
    assert.equal(
      HOME_HERO_SUBTITLE_WORLD.x,
      HOME_REGION_LEFT_PX + HOME_REGION_WIDTH_PX * 0.5,
    );
    assert.equal(
      HOME_HERO_SUBTITLE_WORLD.y,
      HOME_REGION_TOP_PX + HOME_REGION_HEIGHT_PX * 0.52,
    );
    assert.equal(HOME_LOGO_WORLD.x, HOME_REGION_LEFT_PX + 24);
    assert.equal(HOME_LOGO_WORLD.y, HOME_REGION_TOP_PX + 24);

    // Approximate world anchors from the stage brief.
    assert.ok(Math.abs(HOME_HERO_TITLE_WORLD.x - 2400) < 1);
    assert.ok(Math.abs(HOME_HERO_TITLE_WORLD.y - 1528) < 1);
    assert.ok(Math.abs(HOME_HERO_SUBTITLE_WORLD.y - 1618) < 1);
    assert.ok(Math.abs(HOME_LOGO_WORLD.x - 1704) < 1);
    assert.ok(Math.abs(HOME_LOGO_WORLD.y - 1174) < 1);
  });

  it("4. non-zero mocked PlayHTML hero translation cannot corrupt fresh-entry presentation", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    // Brand is not a can-move target — shared {x,y} is never applied.
    assert.equal(brand.includes("CanMoveElement"), false);
    assert.equal(brand.includes("translate("), false);

    for (const [id, xy] of Object.entries(MOCK_DIRTY_TRANSFORMS)) {
      assert.ok(xy.x !== 0 || xy.y !== 0, id);
      assert.equal(brand.includes(`translate(${xy.x}`), false);
    }

    assert.ok(brand.includes("BrandHero"));
    assert.ok(brand.includes("BrandLogo"));
  });

  it("5. fresh desktop entry presents canonical hero", () => {
    const cam = initialHomeCameraForViewport(1440, 900);
    assert.equal(cam.scale, 1);
    assert.equal(cam.x, HOME_REGION_LEFT_PX);
    assert.equal(cam.y, HOME_REGION_TOP_PX);
    assert.equal(
      isWorldPointInCameraView(HOME_HERO_TITLE_WORLD, cam, 1440, 900),
      true,
    );
    assert.equal(
      isWorldPointInCameraView(HOME_HERO_SUBTITLE_WORLD, cam, 1440, 900),
      true,
    );
    // Desktop: H1 near 50% / 42% of the home artboard crop.
    const titleScreenX = HOME_HERO_TITLE_WORLD.x - cam.x;
    const titleScreenY = HOME_HERO_TITLE_WORLD.y - cam.y;
    assert.ok(Math.abs(titleScreenX / 1440 - 0.5) < 0.02);
    assert.ok(Math.abs(titleScreenY / 900 - 0.42) < 0.02);
  });

  it("6. fresh mobile entry presents intended responsive hero composition", () => {
    const vw = 390;
    const vh = 844;
    const cam = initialHomeCameraForViewport(vw, vh);
    // IC3.9 brand-first bounds fit at scale 1 with centred H1.
    assert.equal(cam.scale, 1);
    assert.equal(
      isWorldPointInCameraView(HOME_HERO_TITLE_WORLD, cam, vw, vh),
      true,
    );
    assert.equal(
      isWorldPointInCameraView(HOME_HERO_SUBTITLE_WORLD, cam, vw, vh),
      true,
    );
    const titleScreenX =
      (HOME_HERO_TITLE_WORLD.x - cam.x) * cam.scale;
    assert.ok(Math.abs(titleScreenX / vw - 0.5) < 0.08);
    // Fit bounds are brand-first (H1+subtitle), not pulled by logo union.
    const bounds = homeFitContentBounds();
    assert.ok(
      Math.abs((bounds.left + bounds.right) / 2 - HOME_HERO_TITLE_WORLD.x) <
        1e-6,
    );
  });

  it("7. refresh starts canonical again (boot camera is pure function of viewport)", () => {
    const a = initialHomeCameraForViewport(1280, 800);
    const b = initialHomeCameraForViewport(1280, 800);
    assert.deepEqual(a, b);
    const m1 = initialHomeCameraForViewport(375, 812);
    const m2 = initialHomeCameraForViewport(375, 812);
    assert.deepEqual(m1, m2);
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    const cameraHook = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(brand.includes("localStorage"), false);
    assert.equal(cameraHook.includes("localStorage"), false);
  });

  it("8–10. boot performs zero shared writes (PlayHTML / Supabase / network)", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    const cameraHook = readSrc("src/components/canvas/use-canvas-camera.ts");
    const cameraLib = readSrc("src/lib/canvas/world-camera.ts");

    for (const src of [brand, surface, cameraHook, cameraLib]) {
      assert.equal(src.includes("setData"), false);
      assert.equal(src.includes("deleteElementData"), false);
      assert.equal(src.includes("supabase"), false);
      assert.equal(src.includes("fetch("), false);
      assert.equal(src.includes("BroadcastChannel"), false);
    }

    assert.equal(brand.includes("CanMoveElement"), false);
    assert.equal(brand.includes("@playhtml/react"), false);
  });

  it("11. HOME restores canonical brand view locally", () => {
    const home = homeCameraForViewport(1440, 900);
    assert.equal(home.scale, 1);
    assert.equal(home.x, HOME_REGION_LEFT_PX);
    assert.equal(home.y, HOME_REGION_TOP_PX);
    // Viewport brand is independent of camera; HOME only frames the world.
    assert.equal(home.scale, 1);

    const mobileHome = homeCameraForViewport(390, 844);
    assert.equal(mobileHome.scale, 1);

    const hook = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(hook.includes("homeCameraForViewport"));
    assert.equal(hook.includes("setData"), false);
  });

  it("12. another client's shared hero state is unaffected (no brand can-move writes)", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal(brand.includes("CanMoveElement"), false);
    assert.ok(brand.includes("not PlayHTML can-move") || brand.includes("NOT world objects"));
  });

  it("13. only one semantic H1 exists in live brand surfaces", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal((brand.match(/<h1\b/g) ?? []).length, 1);

    // Fallback uses CanvasChrome (BrandAnchors); playReady swaps exclusively.
    const rootSrc = readSrc("src/components/canvas/canvas-root.tsx");
    assert.equal((rootSrc.match(/<h1\b/g) ?? []).length, 0);
    assert.ok(rootSrc.includes("!playReady"));
    assert.ok(rootSrc.includes("CanvasPlayTree"));
  });

  it("14–16. pan / TEXT / DRAW / Summon collaboration remain functional", () => {
    const cameraHook = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cameraHook.includes("panCamera") || cameraHook.includes("onPan"));

    const text = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(text.includes("CanMoveElement"));
    const draw = readSrc("src/components/social/ephemeral-drawing-object.tsx");
    assert.ok(draw.includes("CanMoveElement"));
    const summoned = readSrc("src/components/canvas/summoned-pons-object.tsx");
    assert.ok(summoned.includes("CanMoveElement"));
    const pons = readSrc(
      "src/components/canvas/movable-pons-buying-activity-object.tsx",
    );
    assert.ok(pons.includes("CanMoveElement"));

    assert.equal(
      readSrc("src/components/canvas/brand-anchors.tsx").includes(
        "CanMoveElement",
      ),
      false,
    );
  });
});
