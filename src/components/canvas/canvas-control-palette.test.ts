/**
 * Social 8A — responsive bottom control dock structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTROL_DOCK_ITEMS,
  CONTROL_PALETTE_ITEMS,
} from "@/lib/canvas/control-palette";
import {
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

describe("Social 8A responsive bottom control dock", () => {
  it("1–3. exactly TEXT→DRAW→MARK→SUMMON→RESET with exact PNG icons", () => {
    assert.equal(CONTROL_DOCK_ITEMS.length, 5);
    assert.deepEqual(
      CONTROL_DOCK_ITEMS.map((i) => i.id),
      ["text", "draw", "mark", "summon", "reset"],
    );
    assert.deepEqual(
      CONTROL_DOCK_ITEMS.map((i) => i.label),
      ["TEXT", "DRAW", "MARK", "SUMMON", "RESET"],
    );
    assert.deepEqual(
      CONTROL_DOCK_ITEMS.map((i) => i.iconSrc),
      ["/text.png", "/draw.png", "/mark.png", "/summon.png", "/reset.png"],
    );
    assert.equal(CONTROL_PALETTE_ITEMS, CONTROL_DOCK_ITEMS);
  });

  it("4–5. accessible labels + explicit non-draggable image dimensions", () => {
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes("aria-label={item.id === \"summon\" ? summonLabel : item.label}"));
    assert.ok(palette.includes("title={item.id === \"summon\" ? summonLabel : item.label}"));
    assert.ok(palette.includes("aria-pressed={"));
    assert.ok(palette.includes('width={32}'));
    assert.ok(palette.includes('height={32}'));
    assert.ok(palette.includes("draggable={false}"));
    assert.ok(palette.includes("object-contain"));
    assert.ok(palette.includes("SUMMON_DOCK_ACTIVE_COLOR"));
    for (const src of [
      "/text.png",
      "/draw.png",
      "/mark.png",
      "/summon.png",
      "/reset.png",
    ]) {
      assert.ok(readSrc("src/lib/canvas/control-palette.ts").includes(src));
    }
  });

  it("6–8. bottom-centered + safe-area + responsive sizing", () => {
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes("justify-center"));
    assert.ok(palette.includes("bottom-0"));
    assert.ok(palette.includes("safe-area-inset-bottom"));
    assert.ok(palette.includes("3.75rem"));
    assert.ok(palette.includes("sm:h-8") || palette.includes("sm:min-h-14"));
    assert.ok(palette.includes("rounded-2xl"));
    assert.equal(PLAYHTML_CONTROL_PALETTE_ID, "4663-control-palette");
  });

  it("9. no full-screen pointer-events interception", () => {
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes("pointer-events-none absolute inset-x-0 bottom-0"));
    assert.ok(palette.includes("pointer-events-auto"));
    assert.equal(palette.includes("inset-0 pointer-events-auto"), false);
    assert.equal(palette.includes("CanMoveElement"), false);
  });

  it("10–14. TEXT/DRAW/MARK/SUMMON/RESET wiring + gates preserved", () => {
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes('item.id === "text"'));
    assert.ok(palette.includes('item.id === "draw"'));
    assert.ok(palette.includes('item.id === "mark"'));
    assert.ok(palette.includes("onSummon"));
    assert.ok(palette.includes("onReset"));
    assert.ok(palette.includes("getCanvasCreateActions"));
    assert.equal(palette.includes("[ DISMISS ]"), false);
    assert.equal(palette.includes("onDismissSummon"), false);
    assert.ok(palette.includes("isSummonDockDisabled"));
    assert.ok(palette.includes("canSummon"));
    assert.ok(palette.includes("canMark"));
    assert.ok(palette.includes("canReset"));

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("registerCanvasCreateActions"));
    assert.ok(layer.includes("DOCK_CREATE_DEFAULT_ORIGIN"));
    assert.ok(layer.includes("openText"));
    assert.ok(layer.includes("openDraw"));
    assert.ok(layer.includes("openMark"));

    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.ok(playTree.includes("canText={canCreate}"));
    assert.ok(playTree.includes("canDraw={canCreate}"));
    assert.ok(playTree.includes("canMark={canMark}"));
    assert.ok(playTree.includes("resetContent"));
  });

  it("15–16. WATCH/PIN/LEAVE not on dock", () => {
    const defs = readSrc("src/lib/canvas/control-palette.ts");
    assert.equal(defs.includes("watch"), false);
    assert.equal(defs.includes("pin"), false);
    assert.equal(defs.includes("leave"), false);
    assert.equal(defs.toLowerCase().includes("watch"), false);
  });

  it("17–18. bottom-left presence + bottom-right time remain", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("PresenceStatus"));
    assert.ok(chrome.includes("data-4663-chrome-presence"));
    assert.ok(chrome.includes("CanvasLiveClock"));
    assert.ok(chrome.includes("data-4663-chrome-clock"));
    assert.ok(chrome.includes("bottom-5 left-5") || chrome.includes("sm:bottom-6 sm:left-6"));
    assert.ok(chrome.includes("bottom-5 right-5") || chrome.includes("sm:bottom-6 sm:right-6"));
  });

  it("19–22. single mount, no event stream coupling, hero ids, patch/singleton markers", () => {
    assert.equal(PLAYHTML_CANVAS_BOUNDS_ID, "4663-canvas");
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(
      (surface.match(/<CanvasControlPalette\b/g) ?? []).length,
      1,
    );
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.equal(palette.includes("usePublicEvents"), false);
    assert.equal(PLAYHTML_HERO_TITLE_ID, "4663-hero-title");
    assert.equal(PLAYHTML_HERO_SUBTITLE_ID, "4663-hero-subtitle");
    assert.equal(PLAYHTML_LOGO_ID, "4663-logo");
    assert.ok(readSrc("package.json").includes("patch-package"));
    assert.ok(
      readSrc("src/lib/events/supabase-browser.ts").includes(
        "getBrowserSupabaseClient",
      ),
    );
  });
});
