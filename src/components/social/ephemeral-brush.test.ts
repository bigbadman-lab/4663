/**
 * Social 3B — BRUSH UI / wiring (structural) + OBJECT DRAW regression.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRUSH_DRAFT_CLEARED_EVENT,
  BRUSH_DRAFT_THROTTLE_MS,
  BRUSH_DRAFT_UPDATED_EVENT,
} from "@/lib/social/brush-draft";
import { EPHEMERAL_BRUSH_PAGE_DATA_NAME } from "@/lib/social/ephemeral-brush";
import {
  DRAWING_DRAFT_CLEARED_EVENT,
  DRAWING_DRAFT_UPDATED_EVENT,
} from "@/lib/social/drawing-draft";
import { EPHEMERAL_DRAWINGS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-drawing";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Social 3B BRUSH UI wiring", () => {
  it("DRAW entry presents OBJECT / BRUSH chooser from dock and empty-canvas", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    const chooser = readSrc(
      "src/components/social/canvas-draw-mode-chooser.tsx",
    );
    assert.ok(chooser.includes("[ OBJECT ]"));
    assert.ok(chooser.includes("[ BRUSH ]"));
    assert.ok(chooser.includes("data-4663-draw-mode-object"));
    assert.ok(chooser.includes("data-4663-draw-mode-brush"));
    assert.ok(layer.includes('mode: "draw-chooser"'));
    assert.ok(layer.includes("openDrawChooserAt"));
    assert.ok(layer.includes("onChooseDraw={() => {"));
    assert.ok(layer.includes('mode: "draw-chooser"'));
    assert.ok(layer.includes("CanvasDrawModeChooser"));
  });

  it("OBJECT path still opens DrawingSessionEditor unchanged", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    const editor = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.ok(layer.includes('mode: "draw"'));
    assert.ok(layer.includes("DrawingSessionEditor"));
    assert.ok(layer.includes("openObjectFromChooser"));
    assert.ok(layer.includes("createEphemeralDrawingObject"));
    assert.ok(layer.includes("EPHEMERAL_DRAWINGS_PAGE_DATA_NAME"));
    assert.ok(editor.includes("pointerToNormalized"));
    assert.ok(editor.includes("DRAWING_BRUSH_SIZE"));
    assert.ok(editor.includes("[ DONE ]"));
    assert.equal(EPHEMERAL_DRAWINGS_PAGE_DATA_NAME, "4663-ephemeral-drawings");
  });

  it("BRUSH arms world overlay with pan block, DONE, ESC, toggle", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    const overlay = readSrc("src/components/social/brush-session-overlay.tsx");
    assert.ok(layer.includes('mode: "brush"'));
    assert.ok(layer.includes("BrushSessionOverlay"));
    assert.ok(layer.includes("setCreateUiBlocksPan(createUi != null)"));
    assert.ok(overlay.includes("data-4663-brush-surface"));
    assert.ok(overlay.includes("setPointerCapture"));
    assert.ok(overlay.includes("releasePointerCapture"));
    assert.ok(overlay.includes("touch-none"));
    assert.ok(overlay.includes("[ DONE ]"));
    assert.ok(overlay.includes("Escape"));
    assert.ok(overlay.includes("data-4663-brush-toggle"));
    assert.ok(overlay.includes("onToggleExit"));
    assert.ok(overlay.includes("screenPointToWorldPct"));
    assert.ok(overlay.includes("getCanvasPlacementSnapshot"));
    assert.ok(overlay.includes("clientPointToBrushWorldPct"));
  });

  it("live brush drafts use dedicated broadcast events", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    const client = readSrc("src/lib/social/social-broadcast.ts");
    assert.equal(BRUSH_DRAFT_UPDATED_EVENT, "brush-draft-updated");
    assert.equal(BRUSH_DRAFT_CLEARED_EVENT, "brush-draft-cleared");
    assert.equal(BRUSH_DRAFT_THROTTLE_MS, 75);
    assert.ok(client.includes("BRUSH_DRAFT_UPDATED_EVENT"));
    assert.ok(client.includes("sendBrushDraftUpdated"));
    assert.ok(client.includes("onBrushDraftUpdated"));
    assert.ok(layer.includes("LiveBrushDraftView"));
    assert.ok(layer.includes("brushDraftsForRemoteView"));
    assert.ok(layer.includes("sendBrushDraftUpdated"));
    // OBJECT events unchanged and distinct.
    assert.equal(DRAWING_DRAFT_UPDATED_EVENT, "drawing-draft-updated");
    assert.equal(DRAWING_DRAFT_CLEARED_EVENT, "drawing-draft-cleared");
    assert.notEqual(BRUSH_DRAFT_UPDATED_EVENT, DRAWING_DRAFT_UPDATED_EVENT);
  });

  it("persists brush via PlayHTML page data; LEAVE/RESET/presence cleanup", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.equal(EPHEMERAL_BRUSH_PAGE_DATA_NAME, "4663-ephemeral-brush-strokes");
    assert.ok(layer.includes("EPHEMERAL_BRUSH_PAGE_DATA_NAME"));
    assert.ok(layer.includes("usePageData<EphemeralBrushPageData>"));
    assert.ok(layer.includes("commitBrushPublish"));
    assert.ok(layer.includes("removeEphemeralBrushDocumentsByOwner"));
    assert.ok(layer.includes("retainEphemeralBrushDocumentsForPresentOwners"));
    assert.ok(layer.includes("removeBrushDraftsByOwner"));
    assert.ok(layer.includes("retainBrushDraftsForPresentOwners"));
    assert.ok(layer.includes("pruneStaleBrushDrafts"));
    assert.ok(layer.includes("EphemeralBrushLayer"));
  });

  it("completed brush layer is non-interactive world SVG", () => {
    const layer = readSrc("src/components/social/ephemeral-brush-layer.tsx");
    const svg = readSrc("src/components/social/brush-strokes-svg.tsx");
    assert.ok(layer.includes("pointer-events-none"));
    assert.equal(layer.includes("CanMoveElement"), false);
    assert.ok(svg.includes("WORLD_WIDTH_PX"));
    assert.ok(svg.includes("BRUSH_STROKE_WIDTH_WORLD_PX"));
  });

  it("stroke width is world-space (scales with camera), not screen-fixed HUD", () => {
    const svg = readSrc("src/components/social/brush-strokes-svg.tsx");
    const overlay = readSrc("src/components/social/brush-session-overlay.tsx");
    const live = readSrc("src/components/social/live-brush-draft.tsx");
    const published = readSrc(
      "src/components/social/ephemeral-brush-layer.tsx",
    );
    // Shared renderer for local active, remote live, and published strokes.
    assert.ok(overlay.includes("<BrushStrokesSvg"));
    assert.ok(live.includes("<BrushStrokesSvg"));
    assert.ok(published.includes("<BrushStrokesSvg"));
    // Thickness is world-px strokeWidth; must not lock to screen pixels.
    assert.ok(svg.includes("strokeWidth={BRUSH_STROKE_WIDTH_WORLD_PX}"));
    assert.equal(svg.includes("vector-effect="), false);
    assert.equal(svg.includes("non-scaling-stroke"), false);
  });

  it("interaction precedence: brush surface captures; tools interactive", () => {
    const overlay = readSrc("src/components/social/brush-session-overlay.tsx");
    assert.ok(overlay.includes("stopPropagation"));
    assert.ok(overlay.includes("isInteractiveCanvasControlTarget"));
    assert.ok(overlay.includes("data-4663-interactive-control"));
    assert.ok(overlay.includes("data-4663-brush-tools"));
    assert.ok(overlay.includes("preventDefault"));
  });

  it("create menu still exposes DRAW; chooser is the mode fork", () => {
    const menu = readSrc("src/components/social/canvas-create-menu.tsx");
    assert.ok(menu.includes("[ DRAW ]"));
    assert.ok(menu.includes("onChooseDraw"));
  });
});

describe("Social 3B BRUSH DONE does not silently delete", () => {
  it("empty DONE does not cancel; overlay stays until successful publish", () => {
    const overlay = readSrc("src/components/social/brush-session-overlay.tsx");
    const doneFn = overlay.slice(
      overlay.indexOf("const done = () => {"),
      overlay.indexOf("useEffect(() => {"),
    );
    assert.ok(doneFn.includes("resolveBrushDoneIntent(finalStrokes)"));
    assert.equal(doneFn.includes("onCancel()"), false);
    assert.ok(doneFn.includes("onDone(finalStrokes)"));

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("if (publishBrush(strokes)) setCreateUi(null)"));
    assert.ok(layer.includes("commitBrushPublish"));
    assert.ok(layer.includes("isBrushPageDataWritable"));
    assert.ok(layer.includes("usePlayContext"));
    assert.equal(layer.includes("if (!committed.ok) return false"), true);
  });

  it("BRUSH page-data refs stay current during render like TEXT/OBJECT", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("brushPageDataRef.current = brushPageData"));
    assert.ok(layer.includes("setBrushPageDataRef.current = setBrushPageData"));
    assert.equal(
      layer.includes("avoids react-hooks/refs during render"),
      false,
    );
  });

  it("explicit cancel still discards; persisted layer still renders documents", () => {
    const overlay = readSrc("src/components/social/brush-session-overlay.tsx");
    assert.ok(overlay.includes("onCancel"));
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("onCancel={abandonCreate}"));
    const published = readSrc(
      "src/components/social/ephemeral-brush-layer.tsx",
    );
    assert.ok(published.includes("documents.map"));
    assert.ok(published.includes("<BrushStrokesSvg strokes={doc.strokes} />"));
  });

  it("OBJECT DRAW empty DONE still returns without cancel", () => {
    const editor = readSrc("src/components/social/drawing-session-editor.tsx");
    const doneFn = editor.slice(
      editor.indexOf("const done = () => {"),
      editor.indexOf("useEffect(() => {"),
    );
    assert.ok(doneFn.includes("if (!drawingDraftCanPublish(finalStrokes)) return"));
    assert.equal(doneFn.includes("onCancel()"), false);
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("onDone={publishDrawing}"));
    assert.ok(layer.includes("createEphemeralDrawingObject"));
    assert.ok(layer.includes("EPHEMERAL_DRAWINGS_PAGE_DATA_NAME"));
  });
});
