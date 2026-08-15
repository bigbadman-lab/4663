/**
 * Social 3A — ephemeral DRAW UI / wiring (structural).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DRAWING_BRUSH_SIZE,
  DRAWING_COLOUR_PALETTE,
  EPHEMERAL_DRAWINGS_PAGE_DATA_NAME,
  playhtmlDrawingElementId,
} from "@/lib/social/ephemeral-drawing";
import {
  DRAWING_DRAFT_CLEARED_EVENT,
  DRAWING_DRAFT_THROTTLE_MS,
  DRAWING_DRAFT_UPDATED_EVENT,
} from "@/lib/social/drawing-draft";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Social 3A ephemeral DRAW UI", () => {
  it("anonymous cannot start DRAW; named empty-hit gates create", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("if (!isParticipating || !self) return"));
    assert.ok(layer.includes("onChooseDraw"));
    assert.ok(layer.includes('mode: "draw"'));
  });

  it("create menu includes DRAW alongside TEXT and CANCEL", () => {
    const menu = readSrc("src/components/social/canvas-create-menu.tsx");
    assert.ok(menu.includes("[ TEXT ]"));
    assert.ok(menu.includes("[ DRAW ]"));
    assert.ok(menu.includes("[ CANCEL ]"));
    assert.ok(menu.includes("onChooseDraw"));
    assert.ok(menu.includes("data-4663-canvas-create-draw"));
  });

  it("TEXT and DRAW modes cannot overlap (single createUi discriminant)", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes('mode: "compose"'));
    assert.ok(layer.includes('mode: "draw"'));
    assert.ok(layer.includes("createUi?.mode === \"compose\""));
    assert.ok(layer.includes("createUi?.mode === \"draw\""));
    assert.ok(layer.includes("abandonCreate"));
  });

  it("drawing editor uses pointer events, one brush, shared palette, undo/clear/done/cancel", () => {
    const editor = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.ok(editor.includes("onPointerDown"));
    assert.ok(editor.includes("onPointerMove"));
    assert.ok(editor.includes("onPointerUp"));
    assert.ok(editor.includes("setPointerCapture"));
    assert.ok(editor.includes("DRAWING_BRUSH_SIZE"));
    assert.ok(editor.includes("DRAW_COLOURS"));
    assert.ok(editor.includes("[ UNDO ]"));
    assert.ok(editor.includes("[ CLEAR ]"));
    assert.ok(editor.includes("[ DONE ]"));
    assert.ok(editor.includes("[ CANCEL ]"));
    assert.ok(editor.includes("drawingCanAcceptAnotherPoint"));
    assert.ok(editor.includes("DRAWING_TOTAL_POINTS_LIMIT_COPY"));
    assert.ok(editor.includes("data-4663-drawing-point-limit"));
    assert.ok(editor.includes("Escape"));
    assert.ok(editor.includes("cursor-crosshair") || editor.includes("crosshair"));
    assert.equal(DRAWING_COLOUR_PALETTE.length, 20);
    assert.equal(typeof DRAWING_BRUSH_SIZE, "number");
  });

  it("empty drawing cannot DONE; DONE publishes finished drawing", () => {
    const editor = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.ok(editor.includes("drawingDraftCanPublish"));
    assert.ok(editor.includes("disabled={!canDone}"));
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("publishDrawing"));
    assert.ok(layer.includes("createEphemeralDrawingObject"));
    assert.ok(layer.includes("clearLocalDrawingDraftBroadcast"));
    assert.ok(layer.includes("upsertEphemeralDrawing"));
  });

  it("stable drawing id and PlayHTML host format", () => {
    assert.equal(
      playhtmlDrawingElementId("550e8400-e29b-41d4-a716-446655440000"),
      "4663-drawing-550e8400-e29b-41d4-a716-446655440000",
    );
    const object = readSrc(
      "src/components/social/ephemeral-drawing-object.tsx",
    );
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(object));
    assert.ok(object.includes("playhtmlDrawingElementId"));
    assert.ok(object.includes("cursor-grab"));
    assert.ok(object.includes("pointer-events-none"));
  });

  it("finished drawing late-join sync via page data; live via broadcast", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("EPHEMERAL_DRAWINGS_PAGE_DATA_NAME"));
    assert.ok(layer.includes("usePageData<EphemeralDrawingsPageData>"));
    assert.ok(layer.includes("sendDrawingDraftUpdated"));
    assert.ok(layer.includes("LiveDrawingDraftView"));
    assert.ok(layer.includes("drawingDraftsForRemoteView"));
    assert.equal(EPHEMERAL_DRAWINGS_PAGE_DATA_NAME, "4663-ephemeral-drawings");
    assert.equal(DRAWING_DRAFT_UPDATED_EVENT, "drawing-draft-updated");
    assert.equal(DRAWING_DRAFT_CLEARED_EVENT, "drawing-draft-cleared");
    assert.equal(DRAWING_DRAFT_THROTTLE_MS, 75);
  });

  it("live draft is not movable; self excluded from remote projection", () => {
    const live = readSrc("src/components/social/live-drawing-draft.tsx");
    assert.equal(live.includes("<CanMoveElement"), false);
    assert.ok(live.includes("pointer-events-none"));
    assert.ok(live.includes("opacity={0.72}") || live.includes("opacity"));
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("drawingDraftsForRemoteView"));
  });

  it("owner can delete; remote cannot", () => {
    const object = readSrc(
      "src/components/social/ephemeral-drawing-object.tsx",
    );
    assert.ok(object.includes("data-4663-ephemeral-drawing-delete"));
    assert.ok(object.includes("isOwner"));
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("onDeleteDrawing"));
    assert.ok(layer.includes("ownerSessionId !== self.sessionId"));
  });

  it("LEAVE and Presence-loss cleanup cover drawings + drafts", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("removeEphemeralDrawingsByOwner"));
    assert.ok(layer.includes("retainEphemeralDrawingsForPresentOwners"));
    assert.ok(layer.includes("removeDrawingDraftsByOwner"));
    assert.ok(layer.includes("retainDrawingDraftsForPresentOwners"));
    assert.ok(layer.includes("pruneStaleDrawingDrafts"));
    assert.ok(layer.includes('status === "connecting"'));
  });

  it("broadcast client listens for drawing draft events", () => {
    const client = readSrc("src/lib/social/social-broadcast.ts");
    assert.ok(client.includes("DRAWING_DRAFT_UPDATED_EVENT"));
    assert.ok(client.includes("DRAWING_DRAFT_CLEARED_EVENT"));
    assert.ok(client.includes("sendDrawingDraftUpdated"));
    assert.ok(client.includes("sendDrawingDraftCleared"));
  });

  it("Social 3A.1 editor/live/finished use width + aspect-ratio, not height%", () => {
    const editor = readSrc("src/components/social/drawing-session-editor.tsx");
    assert.ok(editor.includes("aspectRatio: String(aspectRatio)"));
    assert.equal(editor.includes("height: `${heightPct}%`"), false);
    assert.ok(editor.includes("width: `${widthPct}%`"));

    const live = readSrc("src/components/social/live-drawing-draft.tsx");
    assert.ok(live.includes("aspectRatio: String(draft.aspectRatio)"));
    assert.equal(live.includes("height: `${draft.heightPct}%`"), false);

    const object = readSrc(
      "src/components/social/ephemeral-drawing-object.tsx",
    );
    assert.ok(object.includes("aspectRatio: String(drawing.aspectRatio)"));
    assert.equal(object.includes("height: `${drawing.heightPct}%`"), false);
    assert.ok(object.includes("data-4663-ephemeral-drawing-delete"));
    assert.ok(object.includes("pointer-events-auto absolute z-[16]"));
    assert.ok(object.includes("pointer-events-none absolute z-[16]"));
  });

  it("Social 3A.1 / IC2 captures aspect from world zone; SVG viewBox unchanged", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("drawingZoneWorldAspectRatio"));
    assert.ok(layer.includes("aspectRatio"));
    assert.ok(layer.includes("aspectRatio: ui.aspectRatio"));

    const svg = readSrc("src/components/social/drawing-strokes-svg.tsx");
    assert.ok(svg.includes('viewBox="0 0 100 100"'));
    assert.ok(svg.includes('preserveAspectRatio="none"'));
  });

  it("TEXT / live typing / pills / SUMMON / PONS / patch unchanged", () => {
    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("EPHEMERAL_TEXTS_PAGE_DATA_NAME"));
    assert.ok(layer.includes("LiveTextDraftView"));
    assert.ok(layer.includes("TEXT_DRAFT_THROTTLE_MS"));

    const pill = readSrc("src/components/social/participant-pill.tsx");
    assert.ok(pill.includes("playhtmlParticipantElementId"));

    const summon = readSrc("src/lib/canvas/summon.ts");
    assert.ok(summon.includes("SUMMON_LIFETIME_MS"));

    const pons = readSrc("src/components/canvas/pons-buying-activity-object.tsx");
    assert.ok(pons.includes("CanMoveElement"));

    const pkg = readSrc("package.json");
    assert.ok(pkg.includes("patch-package"));
  });
});
