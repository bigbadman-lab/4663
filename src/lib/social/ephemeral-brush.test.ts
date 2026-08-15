/**
 * Social 3B — ephemeral BRUSH data model + draft helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRUSH_DRAFT_CLEARED_EVENT,
  BRUSH_DRAFT_STALE_MS,
  BRUSH_DRAFT_THROTTLE_MS,
  BRUSH_DRAFT_UPDATED_EVENT,
  brushDraftCanPublish,
  brushDraftsForRemoteView,
  buildBrushDraft,
  createBrushDraftId,
  normalizeBrushDraft,
  normalizeBrushDraftCleared,
  pruneStaleBrushDrafts,
  removeBrushDraft,
  removeBrushDraftsByOwner,
  retainBrushDraftsForPresentOwners,
  upsertBrushDraft,
} from "@/lib/social/brush-draft";
import {
  BRUSH_MAX_POINTS_PER_STROKE,
  BRUSH_MAX_STROKES,
  BRUSH_MAX_TOTAL_POINTS,
  BRUSH_POINT_MIN_DELTA_WORLD_PCT,
  BRUSH_STROKE_WIDTH_WORLD_PX,
  clientPointToBrushWorldPct,
  commitBrushPublish,
  countBrushPoints,
  createEphemeralBrushDocument,
  EPHEMERAL_BRUSH_PAGE_DATA_NAME,
  isBrushPageDataWritable,
  normalizeBrushPoint,
  normalizeBrushStroke,
  normalizeBrushStrokes,
  normalizeEphemeralBrushPageData,
  removeEphemeralBrushDocumentsByOwner,
  resolveBrushDoneIntent,
  retainEphemeralBrushDocumentsForPresentOwners,
  shouldAppendBrushPoint,
  trimBrushStrokesToCaps,
  upsertBrushStrokesForOwner,
  type BrushStroke,
  type EphemeralBrushPageData,
} from "@/lib/social/ephemeral-brush";
import {
  DRAWING_BRUSH_SIZE,
  DRAWING_COLOUR_PALETTE,
  DRAWING_MAX_POINTS_PER_STROKE,
  DRAWING_MAX_STROKES,
  DRAWING_MAX_TOTAL_POINTS,
} from "@/lib/social/ephemeral-drawing";
import {
  screenPointToWorldPct,
  type CanvasCamera,
  type ViewportRect,
} from "@/lib/canvas/world-camera";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const DOC_A = "33333333-3333-4333-8333-333333333333";
const DRAFT_A = "44444444-4444-4444-8444-444444444444";

function stroke(
  points: { x: number; y: number }[],
  colour: (typeof DRAWING_COLOUR_PALETTE)[number] = DRAWING_COLOUR_PALETTE[0]!,
): BrushStroke {
  return { colour, points };
}

describe("Social 3B BRUSH data model", () => {
  it("uses dedicated page-data key and does not raise OBJECT caps", () => {
    assert.equal(EPHEMERAL_BRUSH_PAGE_DATA_NAME, "4663-ephemeral-brush-strokes");
    assert.equal(BRUSH_MAX_STROKES, DRAWING_MAX_STROKES);
    assert.equal(BRUSH_MAX_POINTS_PER_STROKE, DRAWING_MAX_POINTS_PER_STROKE);
    assert.equal(BRUSH_MAX_TOTAL_POINTS, DRAWING_MAX_TOTAL_POINTS);
    assert.equal(BRUSH_MAX_STROKES, 40);
    assert.equal(BRUSH_MAX_POINTS_PER_STROKE, 200);
    assert.equal(BRUSH_MAX_TOTAL_POINTS, 2_000);
    assert.ok(BRUSH_STROKE_WIDTH_WORLD_PX > 0);
    assert.equal(typeof DRAWING_BRUSH_SIZE, "number");
  });

  it("stores points as world % (0–100), not OBJECT local 0–1", () => {
    const ok = normalizeBrushPoint({ x: 42.5, y: 61 });
    assert.deepEqual(ok, { x: 42.5, y: 61 });
    assert.equal(normalizeBrushPoint({ x: 0.5, y: 0.5 })?.x, 0.5);
    assert.equal(normalizeBrushPoint({ x: 200, y: 50 }), null);
    const localLooking = normalizeBrushStroke({
      colour: "#171717",
      points: [
        { x: 0.12, y: 0.34 },
        { x: 0.5, y: 0.6 },
      ],
    });
    // Valid as world % near origin — not remapped as box-local.
    assert.ok(localLooking);
    assert.equal(localLooking!.points[0]!.x, 0.12);
  });

  it("enforces stroke/point caps and sampling delta", () => {
    assert.ok(BRUSH_POINT_MIN_DELTA_WORLD_PCT > 0);
    assert.equal(
      shouldAppendBrushPoint({ x: 10, y: 10 }, { x: 10.01, y: 10.01 }),
      false,
    );
    assert.equal(
      shouldAppendBrushPoint({ x: 10, y: 10 }, { x: 10.1, y: 10.1 }),
      true,
    );

    const tooManyPts = normalizeBrushStroke({
      colour: "#171717",
      points: Array.from({ length: BRUSH_MAX_POINTS_PER_STROKE + 1 }, (_, i) => ({
        x: i * 0.2,
        y: 10,
      })),
    });
    assert.equal(tooManyPts, null);

    const many = Array.from({ length: BRUSH_MAX_STROKES + 1 }, (_, i) =>
      stroke([{ x: i, y: i }]),
    );
    assert.equal(normalizeBrushStrokes(many), null);

    const trimmed = trimBrushStrokesToCaps(
      Array.from({ length: 50 }, (_, i) =>
        stroke(
          Array.from({ length: 100 }, (_, j) => ({
            x: (i + j) % 90,
            y: (i * 2 + j) % 90,
          })),
        ),
      ),
    );
    assert.ok(trimmed.length <= BRUSH_MAX_STROKES);
    assert.ok(countBrushPoints(trimmed) <= BRUSH_MAX_TOTAL_POINTS);
  });

  it("screen → world % uses canonical camera (pan + scale)", () => {
    const viewport: ViewportRect = {
      left: 100,
      top: 50,
      width: 800,
      height: 600,
    };
    const camera: CanvasCamera = { x: 400, y: 200, scale: 2 };
    const point = clientPointToBrushWorldPct(
      100 + 200,
      50 + 100,
      screenPointToWorldPct,
      { viewport, camera },
    );
    assert.ok(point);
    const expected = screenPointToWorldPct(300, 150, viewport, camera);
    assert.equal(point!.x, expected.leftPct);
    assert.equal(point!.y, expected.topPct);

    // After camera pan, same screen maps to different world — stored % is world-fixed.
    const panned = clientPointToBrushWorldPct(
      300,
      150,
      screenPointToWorldPct,
      { viewport, camera: { x: 800, y: 400, scale: 2 } },
    );
    assert.ok(panned);
    assert.notEqual(panned!.x, point!.x);
  });

  it("session-owned upsert merges strokes; owners stay isolated", () => {
    const created = createEphemeralBrushDocument({
      documentId: DOC_A,
      ownerSessionId: OWNER_A,
      strokes: [stroke([{ x: 10, y: 10 }, { x: 20, y: 20 }])],
      now: () => new Date("2026-08-14T12:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const data = { documents: [created.document] };
    const merged = upsertBrushStrokesForOwner(data, {
      ownerSessionId: OWNER_A,
      documentId: DOC_A,
      strokes: [stroke([{ x: 30, y: 30 }], DRAWING_COLOUR_PALETTE[1]!)],
      now: () => new Date("2026-08-14T12:01:00.000Z"),
    });
    assert.ok(merged);
    assert.equal(merged!.documents.length, 1);
    assert.equal(merged!.documents[0]!.strokes.length, 2);

    const withB = upsertBrushStrokesForOwner(merged!, {
      ownerSessionId: OWNER_B,
      documentId: DRAFT_A,
      strokes: [stroke([{ x: 50, y: 50 }])],
    });
    assert.ok(withB);
    assert.equal(withB!.documents.length, 2);

    const afterLeaveA = removeEphemeralBrushDocumentsByOwner(withB!, OWNER_A);
    assert.equal(afterLeaveA.documents.length, 1);
    assert.equal(afterLeaveA.documents[0]!.ownerSessionId, OWNER_B);

    const retained = retainEphemeralBrushDocumentsForPresentOwners(
      withB!,
      new Set([OWNER_B]),
    );
    assert.equal(retained.documents.length, 1);
    assert.equal(retained.documents[0]!.ownerSessionId, OWNER_B);
  });

  it("normalizes page data and rejects garbage", () => {
    assert.deepEqual(normalizeEphemeralBrushPageData(null), {
      documents: [],
    });
    assert.deepEqual(normalizeEphemeralBrushPageData({ documents: "x" }), {
      documents: [],
    });
  });
});

describe("Social 3B BRUSH drafts / broadcast helpers", () => {
  it("uses dedicated draft events and 75ms throttle", () => {
    assert.equal(BRUSH_DRAFT_UPDATED_EVENT, "brush-draft-updated");
    assert.equal(BRUSH_DRAFT_CLEARED_EVENT, "brush-draft-cleared");
    assert.equal(BRUSH_DRAFT_THROTTLE_MS, 75);
    assert.equal(BRUSH_DRAFT_STALE_MS, 8_000);
    assert.notEqual(BRUSH_DRAFT_UPDATED_EVENT, "drawing-draft-updated");
  });

  it("builds, upserts, prunes, and isolates drafts by owner", () => {
    const id = createBrushDraftId(() => DRAFT_A);
    assert.equal(id, DRAFT_A);

    const draft = buildBrushDraft({
      draftBrushId: DRAFT_A,
      ownerSessionId: OWNER_A,
      strokes: [stroke([{ x: 1, y: 2 }])],
      now: () => new Date("2026-08-14T12:00:00.000Z"),
    });
    assert.ok(draft);
    assert.equal(brushDraftCanPublish(draft!.strokes), true);

    let drafts = upsertBrushDraft([], draft!);
    const other = buildBrushDraft({
      draftBrushId: DOC_A,
      ownerSessionId: OWNER_B,
      strokes: [stroke([{ x: 3, y: 4 }])],
      now: () => new Date("2026-08-14T12:00:01.000Z"),
    });
    drafts = upsertBrushDraft(drafts, other!);
    assert.equal(drafts.length, 2);

    assert.equal(
      brushDraftsForRemoteView(drafts, OWNER_A).length,
      1,
    );
    assert.equal(
      brushDraftsForRemoteView(drafts, OWNER_A)[0]!.ownerSessionId,
      OWNER_B,
    );

    drafts = removeBrushDraft(drafts, DRAFT_A);
    assert.equal(drafts.length, 1);

    drafts = removeBrushDraftsByOwner(
      upsertBrushDraft(drafts, draft!),
      OWNER_B,
    );
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]!.ownerSessionId, OWNER_A);

    const stale = pruneStaleBrushDrafts(
      [
        {
          ...draft!,
          updatedAt: new Date(Date.now() - BRUSH_DRAFT_STALE_MS - 1).toISOString(),
        },
      ],
      Date.now(),
    );
    assert.equal(stale.length, 0);

    assert.ok(normalizeBrushDraft(draft));
    assert.ok(
      normalizeBrushDraftCleared({
        draftBrushId: DRAFT_A,
        ownerSessionId: OWNER_A,
      }),
    );
    assert.equal(
      retainBrushDraftsForPresentOwners(drafts, new Set([OWNER_B])).length,
      0,
    );
  });
});

describe("Social 3B BRUSH DONE publish (no silent delete)", () => {
  const strokes = [stroke([{ x: 12, y: 40 }, { x: 18, y: 46 }])];

  it("empty DONE keeps editing; non-empty DONE intends publish", () => {
    assert.equal(resolveBrushDoneIntent([]), "keep-editing");
    assert.equal(resolveBrushDoneIntent(strokes), "publish");
  });

  it("PlayHTML loading or missing provider is not writable", () => {
    assert.equal(
      isBrushPageDataWritable({ isLoading: false, isProviderMissing: false }),
      true,
    );
    assert.equal(
      isBrushPageDataWritable({ isLoading: true, isProviderMissing: false }),
      false,
    );
    assert.equal(
      isBrushPageDataWritable({ isLoading: false, isProviderMissing: true }),
      false,
    );
  });

  it("ready + strokes writes non-empty documents; caller may close", () => {
    const result = commitBrushPublish({
      previous: { documents: [] },
      ownerSessionId: OWNER_A,
      documentId: DOC_A,
      strokes,
      ready: true,
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pageData.documents.length, 1);
    assert.equal(result.pageData.documents[0]!.strokes.length, 1);
    assert.deepEqual(result.pageData.documents[0]!.strokes[0]!.points, [
      { x: 12, y: 40 },
      { x: 18, y: 46 },
    ]);
    const roundTrip = normalizeEphemeralBrushPageData(result.pageData);
    assert.equal(roundTrip.documents.length, 1);
  });

  it("not-ready / empty / rejected publish keeps prior page data unused", () => {
    const previous: EphemeralBrushPageData = { documents: [] };

    const empty = commitBrushPublish({
      previous,
      ownerSessionId: OWNER_A,
      documentId: DOC_A,
      strokes: [],
      ready: true,
    });
    assert.deepEqual(empty, { ok: false, reason: "empty" });

    const blocked = commitBrushPublish({
      previous,
      ownerSessionId: OWNER_A,
      documentId: DOC_A,
      strokes,
      ready: false,
    });
    assert.deepEqual(blocked, { ok: false, reason: "not-ready" });

    const rejected = commitBrushPublish({
      previous,
      ownerSessionId: "not-a-uuid",
      documentId: DOC_A,
      strokes,
      ready: true,
    });
    assert.deepEqual(rejected, { ok: false, reason: "rejected" });
  });
});
