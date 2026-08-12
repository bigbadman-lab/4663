/**
 * Stage 10B.8 — movable control palette structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTROL_PALETTE_ITEMS,
} from "@/lib/canvas/control-palette";
import {
  CONTROL_PALETTE_DEFAULT_STYLE,
  PLAYHTML_CANVAS_BOUNDS_ID,
  PLAYHTML_CONTROL_PALETTE_ID,
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

describe("Stage 10B.8 movable control palette", () => {
  it("1–5. palette once, stable id, CanMove + bounds, one PlayProvider", () => {
    assert.equal(PLAYHTML_CONTROL_PALETTE_ID, "4663-control-palette");

    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes("CanMoveElement"));
    assert.ok(palette.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
    assert.ok(palette.includes("PLAYHTML_CONTROL_PALETTE_ID"));
    assert.equal(PLAYHTML_CANVAS_BOUNDS_ID, "4663-canvas");

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(
      (surface.match(/<CanvasControlPalette\b/g) ?? []).length,
      1,
    );

    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.equal((playTree.match(/<PlayProvider\b/g) ?? []).length, 1);
  });

  it("6–7. bottom-center origin; centering on inner only", () => {
    assert.equal(CONTROL_PALETTE_DEFAULT_STYLE.left, "50%");
    assert.equal(CONTROL_PALETTE_DEFAULT_STYLE.bottom, "52px");

    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes("CONTROL_PALETTE_DEFAULT_STYLE"));

    const outerMatch = palette.match(
      /id=\{PLAYHTML_CONTROL_PALETTE_ID\}[\s\S]*?className="([^"]+)"/,
    );
    assert.ok(outerMatch);
    assert.equal(outerMatch![1].includes("translate"), false);
    assert.ok(palette.includes('-translate-x-1/2'));
  });

  it("8–10. five controls, aria-labels, stop move-start", () => {
    assert.equal(CONTROL_PALETTE_ITEMS.length, 5);
    assert.deepEqual(
      CONTROL_PALETTE_ITEMS.map((i) => i.label),
      ["Summon", "Last event", "Clear", "Reset", "About"],
    );

    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes("aria-label={item.label}"));
    assert.ok(palette.includes("title={item.label}"));
    assert.ok(palette.includes("onPointerDown={stopMoveStart}"));
    assert.ok(palette.includes("onMouseDown={stopMoveStart}"));
    assert.ok(palette.includes("onTouchStart={stopMoveStart}"));
    assert.ok(palette.includes("stopPropagation"));
  });

  it("11–12. placeholder actions do not touch events / no new usePublicEvents", () => {
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.equal(palette.includes("usePublicEvents"), false);
    assert.equal(palette.includes("assignSlots"), false);
    assert.equal(palette.includes("deleteElementData"), false);
    assert.equal(palette.includes("CanvasIntroNote"), false);
    assert.ok(palette.includes("onPlaceholderAction"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(surface.includes("usePublicEvents"), false);

    const defs = readSrc("src/lib/canvas/control-palette.ts");
    assert.equal(defs.includes("usePublicEvents"), false);
  });

  it("13–14. compact mobile layout + replaceable icon slots", () => {
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.equal(palette.includes("overflow-x-auto"), false);
    assert.equal(palette.includes("min-w-["), false);
    assert.ok(palette.includes("data-4663-palette-icon-slot"));
    assert.ok(palette.includes("PlaceholderIcon"));
    assert.ok(palette.includes("h-10 w-10"));
    assert.ok(palette.includes("sm:h-11 sm:w-11"));

    assert.equal(PLAYHTML_HERO_TITLE_ID, "4663-hero-title");
    assert.equal(PLAYHTML_HERO_SUBTITLE_ID, "4663-hero-subtitle");
    assert.equal(PLAYHTML_LOGO_ID, "4663-logo");
  });
});
