/**
 * Stage IC3.3 — empty-canvas click + DRAW visibility regressions.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DRAWING_ZONE_HEIGHT_WORLD_PCT,
  DRAWING_ZONE_WIDTH_WORLD_PCT,
  drawingZoneOriginFromWorldPct,
  homeCameraForViewport,
  initialHomeCameraForViewport,
  normalizeCameraToScaleOnePreservingCenter,
} from "@/lib/canvas/world-camera";
import {
  buildDrawingDraft,
  normalizeDrawingDraft,
} from "@/lib/social/drawing-draft";
import {
  createEphemeralDrawingObject,
  DRAWING_SIZE_PCT_MAX,
  DRAWING_SIZE_PCT_MIN,
  DRAWING_ZONE_HEIGHT_PCT,
  DRAWING_ZONE_WIDTH_PCT,
  normalizeEphemeralDrawingObject,
  normalizeEphemeralDrawingsPageData,
  upsertEphemeralDrawing,
} from "@/lib/social/ephemeral-drawing";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const DRAW_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const stroke = {
  colour: "#171717" as const,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.8, y: 0.7 },
  ],
};

describe("Stage IC3.3 empty-canvas click classification", () => {
  it("1–4. sub-threshold tap dispatches create; pan suppresses create", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("dispatchEmptyCanvasClick"));
    assert.ok(cam.includes("wasActivePan"));
    assert.ok(cam.includes("panDragThresholdPx"));
    // Explicit tap path after inactive pan end.
    assert.ok(cam.includes("Tap / sub-threshold drag"));
    // Active pan still suppresses click.
    assert.ok(cam.includes("suppressEmptyCanvasClick = true"));
    assert.equal(cam.includes("pointercancel"), true);
    assert.ok(cam.includes('event.type === "pointercancel"'));
  });

  it("5–6. HOME clears stale pan suppression; capture release does not block next tap", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("cancelActivePan"));
    const cancelBody = cam.slice(
      cam.indexOf("const cancelActivePan"),
      cam.indexOf("const goHome"),
    );
    assert.ok(cancelBody.includes("suppressEmptyCanvasClick = false"));
    assert.ok(cancelBody.includes("releasePointerCapture"));
    assert.ok(cam.includes("setTimeout"));
  });

  it("7–8. mouse + touch thresholds remain distinct; empty-hit still wired", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes('pointerType === "touch"') || cam.includes("panDragThresholdPx(pan.pointerType)"));
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));
    assert.ok(surface.includes("dispatchEmptyCanvasClick"));
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("registerEmptyCanvasClick"));
    assert.ok(layer.includes("shouldSuppressEmptyCanvasClick"));
  });
});

describe("Stage IC3.3 DRAW world visibility", () => {
  it("1–2. DRAW draft/publish use IC2 world zone sizes (not legacy 22%)", () => {
    assert.ok(Math.abs(DRAWING_ZONE_WIDTH_PCT - 6.6) < 1e-9);
    assert.ok(Math.abs(DRAWING_ZONE_HEIGHT_PCT - 6.1875) < 1e-9);
    assert.equal(DRAWING_ZONE_WIDTH_PCT, DRAWING_ZONE_WIDTH_WORLD_PCT);
    assert.equal(DRAWING_ZONE_HEIGHT_PCT, DRAWING_ZONE_HEIGHT_WORLD_PCT);
    assert.notEqual(DRAWING_ZONE_WIDTH_PCT, 22);
    assert.ok(DRAWING_ZONE_WIDTH_PCT >= DRAWING_SIZE_PCT_MIN);
    assert.ok(DRAWING_ZONE_WIDTH_PCT <= DRAWING_SIZE_PCT_MAX);

    const zone = drawingZoneOriginFromWorldPct(50, 50);
    assert.ok(Math.abs(zone.widthPct - DRAWING_ZONE_WIDTH_PCT) < 1e-9);
    assert.ok(Math.abs(zone.heightPct - DRAWING_ZONE_HEIGHT_PCT) < 1e-9);
  });

  it("3–5. IC2-sized draft + published drawing survive normalize (creator + remote)", () => {
    const zone = drawingZoneOriginFromWorldPct(40, 45);
    const draft = buildDrawingDraft({
      draftDrawingId: DRAW_ID,
      ownerSessionId: OWNER,
      strokes: [stroke],
      leftPct: zone.leftPct,
      topPct: zone.topPct,
      widthPct: zone.widthPct,
      heightPct: zone.heightPct,
      aspectRatio: (4800 * zone.widthPct) / (3200 * zone.heightPct),
    });
    assert.ok(draft);
    assert.ok(draft!.widthPct < 8);
    assert.ok(normalizeDrawingDraft(draft));

    const created = createEphemeralDrawingObject({
      drawingId: DRAW_ID,
      ownerSessionId: OWNER,
      strokes: [stroke],
      leftPct: zone.leftPct,
      topPct: zone.topPct,
      widthPct: zone.widthPct,
      heightPct: zone.heightPct,
      aspectRatio: (4800 * zone.widthPct) / (3200 * zone.heightPct),
      now: () => new Date("2026-08-13T12:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    // Pre-IC3.3 bug: widthPct < 8 rejected → invisible after page-data round-trip.
    const normalized = normalizeEphemeralDrawingObject(created.drawing);
    assert.ok(normalized);
    assert.ok(Math.abs(normalized!.widthPct - zone.widthPct) < 1e-6);

    const page = normalizeEphemeralDrawingsPageData(
      upsertEphemeralDrawing({ drawings: [] }, created.drawing),
    );
    assert.equal(page.drawings.length, 1);
    assert.equal(page.drawings[0]?.drawingId, DRAW_ID);
  });

  it("6–7. stroke points stay 0–1; camera does not mutate stored position", () => {
    const zone = drawingZoneOriginFromWorldPct(30, 30);
    const created = createEphemeralDrawingObject({
      drawingId: DRAW_ID,
      ownerSessionId: OWNER,
      strokes: [stroke],
      leftPct: zone.leftPct,
      topPct: zone.topPct,
      widthPct: zone.widthPct,
      heightPct: zone.heightPct,
      aspectRatio: 1.6,
      now: () => new Date("2026-08-13T12:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    for (const p of created.drawing.strokes[0]!.points) {
      assert.ok(p.x >= 0 && p.x <= 1);
      assert.ok(p.y >= 0 && p.y <= 1);
    }
    const before = { ...created.drawing };
    const fitted = initialHomeCameraForViewport(390, 844);
    const normal = normalizeCameraToScaleOnePreservingCenter(fitted, 390, 844);
    const home = homeCameraForViewport(390, 844);
    assert.ok(fitted.scale < 1);
    assert.equal(normal.scale, 1);
    assert.equal(home.scale, 1);
    assert.equal(created.drawing.leftPct, before.leftPct);
    assert.equal(created.drawing.topPct, before.topPct);
    assert.equal(created.drawing.widthPct, before.widthPct);
  });

  it("8–12. world frame, layering, no legacy 22% leak into new zone helpers", () => {
    const object = readSrc("src/components/social/ephemeral-drawing-object.tsx");
    assert.ok(object.includes("left: `${drawing.leftPct}%`"));
    assert.ok(object.includes("width: `${drawing.widthPct}%`"));
    assert.ok(object.includes("PLAYHTML_CANVAS_BOUNDS_ID"));

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes('data-4663-ephemeral-text-layer'));
    assert.ok(layer.includes("z-[2]"));
    assert.ok(layer.includes("DrawingSessionEditor"));
    assert.ok(layer.includes("EphemeralDrawingObjectView"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("EphemeralTextLayer"));
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));
    assert.ok(surface.includes('z-0'));
    // Stacking in JSX: empty-hit before EphemeralTextLayer mount.
    const emptyIdx = surface.indexOf("data-4663-canvas-empty-hit");
    const layerMountIdx = surface.indexOf("<EphemeralTextLayer");
    assert.ok(emptyIdx > 0 && layerMountIdx > emptyIdx);

    assert.ok(DRAWING_ZONE_WIDTH_PCT < 8);
    assert.ok(DRAWING_SIZE_PCT_MIN <= DRAWING_ZONE_WIDTH_PCT);
    assert.equal(
      normalizeEphemeralDrawingObject({
        drawingId: DRAW_ID,
        ownerSessionId: OWNER,
        strokes: [stroke],
        leftPct: 10,
        topPct: 10,
        widthPct: 3,
        heightPct: 3,
        aspectRatio: 1,
        createdAt: "2026-08-13T12:00:00.000Z",
      }),
      null,
    );
  });
});
