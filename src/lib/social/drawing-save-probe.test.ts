/**
 * DRAW save-failure investigation: payload probes, validator boundary, DONE behaviour.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DRAWING_EXPLICIT_LIMITS,
  generateDrawingByTotalPoints,
  generateDrawingStrokes,
  measureDrawingPayload,
  simulateDrawingPublish,
} from "@/lib/social/drawing-save-probe";
import {
  DRAWING_MAX_POINTS_PER_STROKE,
  DRAWING_MAX_STROKES,
  DRAWING_MAX_TOTAL_POINTS,
} from "@/lib/social/ephemeral-drawing";
import {
  BRUSH_MAX_POINTS_PER_STROKE,
  BRUSH_MAX_STROKES,
  BRUSH_MAX_TOTAL_POINTS,
  commitBrushPublish,
  createEphemeralBrushDocument,
} from "@/lib/social/ephemeral-brush";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const DOC = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("DRAW save probe — generation + metrics", () => {
  it("1. small DRAW payload saves successfully", () => {
    const strokes = generateDrawingStrokes({
      strokeCount: 3,
      pointsPerStroke: 8,
    });
    const result = simulateDrawingPublish({ strokes });
    assert.equal(result.validationPasses, true);
    assert.equal(result.playhtmlWriteAttempted, true);
    assert.equal(result.playhtmlAccepted, true);
    assert.equal(result.readBackPersisted, true);
    assert.equal(result.doneWouldClose, true);
    assert.equal(result.metrics.strokeCount, 3);
    assert.equal(result.metrics.totalPointCount, 24);
  });

  it("2–3. deterministic large drawings; stroke count independent of point count", () => {
    const manyShort = generateDrawingStrokes({
      strokeCount: 40,
      pointsPerStroke: 3,
    });
    const fewLong = generateDrawingStrokes({
      strokeCount: 2,
      pointsPerStroke: 200,
    });
    assert.equal(manyShort.length, 40);
    assert.equal(
      manyShort.reduce((n, s) => n + s.points.length, 0),
      120,
    );
    assert.equal(fewLong.length, 2);
    assert.equal(
      fewLong.reduce((n, s) => n + s.points.length, 0),
      400,
    );
    const distributed = generateDrawingByTotalPoints({
      strokeCount: 13,
      totalPoints: 2501,
    });
    assert.equal(
      distributed.reduce((n, s) => n + s.points.length, 0),
      2501,
    );
  });

  it("4. payload byte size is measurable and grows with points", () => {
    const small = measureDrawingPayload(
      generateDrawingStrokes({ strokeCount: 1, pointsPerStroke: 10 }),
    );
    const large = measureDrawingPayload(
      generateDrawingStrokes({ strokeCount: 1, pointsPerStroke: 200 }),
    );
    assert.ok(small.drawingUtf8Bytes > 0);
    assert.ok(large.drawingUtf8Bytes > small.drawingUtf8Bytes);
    assert.ok(large.svgPathChars > small.svgPathChars);
    assert.equal(large.maxPointsInOneStroke, 200);
  });
});

describe("DRAW save probe — validator + PlayHTML simulation", () => {
  it("5. current validator boundary is 40 strokes / 200 pts/stroke / 2500 total", () => {
    assert.deepEqual(DRAWING_EXPLICIT_LIMITS, {
      maxStrokes: 40,
      maxPointsPerStroke: 200,
      maxTotalPoints: 2500,
    });

    const atCap = generateDrawingByTotalPoints({
      strokeCount: 13,
      totalPoints: DRAWING_MAX_TOTAL_POINTS,
    });
    const overCap = generateDrawingByTotalPoints({
      strokeCount: 13,
      totalPoints: DRAWING_MAX_TOTAL_POINTS + 1,
    });
    const ok = simulateDrawingPublish({ strokes: atCap });
    const fail = simulateDrawingPublish({ strokes: overCap });
    assert.equal(ok.validationPasses, true);
    assert.equal(ok.readBackPersisted, true);
    assert.equal(fail.validationPasses, false);
    assert.equal(fail.validationError, "Drawing is too large.");
    assert.equal(fail.playhtmlWriteAttempted, false);
    assert.equal(fail.metrics.totalPointCount, 2501);
  });

  it("stroke-count axis: 40 short strokes save; 41 are rejected before PlayHTML", () => {
    const forty = generateDrawingStrokes({
      strokeCount: DRAWING_MAX_STROKES,
      pointsPerStroke: 2,
    });
    const fortyOne = generateDrawingStrokes({
      strokeCount: DRAWING_MAX_STROKES + 1,
      pointsPerStroke: 2,
    });
    const ok = simulateDrawingPublish({ strokes: forty });
    const fail = simulateDrawingPublish({ strokes: fortyOne });
    assert.equal(ok.validationPasses, true);
    assert.equal(fail.validationPasses, false);
    assert.equal(fail.validationError, "Too many strokes.");
    assert.equal(fail.playhtmlWriteAttempted, false);
  });

  it("points-per-stroke axis: 200 saves; 201 rejected as invalid stroke", () => {
    const ok = simulateDrawingPublish({
      strokes: generateDrawingStrokes({
        strokeCount: 1,
        pointsPerStroke: DRAWING_MAX_POINTS_PER_STROKE,
      }),
    });
    const fail = simulateDrawingPublish({
      strokes: generateDrawingStrokes({
        strokeCount: 1,
        pointsPerStroke: DRAWING_MAX_POINTS_PER_STROKE + 1,
      }),
    });
    assert.equal(ok.validationPasses, true);
    assert.equal(fail.validationPasses, false);
    assert.equal(fail.validationError, "Invalid stroke.");
  });

  it("6–8. PlayHTML write is not attempted after validator reject; success round-trips", () => {
    const fail = simulateDrawingPublish({
      strokes: generateDrawingByTotalPoints({
        strokeCount: 13,
        totalPoints: 2501,
      }),
    });
    assert.equal(fail.playhtmlWriteAttempted, false);
    assert.equal(fail.playhtmlAccepted, false);
    assert.equal(fail.readBackPersisted, false);

    const ok = simulateDrawingPublish({
      strokes: generateDrawingByTotalPoints({
        strokeCount: 13,
        totalPoints: 2500,
      }),
    });
    assert.equal(ok.playhtmlWriteAttempted, true);
    assert.equal(ok.playhtmlAccepted, true);
    assert.equal(ok.readBackPersisted, true);
    assert.ok(ok.metrics.pageDataUtf8Bytes > ok.metrics.drawingUtf8Bytes);
  });

  it("payload-size axis: failure tracks total points, not a byte-size cliff", () => {
    const atCap = simulateDrawingPublish({
      strokes: generateDrawingByTotalPoints({
        strokeCount: 13,
        totalPoints: 2500,
      }),
    });
    const over = simulateDrawingPublish({
      strokes: generateDrawingByTotalPoints({
        strokeCount: 13,
        totalPoints: 2501,
      }),
    });
    assert.equal(atCap.validationPasses, true);
    assert.equal(over.validationPasses, false);
    assert.equal(over.metrics.totalPointCount, atCap.metrics.totalPointCount + 1);
    assert.ok(atCap.metrics.drawingUtf8Bytes > 10_000);
    assert.ok(atCap.metrics.pageDataUtf8Bytes < 200_000);
    assert.ok(over.metrics.pageDataUtf8Bytes < 200_000);
  });

  it("probes requested stroke/point progressions and records the first failure", () => {
    const strokeProbes = [10, 25, 50, 100];
    const firstStrokeFail = strokeProbes.find((n) => {
      return !simulateDrawingPublish({
        strokes: generateDrawingStrokes({ strokeCount: n, pointsPerStroke: 2 }),
      }).validationPasses;
    });
    assert.equal(firstStrokeFail, 50);

    const pointProbes = [100, 500, 1000, 2500, 2501];
    const firstPointFail = pointProbes.find((n) => {
      return !simulateDrawingPublish({
        strokes: generateDrawingByTotalPoints({
          strokeCount: Math.min(40, Math.ceil(n / 200)),
          totalPoints: n,
        }),
      }).validationPasses;
    });
    assert.equal(firstPointFail, 2501);
  });
});

describe("DRAW save probe — DONE behaviour + BRUSH comparison", () => {
  it("9. current DONE stays open on failed publish and shows no error", () => {
    const fail = simulateDrawingPublish({
      strokes: generateDrawingByTotalPoints({
        strokeCount: 13,
        totalPoints: 2501,
      }),
    });
    assert.equal(fail.doneWouldClose, false);
    assert.equal(fail.doneWouldRemainOpen, true);

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    const publish = layer.slice(
      layer.indexOf("const publishDrawing"),
      layer.indexOf("const onBrushStrokesChange"),
    );
    assert.ok(publish.includes("if (!created.ok) return;"));
    assert.ok(publish.includes("setCreateUi(null)"));
    assert.ok(publish.indexOf("if (!created.ok) return;") < publish.indexOf("setCreateUi(null)"));
    assert.equal(publish.includes("error"), false);

    const editor = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.ok(editor.includes("DRAWING_MAX_STROKES"));
    assert.ok(editor.includes("DRAWING_MAX_POINTS_PER_STROKE"));
    assert.ok(editor.includes("drawingCanAcceptAnotherPoint"));
    assert.ok(editor.includes("DRAWING_TOTAL_POINTS_LIMIT_COPY"));
  });

  it("10. BRUSH keeps a 2,000-point trim cap; DRAW rejects 2,501", () => {
    assert.equal(BRUSH_MAX_STROKES, DRAWING_MAX_STROKES);
    assert.equal(BRUSH_MAX_POINTS_PER_STROKE, DRAWING_MAX_POINTS_PER_STROKE);
    assert.equal(BRUSH_MAX_TOTAL_POINTS, 2_000);
    assert.equal(DRAWING_MAX_TOTAL_POINTS, 2_500);

    const oversized = generateDrawingByTotalPoints({
      strokeCount: 13,
      totalPoints: 2501,
    });
    const created = createEphemeralBrushDocument({
      documentId: DOC,
      ownerSessionId: OWNER,
      strokes: oversized,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(
      created.document.strokes.reduce((n, s) => n + s.points.length, 0),
      2000,
    );

    const committed = commitBrushPublish({
      previous: { documents: [] },
      ownerSessionId: OWNER,
      documentId: DOC,
      strokes: oversized,
      ready: true,
    });
    assert.equal(committed.ok, true);

    const draw = simulateDrawingPublish({ strokes: oversized });
    assert.equal(draw.validationPasses, false);
    assert.equal(draw.validationError, "Drawing is too large.");
  });
});
