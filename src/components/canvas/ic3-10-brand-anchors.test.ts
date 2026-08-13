/**
 * Stage IC3.10 — independent viewport-fixed brand anchors.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRAND_HERO_SUBTITLE,
  BRAND_HERO_TITLE,
  BRAND_LOGO_STYLE,
  HERO_SUBTITLE_DEFAULT_STYLE,
  HERO_TITLE_DEFAULT_STYLE,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
  PLAYHTML_LOGO_ID,
} from "@/lib/canvas/hero";
import {
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  homeCameraForViewport,
  homeFitScaleForViewport,
  initialHomeCameraForViewport,
} from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage IC3.10 independent brand anchors", () => {
  it("1. exactly one semantic H1", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal((brand.match(/<h1\b/g) ?? []).length, 1);
    assert.ok(brand.includes("BRAND_HERO_TITLE"));
    assert.equal(BRAND_HERO_TITLE, "A CANVAS FOR\nTHE INTERNET.");

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("BrandAnchors"));
    // Fallback uses CanvasChrome only — no second brand mount.
    const rootSrc = readSrc("src/components/canvas/canvas-root.tsx");
    assert.equal(rootSrc.includes("<BrandAnchors"), false);
    assert.ok(rootSrc.includes("CanvasChrome"));
  });

  it("2–5. H1 / subtitle / logo non-movable; no CanMoveElement", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal(brand.includes("CanMoveElement"), false);
    assert.equal(brand.includes("@playhtml/react"), false);
    assert.ok(brand.includes('data-4663-brand-anchor="title"'));
    assert.ok(brand.includes('data-4663-brand-anchor="subtitle"'));
    assert.ok(brand.includes('data-4663-brand-anchor="logo"'));
    assert.ok(brand.includes("pointer-events-none"));
  });

  it("6. no shared PlayHTML writes from brand", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal(brand.includes("setData"), false);
    assert.equal(brand.includes("deleteElementData"), false);
    assert.equal(brand.includes("supabase"), false);
  });

  it("7–9. desktop composition: centered H1/subtitle, logo top-left", () => {
    assert.equal(HERO_TITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_TITLE_DEFAULT_STYLE.top, "42%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.top, "52%");

    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("top-[42%]"));
    assert.ok(brand.includes("top-[52%]"));
    assert.ok(brand.includes("left-1/2"));
    assert.ok(brand.includes("BRAND_HERO_SUBTITLE"));
    assert.equal(
      BRAND_HERO_SUBTITLE,
      "Create, communicate and interact — with web3 capabilities.",
    );
    assert.ok(BRAND_LOGO_STYLE.left.includes("24px"));
    assert.ok(BRAND_LOGO_STYLE.top.includes("24px"));
  });

  it("10–12. mobile: same viewport anchors; logo safe-area; H1 centered", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("safe-area") || brand.includes("BRAND_LOGO_STYLE"));
    assert.ok(BRAND_LOGO_STYLE.left.includes("safe-area-inset-left"));
    assert.ok(brand.includes("left-1/2"));
    assert.ok(brand.includes("px-4"));
    // No logo-driven fit scale.
    for (const [vw, vh] of [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
    ] as const) {
      assert.equal(initialHomeCameraForViewport(vw, vh).scale, 1);
      assert.equal(homeFitScaleForViewport(vw, vh), 1);
    }
  });

  it("13. logo geometry does not bias H1 centering", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    // Logo and hero are sibling anchors — not one union box.
    assert.ok(brand.includes("BrandLogo"));
    assert.ok(brand.includes("BrandHero"));
    assert.ok(brand.includes("data-4663-brand-hero-stack"));
    // Camera fit no longer uses logo world span for scale.
    assert.equal(homeFitScaleForViewport(320, 568), 1);
  });

  it("14–15. brand outside world transform; pan/objects cannot group-drag brand", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(surface.includes("BrandAnchors"), false);
    assert.equal(surface.includes("MovableHero"), false);
    assert.equal(surface.includes("MovableLogo"), false);
    assert.ok(surface.includes("data-4663-canvas-world"));

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("BrandAnchors"));
    // Chrome is sibling of surface (outside world transform).
    const play = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.ok(play.indexOf("<CanvasChrome") < play.indexOf("<CanvasSurface"));
  });

  it("16. HOME does not mutate brand", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("homeCameraForViewport"));
    assert.equal(cam.includes("BrandAnchors"), false);
    assert.equal(cam.includes("setData"), false);
    const home = homeCameraForViewport(1440, 900);
    assert.equal(home.scale, 1);
    assert.equal(home.x, HOME_REGION_LEFT_PX);
    assert.equal(home.y, HOME_REGION_TOP_PX);
  });

  it("17. stale PlayHTML hero records do not affect render", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal(brand.includes("CanMoveElement"), false);
    assert.ok(brand.includes(PLAYHTML_HERO_TITLE_ID));
    assert.ok(brand.includes(PLAYHTML_HERO_SUBTITLE_ID));
    assert.ok(brand.includes(PLAYHTML_LOGO_ID));
    // Ids remain but are not playhtml can-move hosts.
  });

  it("18. mobile fit-scale no longer zooms out solely to include logo", () => {
    assert.equal(homeFitScaleForViewport(320, 568), 1);
    assert.equal(initialHomeCameraForViewport(390, 844).scale, 1);
    assert.deepEqual(
      initialHomeCameraForViewport(390, 844),
      homeCameraForViewport(390, 844),
    );
  });

  it("19. TEXT/DRAW/Summon/PONS remain CanMove in world", () => {
    assert.ok(
      readSrc("src/components/social/ephemeral-text-object.tsx").includes(
        "CanMoveElement",
      ),
    );
    assert.ok(
      readSrc("src/components/social/ephemeral-drawing-object.tsx").includes(
        "CanMoveElement",
      ),
    );
    assert.ok(
      readSrc("src/components/canvas/summoned-pons-object.tsx").includes(
        "CanMoveElement",
      ),
    );
    assert.ok(
      readSrc(
        "src/components/canvas/movable-pons-buying-activity-object.tsx",
      ).includes("CanMoveElement"),
    );
  });
});
