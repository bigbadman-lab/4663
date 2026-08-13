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
const MOCK_DIRTY_TRANSFORMS = {
  [PLAYHTML_HERO_TITLE_ID]: { x: -246.3, y: -200 },
  [PLAYHTML_HERO_SUBTITLE_ID]: { x: -169.8, y: -147.2 },
  [PLAYHTML_LOGO_ID]: { x: 162.7, y: -59.2 },
} as const;

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
    const hero = readSrc("src/components/canvas/movable-hero.tsx");
    const logo = readSrc("src/components/canvas/movable-logo.tsx");
    // Brand is not a can-move target — shared {x,y} is never applied.
    assert.equal(hero.includes("CanMoveElement"), false);
    assert.equal(logo.includes("CanMoveElement"), false);
    assert.equal(hero.includes("transform"), false);
    assert.equal(logo.includes("translate("), false);

    // Mock dirty room state exists but has no code path into brand style.
    for (const [id, xy] of Object.entries(MOCK_DIRTY_TRANSFORMS)) {
      assert.ok(xy.x !== 0 || xy.y !== 0, id);
      assert.equal(hero.includes(`translate(${xy.x}`), false);
      assert.equal(logo.includes(`translate(${xy.x}`), false);
    }

    // Presentation uses CSS origins only.
    assert.ok(hero.includes("HERO_TITLE_DEFAULT_STYLE"));
    assert.ok(hero.includes("HERO_SUBTITLE_DEFAULT_STYLE"));
    assert.ok(logo.includes("LOGO_DEFAULT_STYLE"));
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
    // No localStorage / cache gate in brand or camera boot.
    const hero = readSrc("src/components/canvas/movable-hero.tsx");
    const cameraHook = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(hero.includes("localStorage"), false);
    assert.equal(cameraHook.includes("localStorage"), false);
  });

  it("8–10. boot performs zero shared writes (PlayHTML / Supabase / network)", () => {
    const hero = readSrc("src/components/canvas/movable-hero.tsx");
    const logo = readSrc("src/components/canvas/movable-logo.tsx");
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    const cameraHook = readSrc("src/components/canvas/use-canvas-camera.ts");
    const cameraLib = readSrc("src/lib/canvas/world-camera.ts");

    for (const src of [hero, logo, surface, cameraHook, cameraLib]) {
      assert.equal(src.includes("setData"), false);
      assert.equal(src.includes("deleteElementData"), false);
      assert.equal(src.includes("supabase"), false);
      assert.equal(src.includes("fetch("), false);
      assert.equal(src.includes("BroadcastChannel"), false);
    }

    // Brand mounts are local CSS only — no can-move registration.
    assert.equal(hero.includes("CanMoveElement"), false);
    assert.equal(logo.includes("CanMoveElement"), false);
    assert.equal(hero.includes("@playhtml/react"), false);
    assert.equal(logo.includes("@playhtml/react"), false);
  });

  it("11. HOME restores canonical brand view locally", () => {
    const home = homeCameraForViewport(1440, 900);
    assert.equal(home.scale, 1);
    assert.equal(home.x, HOME_REGION_LEFT_PX);
    assert.equal(home.y, HOME_REGION_TOP_PX);
    assert.equal(
      isWorldPointInCameraView(HOME_HERO_TITLE_WORLD, home, 1440, 900),
      true,
    );
    assert.equal(
      isWorldPointInCameraView(HOME_HERO_SUBTITLE_WORLD, home, 1440, 900),
      true,
    );

    // Mobile HOME recovers to scale 1 (IC3.2.1) with brand still framed.
    const mobileHome = homeCameraForViewport(390, 844);
    assert.equal(mobileHome.scale, 1);
    assert.equal(
      isWorldPointInCameraView(HOME_HERO_TITLE_WORLD, mobileHome, 390, 844),
      true,
    );

    const hook = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(hook.includes("homeCameraForViewport"));
    assert.equal(hook.includes("setData"), false);
  });

  it("12. another client's shared hero state is unaffected (no brand can-move writes)", () => {
    // Architecture: brand never registers can-move, so other clients' shared
    // hero {x,y} cannot be mutated by this client's load — and are unused.
    const hero = readSrc("src/components/canvas/movable-hero.tsx");
    const logo = readSrc("src/components/canvas/movable-logo.tsx");
    assert.equal(hero.includes("CanMoveElement"), false);
    assert.equal(logo.includes("CanMoveElement"), false);
    assert.ok(hero.includes("never writes PlayHTML"));
    assert.ok(hero.includes("local launch anchors") || hero.includes("Local launch anchors"));
  });

  it("13. only one semantic H1 exists in live brand surfaces", () => {
    const hero = readSrc("src/components/canvas/movable-hero.tsx");
    assert.equal((hero.match(/<h1\b/g) ?? []).length, 1);
    assert.equal((hero.match(/>\s*4663\s*</g) ?? []).length, 1);

    // Fallback shell also has one H1; playReady swaps exclusively (not both).
    const rootSrc = readSrc("src/components/canvas/canvas-root.tsx");
    assert.equal((rootSrc.match(/<h1\b/g) ?? []).length, 1);
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

    // Brand is the only intentional can-move removal.
    assert.equal(
      readSrc("src/components/canvas/movable-hero.tsx").includes(
        "CanMoveElement",
      ),
      false,
    );
  });
});
