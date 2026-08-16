/**
 * Stage 10B.6 / IC3.10 — viewport-fixed brand logo (non-movable).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRAND_LOGO_STYLE,
  LOGO_DEFAULT_STYLE,
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_LOGO_ID,
} from "@/lib/canvas/hero";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage 10B.6 / IC3.10 brand logo", () => {
  it("logo object exists with stable id 4663-logo", () => {
    assert.equal(PLAYHTML_LOGO_ID, "4663-logo");
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("BrandLogo"));
    assert.ok(brand.includes(PLAYHTML_LOGO_ID));
    assert.equal(brand.includes("CanMoveElement"), false);
    assert.ok(brand.includes("/4663pfp.png"));
    assert.ok(brand.includes('data-4663-brand-anchor="logo"'));
  });

  it("logo is viewport chrome; not in world / can-move", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal(brand.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"), false);
    assert.equal(PLAYHTML_CANVAS_BOUNDS_ID, "4663-world");

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("BrandAnchors"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(surface.includes("MovableLogo"), false);
    assert.equal(surface.includes("BrandLogo"), false);
  });

  it("default top-left positioning with safe-area", () => {
    assert.equal(LOGO_DEFAULT_STYLE.left, "24px");
    assert.equal(LOGO_DEFAULT_STYLE.top, "24px");
    assert.ok(BRAND_LOGO_STYLE.left.includes("safe-area-inset-left"));
    assert.ok(BRAND_LOGO_STYLE.top.includes("safe-area-inset-top"));
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("BRAND_LOGO_STYLE"));
  });

  it("responsive size and iOS rounded-square styling", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.ok(brand.includes("h-16 w-16"));
    assert.ok(
      brand.includes("desktop-chrome:h-[72px] desktop-chrome:w-[72px]"),
    );
    assert.equal(brand.includes("sm:h-[72px]"), false);
    assert.ok(brand.includes("rounded-[16px]"));
    assert.ok(brand.includes("desktop-chrome:rounded-[18px]"));
    assert.equal(brand.includes("rounded-full"), false);
  });

  it("no PlayHTML transform owner", () => {
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal(brand.includes("CanMoveElement"), false);
    assert.equal(brand.includes("setData"), false);
    assert.equal(brand.includes("onPointerDown"), false);
  });
});
