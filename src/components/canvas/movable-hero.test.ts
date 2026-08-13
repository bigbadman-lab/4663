/**
 * Stage 10B.5 / IC3.10 — viewport-fixed brand hero (non-movable).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRAND_HERO_SUBTITLE,
  BRAND_HERO_TITLE,
  HERO_SUBTITLE_DEFAULT_STYLE,
  HERO_TITLE_DEFAULT_STYLE,
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
} from "@/lib/canvas/hero";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage 10B.5 / IC3.10 brand hero", () => {
  it("1–2. PlayHTML deps present; one PlayProvider on canvas play tree", () => {
    const pkg = JSON.parse(readSrc("package.json")) as {
      dependencies: Record<string, string>;
    };
    assert.ok(pkg.dependencies.playhtml);
    assert.ok(pkg.dependencies["@playhtml/react"]);

    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    const providers = playTree.match(/<PlayProvider\b/g) ?? [];
    assert.equal(providers.length, 1);
  });

  it("3–6. stable ids; brand is not CanMove; lives in chrome not world", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes(PLAYHTML_HERO_TITLE_ID));
    assert.ok(brand.includes(PLAYHTML_HERO_SUBTITLE_ID));
    assert.equal(brand.includes("CanMoveElement"), false);
    assert.ok(brand.includes('data-4663-brand-anchor="title"'));
    assert.ok(brand.includes('data-4663-brand-anchor="subtitle"'));

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("BrandAnchors"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(surface.includes("MovableHero"), false);
    assert.equal(surface.includes("BrandHero"), false);
    assert.equal(PLAYHTML_CANVAS_BOUNDS_ID, "4663-world");
  });

  it("7–8. H1 centered stack; subtitle beneath; single semantic h1", () => {
    assert.equal(HERO_TITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_TITLE_DEFAULT_STYLE.top, "42%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.top, "52%");

    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("top-[42%]"));
    assert.ok(brand.includes("top-[52%]"));
    assert.ok(brand.includes("left-1/2"));
    assert.ok(brand.includes("BRAND_HERO_TITLE"));
    assert.ok(brand.includes("BRAND_HERO_SUBTITLE"));
    assert.equal(
      BRAND_HERO_SUBTITLE,
      "Create, communicate and interact — with web3 capabilities built in.",
    );
    assert.equal(BRAND_HERO_TITLE, "A CANVAS FOR THE INTERNET.");
    assert.equal((brand.match(/<h1\b/g) ?? []).length, 1);
  });

  it("9–10. CanvasChrome hosts brand; PresenceStatus remains", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("PresenceStatus"));
    assert.ok(chrome.includes("BrandAnchors"));
  });

  it("13. no custom drag / no PlayHTML brand can-move", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    // Local COLOR/HIDE menu may dismiss on window pointerdown — not a drag path.
    assert.equal(brand.includes("onMouseDown"), false);
    assert.equal(brand.includes("CanMoveElement"), false);
    assert.equal(brand.includes("setPointerCapture"), false);
    assert.equal(brand.includes("setData"), false);
    assert.equal(brand.includes("onDragStart"), false);
    assert.ok(brand.includes("pointer-events-none"));
  });
});
