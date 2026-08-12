/**
 * Stage 10B.6 — PlayHTML movable logo structural tests.
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
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_HERO_SUBTITLE_ID,
  PLAYHTML_HERO_TITLE_ID,
  PLAYHTML_LOGO_ID,
} from "@/lib/canvas/hero";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage 10B.6 PlayHTML movable logo", () => {
  it("logo object exists with stable PlayHTML id 4663-logo", () => {
    assert.equal(PLAYHTML_LOGO_ID, "4663-logo");
    const logo = readSrc("src/components/canvas/movable-logo.tsx");
    assert.ok(logo.includes("MovableLogo"));
    assert.ok(logo.includes(PLAYHTML_LOGO_ID));
    assert.ok(logo.includes("CanMoveElement"));
    assert.ok(logo.includes("/4663pfp.png"));
  });

  it("logo is bound to 4663-canvas", () => {
    const logo = readSrc("src/components/canvas/movable-logo.tsx");
    assert.ok(logo.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
    assert.equal(PLAYHTML_CANVAS_BOUNDS_ID, "4663-canvas");

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("MovableLogo"));
    assert.ok(surface.includes(`id={PLAYHTML_CANVAS_BOUNDS_ID}`));
  });

  it("default top-left positioning at ~24px", () => {
    assert.equal(LOGO_DEFAULT_STYLE.left, "24px");
    assert.equal(LOGO_DEFAULT_STYLE.top, "24px");
    const logo = readSrc("src/components/canvas/movable-logo.tsx");
    assert.ok(logo.includes("LOGO_DEFAULT_STYLE"));
  });

  it("responsive size and iOS rounded-square styling", () => {
    const logo = readSrc("src/components/canvas/movable-logo.tsx");
    assert.ok(logo.includes("h-16 w-16"));
    assert.ok(logo.includes("sm:h-[72px] sm:w-[72px]"));
    assert.ok(logo.includes("rounded-[16px]"));
    assert.ok(logo.includes("sm:rounded-[18px]"));
    assert.ok(logo.includes("overflow-hidden"));
    assert.equal(logo.includes("rounded-full"), false);
  });

  it("PlayHTML owns outer transform; clip/size on inner wrapper", () => {
    const logo = readSrc("src/components/canvas/movable-logo.tsx");
    assert.ok(logo.includes("CanMoveElement"));
    assert.equal(logo.includes("onPointerDown"), false);
    assert.equal(logo.includes("onMouseDown"), false);
    assert.equal(logo.includes("localStorage"), false);
    // Outer movable div should not use competing translate utilities.
    const outerMatch = logo.match(
      /id=\{PLAYHTML_LOGO_ID\}[\s\S]*?className="([^"]+)"/,
    );
    assert.ok(outerMatch);
    assert.equal(outerMatch![1].includes("translate"), false);
  });

  it("existing hero objects remain unchanged", () => {
    assert.equal(PLAYHTML_HERO_TITLE_ID, "4663-hero-title");
    assert.equal(PLAYHTML_HERO_SUBTITLE_ID, "4663-hero-subtitle");
    assert.equal(HERO_TITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_TITLE_DEFAULT_STYLE.top, "42%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.left, "50%");
    assert.equal(HERO_SUBTITLE_DEFAULT_STYLE.top, "52%");

    const hero = readSrc("src/components/canvas/movable-hero.tsx");
    assert.equal((hero.match(/<CanMoveElement\b/g) ?? []).length, 2);
    assert.ok(hero.includes(PLAYHTML_HERO_TITLE_ID));
    assert.ok(hero.includes(PLAYHTML_HERO_SUBTITLE_ID));
    assert.equal(hero.includes(PLAYHTML_LOGO_ID), false);
  });
});
