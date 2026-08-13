/**
 * Stage IC2 — world-aware TEXT + DRAW placement helpers + wiring.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  dockCreateWorldPct,
  DRAWING_ZONE_HEIGHT_WORLD_PCT,
  DRAWING_ZONE_WIDTH_WORLD_PCT,
  drawingZoneOriginFromWorldPct,
  HOME_REGION_HEIGHT_PX,
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  HOME_REGION_WIDTH_PX,
  homeCameraForViewport,
  homePctToWorldPct,
  screenPointToWorldPct,
  screenPointToWorldPoint,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
  worldPointToWorldPct,
  type CanvasCamera,
  type ViewportRect,
} from "@/lib/canvas/world-camera";
import {
  createEphemeralDrawingObject,
  DRAWING_ZONE_HEIGHT_PCT,
  DRAWING_ZONE_WIDTH_PCT,
  drawingZoneOriginFromClick,
  drawingZoneWorldAspectRatio,
} from "@/lib/social/ephemeral-drawing";
import { createEphemeralTextObject } from "@/lib/social/ephemeral-text";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const OWNER = "11111111-1111-4111-8111-111111111111";
const DRAW_ID = "22222222-2222-4222-8222-222222222222";

const viewportHome: ViewportRect = {
  left: 0,
  top: 0,
  width: 1440,
  height: 900,
};

describe("Stage IC2 world-aware TEXT + DRAW placement", () => {
  it("1–3. screen→world at HOME; panned; world→%", () => {
    const homeCam = homeCameraForViewport(1440, 900);
    assert.equal(homeCam.x, HOME_REGION_LEFT_PX);
    assert.equal(homeCam.y, HOME_REGION_TOP_PX);

    // Click viewport center at HOME → home artboard center in world.
    const homeCenter = screenPointToWorldPoint(
      720,
      450,
      viewportHome,
      homeCam,
    );
    assert.equal(homeCenter.x, HOME_REGION_LEFT_PX + 720);
    assert.equal(homeCenter.y, HOME_REGION_TOP_PX + 450);

    const homePct = worldPointToWorldPct(homeCenter);
    assert.ok(Math.abs(homePct.leftPct - 50) < 0.01);
    assert.ok(Math.abs(homePct.topPct - 50) < 0.01);

    const panned: CanvasCamera = { x: 3000, y: 2000 };
    const pannedPoint = screenPointToWorldPoint(
      100,
      80,
      viewportHome,
      panned,
    );
    assert.equal(pannedPoint.x, 100 - 0 + 3000);
    assert.equal(pannedPoint.y, 80 - 0 + 2000);

    const pct = screenPointToWorldPct(100, 80, viewportHome, panned);
    assert.equal(
      pct.leftPct,
      worldPointToWorldPct(pannedPoint).leftPct,
    );
  });

  it("4. pointer-created TEXT while panned stores expected world position", () => {
    const cam: CanvasCamera = { x: 2500, y: 1800 };
    const { leftPct, topPct } = screenPointToWorldPct(
      200,
      150,
      viewportHome,
      cam,
    );
    const created = createEphemeralTextObject({
      body: "hello",
      ownerSessionId: OWNER,
      leftPct,
      topPct,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.text.leftPct, leftPct);
    assert.equal(created.text.topPct, topPct);
    // Not HOME-region 68/35 style defaults.
    assert.notEqual(created.text.leftPct, 68);
  });

  it("5. dock-created TEXT uses current camera/view rather than HOME constant", () => {
    const homeCam = homeCameraForViewport(1440, 900);
    const atHome = dockCreateWorldPct(viewportHome, homeCam);
    const panned = dockCreateWorldPct(viewportHome, { x: 3200, y: 2100 });
    assert.notDeepEqual(atHome, panned);

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("dockCreateWorldPct"));
    assert.ok(layer.includes("dockWorldOrigin"));
    assert.equal(layer.includes("leftPct: DOCK_CREATE_DEFAULT_ORIGIN.leftPct"), false);
  });

  it("6. TEXT composer opens at stored world % (same as click mapping)", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("screenPointToWorldPct"));
    assert.ok(layer.includes('mode: "compose"'));
    assert.ok(layer.includes("leftPct={createUi.leftPct}"));
    const composer = readSrc("src/components/social/ephemeral-text-composer.tsx");
    assert.ok(composer.includes("left: `${leftPct}%`"));
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    // Composer % resolves against world (layer is world child, not home-region).
    assert.ok(surface.includes("<EphemeralTextLayer />"));
    const homeBlock = surface.slice(
      surface.indexOf("data-4663-home-region"),
      surface.indexOf("<EphemeralTextLayer"),
    );
    assert.equal(homeBlock.includes("EphemeralTextLayer"), false);
  });

  it("7–8. DRAW zone while panned stores world position; clamps to world not HOME", () => {
    const cam: CanvasCamera = { x: 3500, y: 2400 };
    const click = screenPointToWorldPct(50, 50, viewportHome, cam);
    const zone = drawingZoneOriginFromClick(click.leftPct, click.topPct);
    assert.ok(zone.leftPct >= 0);
    assert.ok(zone.topPct >= 0);
    assert.ok(zone.leftPct + zone.widthPct <= 100);
    assert.ok(zone.topPct + zone.heightPct <= 100);
    // Near world edge — not forced into home artboard box.
    assert.ok(zone.leftPct > 60 || zone.topPct > 60);

    const edge = drawingZoneOriginFromWorldPct(99, 99);
    assert.equal(edge.leftPct + edge.widthPct, 100);
    assert.equal(edge.topPct + edge.heightPct, 100);
  });

  it("9. DRAW stroke points remain zone-local 0–1", () => {
    const zone = drawingZoneOriginFromClick(40, 40);
    const created = createEphemeralDrawingObject({
      drawingId: DRAW_ID,
      ownerSessionId: OWNER,
      strokes: [
        {
          colour: "#171717",
          points: [
            { x: 0.2, y: 0.3 },
            { x: 0.8, y: 0.7 },
          ],
        },
      ],
      ...zone,
      aspectRatio: drawingZoneWorldAspectRatio(zone.widthPct, zone.heightPct),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.drawing.strokes[0]?.points[0]?.x, 0.2);
    assert.equal(created.drawing.strokes[0]?.points[1]?.y, 0.7);
  });

  it("10–11. camera does not mutate TEXT/DRAW records; two cameras agree on world %", () => {
    const camA: CanvasCamera = { x: 100, y: 200 };
    const camB: CanvasCamera = { x: 900, y: 600 };
    // Same world point (2400, 1600) seen from different cameras / screen positions.
    const worldX = 2400;
    const worldY = 1600;
    const screenA = {
      clientX: viewportHome.left + (worldX - camA.x),
      clientY: viewportHome.top + (worldY - camA.y),
    };
    const screenB = {
      clientX: viewportHome.left + (worldX - camB.x),
      clientY: viewportHome.top + (worldY - camB.y),
    };
    const pctA = screenPointToWorldPct(
      screenA.clientX,
      screenA.clientY,
      viewportHome,
      camA,
    );
    const pctB = screenPointToWorldPct(
      screenB.clientX,
      screenB.clientY,
      viewportHome,
      camB,
    );
    assert.deepEqual(pctA, pctB);

    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(cam.includes("usePageData"), false);
    assert.equal(cam.includes("leftPct"), false);
    assert.equal(cam.includes("topPct"), false);
  });

  it("12. HOME TEXT/DRAW behaviour remains correct under world %", () => {
    const homeCam = homeCameraForViewport(1440, 900);
    // Click at 68%/35% of viewport at HOME ≈ former dock cue in home artboard.
    const clientX = viewportHome.left + viewportHome.width * 0.68;
    const clientY = viewportHome.top + viewportHome.height * 0.35;
    const viaScreen = screenPointToWorldPct(
      clientX,
      clientY,
      viewportHome,
      homeCam,
    );
    const viaHome = homePctToWorldPct(68, 35);
    assert.ok(Math.abs(viaScreen.leftPct - viaHome.leftPct) < 0.05);
    assert.ok(Math.abs(viaScreen.topPct - viaHome.topPct) < 0.05);
  });

  it("13–15. Summon untouched; PlayHTML movement untouched; mobile pan not introduced", () => {
    const summon = readSrc("src/lib/canvas/summon.ts");
    assert.ok(summon.includes("SUMMON_MAX_EVENTS = 4"));
    assert.ok(summon.includes("leftPct: 18"));
    const textObj = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(textObj.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
    const drawObj = readSrc(
      "src/components/social/ephemeral-drawing-object.tsx",
    );
    assert.ok(drawObj.includes("bounds={PLAYHTML_CANVAS_BOUNDS_ID}"));
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("event.isPrimary"));
    assert.equal(cam.includes("isDesktopPointer"), false);
    assert.ok(cam.includes("panDragThresholdPx"));
  });

  it("16. no camera/network synchronization introduced", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(cam.includes("Broadcast"), false);
    assert.equal(cam.includes("supabase"), false);
    assert.equal(cam.includes("fetch("), false);
    assert.ok(cam.includes("getCanvasPlacementSnapshot"));
  });

  it("DRAW zone sizing rule: ~22% of home artboard as world %, not 22% of world", () => {
    const expectedW = (0.22 * HOME_REGION_WIDTH_PX * 100) / WORLD_WIDTH_PX;
    const expectedH = (0.22 * HOME_REGION_HEIGHT_PX * 100) / WORLD_HEIGHT_PX;
    assert.equal(DRAWING_ZONE_WIDTH_WORLD_PCT, expectedW);
    assert.equal(DRAWING_ZONE_HEIGHT_WORLD_PCT, expectedH);
    assert.equal(DRAWING_ZONE_WIDTH_PCT, expectedW);
    assert.equal(DRAWING_ZONE_HEIGHT_PCT, expectedH);
    assert.ok(DRAWING_ZONE_WIDTH_PCT < 8);
    assert.notEqual(DRAWING_ZONE_WIDTH_PCT, 22);
  });
});
