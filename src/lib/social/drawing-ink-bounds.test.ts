/**
 * Tight DRAW / BRUSH ink bounds: rebase without visual jump, padding, min size.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAWING_INK_PAD_WORLD_PX,
  drawingPointToWorldPct,
  fitBrushInkBounds,
  fitDrawingToVisibleInk,
} from "@/lib/social/drawing-ink-bounds";
import {
  createEphemeralDrawingObject,
  DRAWING_SIZE_PCT_MIN,
  DRAWING_ZONE_HEIGHT_PCT,
  DRAWING_ZONE_WIDTH_PCT,
  normalizeEphemeralDrawingObject,
} from "@/lib/social/ephemeral-drawing";
import {
  BRUSH_STROKE_WIDTH_WORLD_PX,
  createEphemeralBrushDocument,
  normalizeEphemeralBrushDocument,
} from "@/lib/social/ephemeral-brush";
import {
  DRAWING_ZONE_HEIGHT_WORLD_PCT,
  DRAWING_ZONE_WIDTH_WORLD_PCT,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from "@/lib/canvas/world-camera";

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const DRAW_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const DOC_ID = "8c9e6679-7425-40de-944b-e07fc1f90ae8";

const zone = {
  leftPct: 40,
  topPct: 45,
  widthPct: DRAWING_ZONE_WIDTH_PCT,
  heightPct: DRAWING_ZONE_HEIGHT_PCT,
};

function worldOf(
  point: { x: number; y: number },
  geom: { leftPct: number; topPct: number; widthPct: number; heightPct: number },
) {
  return drawingPointToWorldPct(point, geom);
}

describe("DRAW tight ink bounds", () => {
  it("tiny drawing shrinks the host far below the authoring zone", () => {
    const fitted = fitDrawingToVisibleInk({
      ...zone,
      strokes: [
        {
          colour: "#171717",
          points: [
            { x: 0.48, y: 0.5 },
            { x: 0.52, y: 0.5 },
          ],
        },
      ],
    });
    assert.ok(fitted);
    assert.ok(fitted!.widthPct < zone.widthPct * 0.5);
    assert.ok(fitted!.heightPct < zone.heightPct);
    assert.ok(fitted!.widthPct >= DRAWING_SIZE_PCT_MIN);
    assert.ok(fitted!.heightPct >= DRAWING_SIZE_PCT_MIN);
  });

  it("drawing near the original editor edge keeps world position after rebase", () => {
    const strokes = [
      {
        colour: "#171717" as const,
        points: [
          { x: 0.02, y: 0.03 },
          { x: 0.08, y: 0.09 },
        ],
      },
    ];
    const fitted = fitDrawingToVisibleInk({ ...zone, strokes });
    assert.ok(fitted);
    const before = worldOf(strokes[0]!.points[0]!, zone);
    const after = worldOf(fitted!.strokes[0]!.points[0]!, fitted!);
    assert.ok(Math.abs(before.x - after.x) < 1e-6);
    assert.ok(Math.abs(before.y - after.y) < 1e-6);
    const beforeLast = worldOf(strokes[0]!.points[1]!, zone);
    const afterLast = worldOf(fitted!.strokes[0]!.points[1]!, fitted!);
    assert.ok(Math.abs(beforeLast.x - afterLast.x) < 1e-6);
    assert.ok(Math.abs(beforeLast.y - afterLast.y) < 1e-6);
  });

  it("multi-stroke drawing bounds enclose every point", () => {
    const strokes = [
      {
        colour: "#171717" as const,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.25 },
        ],
      },
      {
        colour: "#E11D48" as const,
        points: [
          { x: 0.7, y: 0.6 },
          { x: 0.8, y: 0.75 },
        ],
      },
    ];
    const fitted = fitDrawingToVisibleInk({ ...zone, strokes });
    assert.ok(fitted);
    for (const stroke of strokes) {
      for (const point of stroke.points) {
        const world = worldOf(point, zone);
        assert.ok(world.x >= fitted!.leftPct - 1e-6);
        assert.ok(world.y >= fitted!.topPct - 1e-6);
        assert.ok(world.x <= fitted!.leftPct + fitted!.widthPct + 1e-6);
        assert.ok(world.y <= fitted!.topPct + fitted!.heightPct + 1e-6);
      }
    }
  });

  it("thick stroke padding exceeds half the world stroke width plus documented pad", () => {
    const fitted = fitDrawingToVisibleInk({
      ...zone,
      strokes: [
        {
          colour: "#171717",
          points: [{ x: 0.5, y: 0.5 }],
        },
      ],
    });
    assert.ok(fitted);
    const minPadX =
      ((BRUSH_STROKE_WIDTH_WORLD_PX / 2 + DRAWING_INK_PAD_WORLD_PX) /
        WORLD_WIDTH_PX) *
      100;
    const minPadY =
      ((BRUSH_STROKE_WIDTH_WORLD_PX / 2 + DRAWING_INK_PAD_WORLD_PX) /
        WORLD_HEIGHT_PX) *
      100;
    assert.ok(fitted!.widthPct >= minPadX * 2 - 1e-6);
    assert.ok(fitted!.heightPct >= minPadY * 2 - 1e-6);
  });

  it("JSON round-trip of a tight drawing survives normalize", () => {
    const fitted = fitDrawingToVisibleInk({
      ...zone,
      strokes: [
        {
          colour: "#171717",
          points: [
            { x: 0.4, y: 0.4 },
            { x: 0.45, y: 0.42 },
          ],
        },
      ],
    });
    assert.ok(fitted);
    const created = createEphemeralDrawingObject({
      drawingId: DRAW_ID,
      ownerSessionId: OWNER,
      strokes: fitted!.strokes,
      leftPct: fitted!.leftPct,
      topPct: fitted!.topPct,
      widthPct: fitted!.widthPct,
      heightPct: fitted!.heightPct,
      aspectRatio: fitted!.aspectRatio,
      now: () => new Date("2026-08-18T12:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const roundTrip = normalizeEphemeralDrawingObject(
      JSON.parse(JSON.stringify(created.drawing)),
    );
    assert.ok(roundTrip);
    assert.equal(roundTrip!.drawingId, DRAW_ID);
    assert.ok(Math.abs(roundTrip!.widthPct - fitted!.widthPct) < 1e-6);
    assert.ok(roundTrip!.widthPct < DRAWING_ZONE_WIDTH_WORLD_PCT);
  });

  it("clickable area is materially smaller than the authoring zone", () => {
    const fitted = fitDrawingToVisibleInk({
      ...zone,
      strokes: [
        {
          colour: "#171717",
          points: [
            { x: 0.5, y: 0.5 },
            { x: 0.51, y: 0.5 },
          ],
        },
      ],
    });
    assert.ok(fitted);
    const before = zone.widthPct * zone.heightPct;
    const after = fitted!.widthPct * fitted!.heightPct;
    assert.ok(after < before * 0.35);
  });
});

describe("BRUSH tight ink bounds", () => {
  it("BRUSH bounds fit visible strokes and keep world points", () => {
    const strokes = [
      {
        colour: "#171717" as const,
        points: [
          { x: 42, y: 50 },
          { x: 44, y: 51 },
        ],
      },
    ];
    const bounds = fitBrushInkBounds(strokes);
    assert.ok(bounds);
    assert.ok(bounds!.widthPct < 10);
    assert.ok(bounds!.heightPct < 10);
    for (const p of strokes[0]!.points) {
      assert.ok(p.x >= bounds!.leftPct);
      assert.ok(p.y >= bounds!.topPct);
      assert.ok(p.x <= bounds!.leftPct + bounds!.widthPct);
      assert.ok(p.y <= bounds!.topPct + bounds!.heightPct);
    }
  });

  it("wide BRUSH ink is not clamped to the DRAW 40% object ceiling", () => {
    const bounds = fitBrushInkBounds([
      {
        colour: "#171717",
        points: [
          { x: 8, y: 50 },
          { x: 72, y: 51 },
        ],
      },
    ]);
    assert.ok(bounds);
    assert.ok(bounds!.widthPct > 40);
    assert.ok(bounds!.widthPct < 80);
  });

  it("JSON round-trip of brush strokes is unchanged (world % persist)", () => {
    const created = createEphemeralBrushDocument({
      documentId: DOC_ID,
      ownerSessionId: OWNER,
      strokes: [
        {
          colour: "#171717",
          points: [
            { x: 10, y: 12 },
            { x: 11, y: 13 },
          ],
        },
      ],
      now: () => new Date("2026-08-18T12:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const before = fitBrushInkBounds(created.document.strokes);
    const roundTrip = normalizeEphemeralBrushDocument(
      JSON.parse(JSON.stringify(created.document)),
    );
    assert.ok(roundTrip);
    const after = fitBrushInkBounds(roundTrip!.strokes);
    assert.ok(before && after);
    assert.ok(Math.abs(before!.leftPct - after!.leftPct) < 1e-6);
    assert.ok(Math.abs(before!.widthPct - after!.widthPct) < 1e-6);
  });

  it("authoring zone constants remain the DRAW editor size, not the published floor", () => {
    assert.ok(DRAWING_ZONE_WIDTH_WORLD_PCT > 6);
    assert.ok(DRAWING_SIZE_PCT_MIN < 1);
    assert.ok(DRAWING_INK_PAD_WORLD_PX >= 8);
    assert.ok(WORLD_WIDTH_PX === 4800);
    assert.ok(WORLD_HEIGHT_PX === 3200);
  });
});
