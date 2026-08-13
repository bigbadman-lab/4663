/**
 * Stage IC1 — structural wiring for large world + local desktop camera + HOME.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTROL_DOCK_ITEMS,
  getLiveControlDockItems,
} from "@/lib/canvas/control-palette";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import {
  PLAYHTML_WORLD_BOUNDS_ID,
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

describe("Stage IC1 large world + local camera wiring", () => {
  it("viewport/world distinct; PlayHTML bounds = world", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("data-4663-canvas-viewport"));
    assert.ok(surface.includes("data-4663-canvas-world"));
    assert.ok(surface.includes("data-4663-home-region"));
    assert.ok(surface.includes("id={PLAYHTML_WORLD_BOUNDS_ID}"));
    assert.ok(surface.includes("useCanvasCamera"));
    assert.equal(PLAYHTML_CANVAS_BOUNDS_ID, PLAYHTML_WORLD_BOUNDS_ID);
    assert.equal(PLAYHTML_WORLD_BOUNDS_ID, "4663-world");
    assert.equal(WORLD_WIDTH_PX, 4800);
    assert.equal(WORLD_HEIGHT_PX, 3200);
  });

  it("camera is local only — no PlayHTML/Supabase/Broadcast sync", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("local camera"));
    assert.equal(cam.includes("usePageData"), false);
    assert.equal(cam.includes("fetch("), false);
    assert.equal(cam.includes("Broadcast"), false);
    assert.equal(cam.includes("supabase"), false);
    assert.ok(cam.includes("goHome"));
    assert.ok(cam.includes("isCanvasPanHitTarget"));
    // IC3: pan is not desktop-only; primary empty-hit pointer starts pan.
    assert.equal(cam.includes("isDesktopPointer"), false);
    assert.ok(cam.includes("event.isPrimary"));
    assert.ok(cam.includes("panDragThresholdPx"));
  });

  it("empty-space pan + click suppress; object drag does not pan", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("isCanvasPanHitTarget"));
    assert.ok(cam.includes("panDragThresholdPx"));
    assert.ok(cam.includes("shouldSuppressEmptyCanvasClick"));
    assert.ok(cam.includes("setCreateUiBlocksPan"));
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("shouldSuppressEmptyCanvasClick"));
    assert.ok(layer.includes("setCreateUiBlocksPan"));
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));
  });

  it("HOME dock control resets camera only; not session RESET", () => {
    assert.ok(CONTROL_DOCK_ITEMS.some((i) => i.id === "home"));
    assert.ok(getLiveControlDockItems().some((i) => i.id === "home"));
    assert.deepEqual(
      getLiveControlDockItems().map((i) => i.id),
      ["text", "draw", "home", "summon", "reset"],
    );
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("onHome"));
    assert.ok(palette.includes('item.id === "home"'));
    assert.ok(palette.includes("HOME_VIEW_ARIA_LABEL"));
    assert.equal(palette.includes("resetContent"), false);
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("goHome"));
    assert.ok(surface.includes("onHome={onHome}"));
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("cancelActivePan"));
    assert.ok(cam.includes("homeCameraForViewport(vw, vh)"));
    // Palette is outside the world transform.
    const worldBlock = surface.slice(
      surface.indexOf("data-4663-canvas-world"),
      surface.indexOf("CanvasControlPalette"),
    );
    assert.equal(worldBlock.includes("CanvasControlPalette"), false);
  });

  it("chrome remains outside world; mobile pan uses empty-hit touch-none", () => {
    const play = readSrc("src/components/canvas/canvas-play-tree.tsx");
    assert.ok(play.includes("CanvasChrome"));
    assert.ok(play.includes("CanvasSurface"));
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(cam.includes("isDesktopPointer"), false);
    assert.ok(cam.includes("panDragThresholdPx"));
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("touch-none"));
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));
  });

  it("Summon / TEXT / DRAW / CanMove bounds wiring preserved", () => {
    assert.equal(readSrc("src/lib/canvas/summon.ts").includes("SUMMON_MAX_EVENTS = 4"), true);
    const textObj = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(textObj.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
    const drawObj = readSrc(
      "src/components/social/ephemeral-drawing-object.tsx",
    );
    assert.ok(drawObj.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
    // IC3.10 — brand hero is not a can-move target.
    const brand = readSrc("src/components/canvas/brand-anchors.tsx");
    assert.equal(brand.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"), false);
    assert.equal(brand.includes("CanMoveElement"), false);
    const controller = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );
    assert.ok(controller.includes("shouldDismissActiveSummonOnClick"));
  });
});
