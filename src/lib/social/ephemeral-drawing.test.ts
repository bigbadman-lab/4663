/**
 * Social 3A / 3A.1 — ephemeral DRAW helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEphemeralDrawingObject,
  DRAWING_ASPECT_RATIO_MAX,
  DRAWING_ASPECT_RATIO_MIN,
  DRAWING_BRUSH_SIZE,
  DRAWING_COLOUR_PALETTE,
  DRAWING_MAX_POINTS_PER_STROKE,
  DRAWING_MAX_STROKES,
  DRAWING_MAX_TOTAL_POINTS,
  DRAWING_TOTAL_POINTS_LIMIT_COPY,
  drawingCanAcceptAnotherPoint,
  countDrawingPoints,
  DRAWING_ZONE_HEIGHT_PCT,
  DRAWING_ZONE_WIDTH_PCT,
  drawingZoneOriginFromClick,
  fallbackAspectRatioFromSizePct,
  hasMeaningfulStrokes,
  hostPhysicalAspectFromWidthAndRatio,
  measureDrawingZoneAspectRatio,
  normalizeDrawingAspectRatio,
  normalizeEphemeralDrawingObject,
  normalizeEphemeralDrawingsPageData,
  playhtmlDrawingElementId,
  removeEphemeralDrawing,
  removeEphemeralDrawingsByOwner,
  retainEphemeralDrawingsForPresentOwners,
  shouldAppendDrawingPoint,
  upsertEphemeralDrawing,
} from "@/lib/social/ephemeral-drawing";
import {
  buildDrawingDraft,
  createDrawingDraftId,
  DRAWING_DRAFT_STALE_MS,
  DRAWING_DRAFT_THROTTLE_MS,
  drawingDraftCanPublish,
  drawingDraftsForRemoteView,
  normalizeDrawingDraft,
  normalizeDrawingDraftCleared,
  pruneStaleDrawingDrafts,
  removeDrawingDraftsByOwner,
  retainDrawingDraftsForPresentOwners,
  upsertDrawingDraft,
} from "@/lib/social/drawing-draft";

const OWNER_A = "550e8400-e29b-41d4-a716-446655440000";
const OWNER_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const DRAW_A = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const stroke = {
  colour: "#171717" as const,
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.5 },
  ],
};

const baseGeom = {
  leftPct: 40,
  topPct: 50,
  widthPct: 22,
  heightPct: 22,
  aspectRatio: 1.6,
} as const;

describe("Social 3A ephemeral drawing helpers", () => {
  it("uses one brush size and a shared curated colour palette", () => {
    assert.equal(DRAWING_BRUSH_SIZE, 2.75);
    assert.equal(DRAWING_COLOUR_PALETTE.length, 20);
    assert.ok(DRAWING_COLOUR_PALETTE.every((c) => c.startsWith("#")));
    assert.ok(DRAWING_COLOUR_PALETTE.includes("#171717"));
    assert.ok(DRAWING_COLOUR_PALETTE.includes("#8FAE00"));
    assert.ok(DRAWING_COLOUR_PALETTE.includes("#3B82F6"));
    assert.ok(DRAWING_COLOUR_PALETTE.includes("#E11D48"));
    assert.ok(DRAWING_COLOUR_PALETTE.includes("#F59E0B"));
    assert.ok(DRAWING_COLOUR_PALETTE.includes("#0D9488"));
  });

  it("enforces stroke/point caps", () => {
    assert.equal(DRAWING_MAX_STROKES, 40);
    assert.equal(DRAWING_MAX_POINTS_PER_STROKE, 200);
    assert.equal(DRAWING_MAX_TOTAL_POINTS, 2_500);
    assert.equal(DRAWING_TOTAL_POINTS_LIMIT_COPY, "2,500 points max");
    assert.equal(drawingCanAcceptAnotherPoint([stroke]), true);
  });

  it("DONE requires at least one meaningful stroke", () => {
    assert.equal(hasMeaningfulStrokes([]), false);
    assert.equal(drawingDraftCanPublish([]), false);
    assert.equal(hasMeaningfulStrokes([stroke]), true);
  });

  it("reuses draft id as finished drawingId and persists aspectRatio", () => {
    const created = createEphemeralDrawingObject({
      drawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: [stroke],
      ...baseGeom,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.drawing.drawingId, DRAW_A);
    assert.equal(created.drawing.aspectRatio, 1.6);
    assert.equal(created.drawing.scale, 1);
    assert.equal(
      playhtmlDrawingElementId(created.drawing.drawingId),
      `4663-drawing-${DRAW_A}`,
    );
  });

  it("rejects empty drawing on create", () => {
    const created = createEphemeralDrawingObject({
      drawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: [],
      ...baseGeom,
    });
    assert.equal(created.ok, false);
  });

  it("accepts 2,500 total points and rejects the 2,501st", () => {
    const atCap: typeof stroke[] = Array.from({ length: 13 }, (_, s) => ({
      colour: "#171717" as const,
      points: Array.from({ length: s < 4 ? 193 : 192 }, () => ({
        x: 0.2,
        y: 0.3,
      })),
    }));
    assert.equal(countDrawingPoints(atCap), 2_500);
    assert.equal(drawingCanAcceptAnotherPoint(atCap), false);
    const ok = createEphemeralDrawingObject({
      drawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: atCap,
      ...baseGeom,
    });
    assert.equal(ok.ok, true);

    const over = [
      ...atCap.slice(0, -1),
      {
        colour: "#171717" as const,
        points: [
          ...atCap[atCap.length - 1]!.points,
          { x: 0.4, y: 0.5 },
        ],
      },
    ];
    assert.equal(countDrawingPoints(over), 2_501);
    const fail = createEphemeralDrawingObject({
      drawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: over,
      ...baseGeom,
    });
    assert.equal(fail.ok, false);
    if (!fail.ok) assert.equal(fail.error, "Drawing is too large.");
  });

  it("rejects invalid colour / oversized strokes in page data", () => {
    assert.equal(
      normalizeEphemeralDrawingObject({
        drawingId: DRAW_A,
        ownerSessionId: OWNER_A,
        strokes: [{ colour: "#ff00ff", points: [{ x: 0.1, y: 0.1 }] }],
        ...baseGeom,
        createdAt: "2026-08-13T00:00:00.000Z",
      }),
      null,
    );

    const tooManyPoints = Array.from(
      { length: DRAWING_MAX_POINTS_PER_STROKE + 1 },
      (_, i) => ({ x: i / 1000, y: i / 1000 }),
    );
    assert.equal(
      normalizeEphemeralDrawingObject({
        drawingId: DRAW_A,
        ownerSessionId: OWNER_A,
        strokes: [{ colour: "#171717", points: tooManyPoints }],
        ...baseGeom,
        createdAt: "2026-08-13T00:00:00.000Z",
      }),
      null,
    );
  });

  it("ignores malformed page-data drawings", () => {
    assert.equal(normalizeEphemeralDrawingObject(null), null);
    assert.equal(
      normalizeEphemeralDrawingObject({
        drawingId: "bad",
        ownerSessionId: OWNER_A,
        strokes: [stroke],
        ...baseGeom,
        createdAt: "2026-08-13T00:00:00.000Z",
      }),
      null,
    );
    const page = normalizeEphemeralDrawingsPageData({
      drawings: [
        null,
        {
          drawingId: DRAW_A,
          ownerSessionId: OWNER_A,
          strokes: [stroke],
          ...baseGeom,
          createdAt: "2026-08-13T00:00:00.000Z",
        },
      ],
    });
    assert.equal(page.drawings.length, 1);
    assert.equal(page.drawings[0]?.aspectRatio, 1.6);
  });

  it("owner remove / presence retain helpers", () => {
    const a = createEphemeralDrawingObject({
      drawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: [stroke],
      ...baseGeom,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(a.ok, true);
    if (!a.ok) return;
    const bId = "8c9e6679-7425-40de-944b-e07fc1f90ae8";
    const b = createEphemeralDrawingObject({
      drawingId: bId,
      ownerSessionId: OWNER_B,
      strokes: [stroke],
      leftPct: 20,
      topPct: 20,
      widthPct: 22,
      heightPct: 22,
      aspectRatio: 1.25,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(b.ok, true);
    if (!b.ok) return;

    let data = upsertEphemeralDrawing(
      upsertEphemeralDrawing({ drawings: [] }, a.drawing),
      b.drawing,
    );
    data = removeEphemeralDrawingsByOwner(data, OWNER_A);
    assert.equal(data.drawings.length, 1);
    assert.equal(data.drawings[0]?.ownerSessionId, OWNER_B);

    data = upsertEphemeralDrawing(data, a.drawing);
    data = retainEphemeralDrawingsForPresentOwners(
      data,
      new Set([OWNER_B]),
    );
    assert.equal(data.drawings.length, 1);
    assert.equal(data.drawings[0]?.drawingId, bId);

    data = removeEphemeralDrawing(data, bId);
    assert.equal(data.drawings.length, 0);
  });

  it("drawing zone centers on click using world-safe size", () => {
    const zone = drawingZoneOriginFromClick(50, 50);
    assert.ok(Math.abs(zone.widthPct - DRAWING_ZONE_WIDTH_PCT) < 1e-9);
    assert.ok(Math.abs(zone.heightPct - DRAWING_ZONE_HEIGHT_PCT) < 1e-9);
    assert.ok(zone.widthPct < 10);
    assert.ok(zone.heightPct < 10);
    assert.ok(zone.leftPct < 50);
    assert.ok(zone.topPct < 50);
  });

  it("samples pointer points with min delta", () => {
    assert.equal(
      shouldAppendDrawingPoint({ x: 0.1, y: 0.1 }, { x: 0.1001, y: 0.1001 }),
      false,
    );
    assert.equal(
      shouldAppendDrawingPoint({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }),
      true,
    );
  });

  it("live draft throttle / stale constants", () => {
    assert.equal(DRAWING_DRAFT_THROTTLE_MS, 75);
    assert.equal(DRAWING_DRAFT_STALE_MS, 8_000);
  });

  it("ignores malformed broadcast drafts", () => {
    assert.equal(normalizeDrawingDraft(null), null);
    assert.equal(
      normalizeDrawingDraft({
        draftDrawingId: "nope",
        ownerSessionId: OWNER_A,
        strokes: [],
        ...baseGeom,
        updatedAt: "2026-08-13T00:00:00.000Z",
      }),
      null,
    );
    assert.equal(normalizeDrawingDraftCleared({ draftDrawingId: DRAW_A }), null);
  });

  it("drawing draft includes aspectRatio", () => {
    const draft = buildDrawingDraft({
      draftDrawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: [stroke],
      ...baseGeom,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.ok(draft);
    assert.equal(draft!.aspectRatio, 1.6);
    const normalized = normalizeDrawingDraft(draft);
    assert.equal(normalized?.aspectRatio, 1.6);
  });

  it("self does not appear in remote draft view; stale drafts prune", () => {
    const draft = buildDrawingDraft({
      draftDrawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: [stroke],
      ...baseGeom,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.ok(draft);
    const remote = drawingDraftsForRemoteView([draft!], OWNER_A);
    assert.equal(remote.length, 0);

    const stale = pruneStaleDrawingDrafts(
      [draft!],
      Date.parse("2026-08-13T00:00:09.000Z"),
      DRAWING_DRAFT_STALE_MS,
    );
    assert.equal(stale.length, 0);
  });

  it("presence loss removes other owner drafts but not mine via retain", () => {
    const a = buildDrawingDraft({
      draftDrawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: [stroke],
      ...baseGeom,
    })!;
    const b = buildDrawingDraft({
      draftDrawingId: createDrawingDraftId(() => OWNER_B),
      ownerSessionId: OWNER_B,
      strokes: [stroke],
      leftPct: 20,
      topPct: 20,
      widthPct: 22,
      heightPct: 22,
      aspectRatio: 1.1,
    })!;
    let drafts = upsertDrawingDraft(upsertDrawingDraft([], a), b);
    drafts = retainDrawingDraftsForPresentOwners(drafts, new Set([OWNER_A]));
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]?.ownerSessionId, OWNER_A);
    drafts = removeDrawingDraftsByOwner(drafts, OWNER_A);
    assert.equal(drafts.length, 0);
  });

  it("allows colour per stroke", () => {
    const created = createEphemeralDrawingObject({
      drawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: [
        stroke,
        {
          colour: "#E11D48",
          points: [
            { x: 0.2, y: 0.2 },
            { x: 0.3, y: 0.3 },
          ],
        },
      ],
      ...baseGeom,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.drawing.strokes[1]?.colour, "#E11D48");
  });
});

describe("Social 3A.1 drawing aspect ratio", () => {
  it("accepts valid aspectRatio and rejects invalid", () => {
    assert.equal(DRAWING_ASPECT_RATIO_MIN, 0.1);
    assert.equal(DRAWING_ASPECT_RATIO_MAX, 10);
    assert.equal(normalizeDrawingAspectRatio(1.6), 1.6);
    assert.equal(normalizeDrawingAspectRatio(0.1), 0.1);
    assert.equal(normalizeDrawingAspectRatio(10), 10);
    assert.equal(normalizeDrawingAspectRatio(0), null);
    assert.equal(normalizeDrawingAspectRatio(-1), null);
    assert.equal(normalizeDrawingAspectRatio(Number.NaN), null);
    assert.equal(normalizeDrawingAspectRatio(Number.POSITIVE_INFINITY), null);
    assert.equal(normalizeDrawingAspectRatio(0.05), null);
    assert.equal(normalizeDrawingAspectRatio(11), null);
  });

  it("rejects finished objects with present-but-invalid aspectRatio", () => {
    assert.equal(
      normalizeEphemeralDrawingObject({
        drawingId: DRAW_A,
        ownerSessionId: OWNER_A,
        strokes: [stroke],
        leftPct: 10,
        topPct: 10,
        widthPct: 22,
        heightPct: 22,
        aspectRatio: 99,
        createdAt: "2026-08-13T00:00:00.000Z",
      }),
      null,
    );
  });

  it("backward compat derives aspectRatio from widthPct/heightPct when missing", () => {
    assert.equal(fallbackAspectRatioFromSizePct(22, 22), 1);
    assert.equal(fallbackAspectRatioFromSizePct(22, 11), 2);
    const legacy = normalizeEphemeralDrawingObject({
      drawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: [stroke],
      leftPct: 10,
      topPct: 10,
      widthPct: 22,
      heightPct: 11,
      createdAt: "2026-08-13T00:00:00.000Z",
    });
    assert.equal(legacy?.aspectRatio, 2);
  });

  it("late-join normalizer preserves explicit aspectRatio", () => {
    const normalized = normalizeEphemeralDrawingObject({
      drawingId: DRAW_A,
      ownerSessionId: OWNER_A,
      strokes: [stroke],
      leftPct: 10,
      topPct: 10,
      widthPct: 22,
      heightPct: 22,
      aspectRatio: 1.777,
      createdAt: "2026-08-13T00:00:00.000Z",
    });
    assert.equal(normalized?.aspectRatio, 1.777);
  });

  it("widthPct + aspectRatio keeps host physical ratio across canvas resize", () => {
    const aspectRatio = 1.6;
    const widthPct = 22;
    const wide = hostPhysicalAspectFromWidthAndRatio(1200, widthPct, aspectRatio);
    const narrow = hostPhysicalAspectFromWidthAndRatio(480, widthPct, aspectRatio);
    const tall = hostPhysicalAspectFromWidthAndRatio(800, widthPct, aspectRatio);
    assert.ok(wide != null && Math.abs(wide - aspectRatio) < 1e-9);
    assert.ok(narrow != null && Math.abs(narrow - aspectRatio) < 1e-9);
    assert.ok(tall != null && Math.abs(tall - aspectRatio) < 1e-9);
    assert.ok(Math.abs((wide as number) - (narrow as number)) < 1e-12);
    assert.ok(Math.abs((narrow as number) - (tall as number)) < 1e-12);
  });

  it("measureDrawingZoneAspectRatio captures canvas-relative zone ratio once", () => {
    const measured = measureDrawingZoneAspectRatio(1000, 500, 22, 22);
    assert.equal(measured, 2);
    assert.equal(measureDrawingZoneAspectRatio(0, 500, 22, 22), null);
    assert.equal(measureDrawingZoneAspectRatio(1000, 0, 22, 22), null);
  });
});
