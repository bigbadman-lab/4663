/**
 * SNAPSHOT UI + wiring structural tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("SNAPSHOT control + preview wiring", () => {
  it("1. SNAPSHOT control starts capture", () => {
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("[ SNAPSHOT ]"));
    assert.ok(palette.includes("data-4663-snapshot-trigger"));
    assert.ok(palette.includes("getSnapshotActions()?.startCapture()"));
    const layer = readSrc("src/components/social/canvas-snapshot-layer.tsx");
    assert.ok(layer.includes("registerSnapshotActions"));
    assert.ok(layer.includes("beginSnapshotIfNamed"));
    assert.ok(layer.includes("captureVisibleCanvasViewport"));
    const actions = readSrc("src/lib/canvas/snapshot-actions.ts");
    assert.ok(actions.includes("attachSnapshotShortcutListener"));
    assert.ok(actions.includes("handleSnapshotShortcutKeyDown"));
    assert.ok(actions.includes("actions.startCapture()"));
    assert.ok(actions.includes("beginSnapshotIfNamed"));
    assert.ok(actions.includes("requestParticipationEnter"));
  });

  it("1b. guest SNAPSHOT requests ENTER and does not capture", () => {
    const layer = readSrc("src/components/social/canvas-snapshot-layer.tsx");
    assert.ok(layer.includes("beginSnapshotIfNamed"));
    assert.ok(layer.includes("isParticipating && self"));
    assert.ok(layer.includes("captureViewport"));
    const start = layer.slice(
      layer.indexOf("const startCapture"),
      layer.indexOf("return registerSnapshotActions"),
    );
    assert.ok(start.includes("beginSnapshotIfNamed"));
    assert.equal(start.includes("captureVisibleCanvasViewport"), false);
    const capture = layer.slice(
      layer.indexOf("const captureViewport"),
      layer.indexOf("const startCapture"),
    );
    assert.ok(capture.includes("captureVisibleCanvasViewport"));
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("getSnapshotActions()?.startCapture()"));
    assert.equal(palette.includes("requestParticipationEnter"), false);
    assert.equal(palette.includes("isParticipating"), false);
  });

  it("2. capture targets canvas world viewport, not app chrome", () => {
    const capture = readSrc("src/lib/canvas/snapshot-capture.ts");
    assert.ok(capture.includes("SNAPSHOT_CAPTURE_ROOT_SELECTOR"));
    assert.ok(capture.includes("html-to-image"));
    assert.ok(capture.includes("toBlob"));
    const exclude = readSrc("src/lib/canvas/snapshot-exclude.ts");
    assert.ok(exclude.includes("[data-4663-canvas-viewport]"));
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("data-4663-snapshot-exclude"));
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("data-4663-snapshot-exclude"));
  });

  it("3. excluded UI uses the snapshot-exclude attribute", () => {
    for (const file of [
      "src/components/social/drawing-session-editor.tsx",
      "src/components/social/brush-session-overlay.tsx",
      "src/components/social/canvas-create-menu.tsx",
      "src/components/social/ephemeral-text-composer.tsx",
      "src/components/canvas/pons-monitoring-panel.tsx",
      "src/components/canvas/snapshot-preview.tsx",
      "src/components/canvas/snapshot-shortcut-hint.tsx",
    ]) {
      assert.ok(
        readSrc(file).includes("data-4663-snapshot-exclude"),
        file,
      );
    }
  });

  it("4. preview exposes DOWNLOAD / PLACE / CANCEL", () => {
    const preview = readSrc("src/components/canvas/snapshot-preview.tsx");
    assert.ok(preview.includes("[ DOWNLOAD PNG ]"));
    assert.ok(preview.includes("[ PLACE ON CANVAS ]"));
    assert.ok(preview.includes("[ CANCEL ]"));
    assert.ok(preview.includes("data-4663-snapshot-download"));
    assert.ok(preview.includes("data-4663-snapshot-place"));
    assert.ok(preview.includes("data-4663-snapshot-cancel"));
    const layer = readSrc("src/components/social/canvas-snapshot-layer.tsx");
    assert.ok(layer.includes("if (!self)"));
    assert.ok(layer.includes("Enter to place on the canvas."));
    assert.ok(layer.includes("canPlace={!!self}"));
  });

  it("5. CANCEL does not write a canvas object", () => {
    const layer = readSrc("src/components/social/canvas-snapshot-layer.tsx");
    const cancel = layer.slice(layer.indexOf("onCancel"));
    assert.ok(cancel.includes("closePreview"));
    assert.equal(cancel.includes("uploadSnapshotPng"), false);
    assert.equal(cancel.includes("commitSnapshotPublish"), false);
  });

  it("6. DOWNLOAD uses PNG data and does not upload", () => {
    const layer = readSrc("src/components/social/canvas-snapshot-layer.tsx");
    const download = layer.slice(
      layer.indexOf("const onDownload"),
      layer.indexOf("const onPlace"),
    );
    assert.ok(download.includes("downloadSnapshotBlob"));
    assert.equal(download.includes("uploadSnapshotPng"), false);
  });

  it("7–9. PLACE uploads one PNG then one PlayHTML object", () => {
    const layer = readSrc("src/components/social/canvas-snapshot-layer.tsx");
    assert.ok(layer.includes("uploadSnapshotPng"));
    assert.ok(layer.includes("placingRef.current"));
    assert.ok(layer.includes("commitSnapshotPublish"));
    assert.ok(layer.includes("createCanvasSnapshotObject"));
    assert.ok(layer.includes("usePageData<CanvasSnapshotsPageData>"));
  });

  it("12. placed object uses existing movable-object conventions", () => {
    const object = readSrc("src/components/social/canvas-snapshot-object.tsx");
    assert.ok(object.includes("CanMoveElement"));
    assert.ok(object.includes("usePlayhtmlMoveForeground"));
    assert.ok(object.includes("PlayhtmlMoveHitFill"));
    assert.ok(object.includes("onPointerDown={move.onPointerDown}"));
    assert.equal(object.includes("z-[999999]"), false);
    assert.ok(object.includes("stopPlayhtmlMoveStart"));
  });

  it("13. PLACE failure keeps preview/download available", () => {
    const layer = readSrc("src/components/social/canvas-snapshot-layer.tsx");
    assert.ok(layer.includes('setError(uploaded.error)'));
    assert.ok(layer.includes("placingRef.current = false"));
    assert.ok(layer.includes("Download is still available"));
    const close = layer.slice(layer.indexOf("const closePreview"));
    assert.ok(close.includes("URL.revokeObjectURL"));
  });

  it("14. duplicate button activation does not double-upload", () => {
    const layer = readSrc("src/components/social/canvas-snapshot-layer.tsx");
    assert.ok(layer.includes("if (placingRef.current) return"));
    assert.ok(layer.includes("if (capturingRef.current || placingRef.current) return"));
  });

  it("15. snapshot object can be included in later captures", () => {
    const object = readSrc("src/components/social/canvas-snapshot-object.tsx");
    assert.equal(object.includes("data-4663-snapshot-exclude"), false);
    assert.ok(object.includes('crossOrigin="anonymous"'));
    assert.ok(object.includes("data-4663-canvas-snapshot"));
  });

  it("17. DRAW/BRUSH/TEXT/MARK DONE/publish paths are untouched", () => {
    const drawing = readSrc("src/lib/social/ephemeral-drawing.ts");
    assert.ok(drawing.includes("EPHEMERAL_DRAWINGS_PAGE_DATA_NAME"));
    const brush = readSrc("src/lib/social/ephemeral-brush.ts");
    assert.ok(brush.includes("commitBrushPublish"));
    const text = readSrc("src/lib/social/ephemeral-text.ts");
    assert.ok(text.includes("EPHEMERAL_TEXTS_PAGE_DATA_NAME"));
    const mark = readSrc("src/lib/social/canvas-mark.ts");
    assert.ok(mark.includes("MARK_ENABLED"));
  });
});

describe("SNAPSHOT shortcut hint", () => {
  it("1–3. renders ⌘, S, and SNAPSHOT as a non-control legend", () => {
    const hint = readSrc("src/components/canvas/snapshot-shortcut-hint.tsx");
    assert.ok(hint.includes('glyph="⌘"'));
    assert.ok(hint.includes('glyph="S"'));
    assert.ok(hint.includes("SNAPSHOT"));
    assert.ok(hint.includes("data-4663-snapshot-shortcut-key={glyph}"));
    assert.ok(hint.includes("data-4663-snapshot-shortcut-label"));
    assert.equal(hint.includes("[ ⌘ ]"), false);
    assert.equal(hint.includes("[ S ]"), false);
    assert.equal(hint.includes("<button"), false);
    assert.equal(hint.includes("onClick"), false);
  });

  it("4. hint is snapshot-excluded", () => {
    const hint = readSrc("src/components/canvas/snapshot-shortcut-hint.tsx");
    assert.ok(hint.includes("data-4663-snapshot-exclude"));
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("SnapshotShortcutHint"));
    assert.ok(palette.includes("data-4663-snapshot-exclude"));
  });

  it("5. hint is non-interactive / pointer-events-none", () => {
    const hint = readSrc("src/components/canvas/snapshot-shortcut-hint.tsx");
    assert.ok(hint.includes("pointer-events-none"));
    assert.ok(hint.includes("select-none"));
    assert.ok(hint.includes('aria-hidden="true"'));
    assert.ok(hint.includes('role="presentation"'));
    assert.equal(hint.includes("hover:text"), false);
    assert.equal(hint.includes("hover:bg"), false);
    assert.equal(hint.includes("cursor-pointer"), false);
    assert.equal(hint.includes("startCapture"), false);
  });

  it("6. existing SNAPSHOT action remains unchanged", () => {
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("[ SNAPSHOT ]"));
    assert.ok(palette.includes("data-4663-snapshot-trigger"));
    assert.ok(palette.includes("getSnapshotActions()?.startCapture()"));
    assert.ok(palette.includes('aria-label="Snapshot the visible canvas"'));
  });

  it("7. existing keyboard shortcut remains unchanged", () => {
    const actions = readSrc("src/lib/canvas/snapshot-actions.ts");
    assert.ok(actions.includes("attachSnapshotShortcutListener"));
    assert.ok(actions.includes("handleSnapshotShortcutKeyDown"));
    assert.ok(actions.includes("isSnapshotSaveShortcut"));
    assert.ok(actions.includes("actions.startCapture()"));
    const hint = readSrc("src/components/canvas/snapshot-shortcut-hint.tsx");
    assert.equal(hint.includes("addEventListener"), false);
    assert.equal(hint.includes("handleSnapshotShortcutKeyDown"), false);
    assert.equal(hint.includes("attachSnapshotShortcutListener"), false);
  });

  it("8. desktop/fine-pointer only; hidden on touch/mobile", () => {
    const hint = readSrc("src/components/canvas/snapshot-shortcut-hint.tsx");
    assert.ok(hint.includes("hidden"));
    assert.ok(hint.includes("@media(hover:hover)_and_(pointer:fine)"));
    assert.ok(hint.includes("inline-flex"));
  });
});

describe("SNAPSHOT PlayHTML same-origin CSS", () => {
  it("1. no runtime reference to unpkg playhtml@latest CSS", () => {
    const layout = readSrc("src/app/layout.tsx");
    const capture = readSrc("src/lib/canvas/snapshot-capture.ts");
    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    for (const src of [layout, capture, playTree]) {
      assert.equal(src.includes("unpkg.com/playhtml@latest/dist/style.css"), false);
    }
    const playhtmlDist = readSrc("node_modules/playhtml/dist/index-DlJfxvdB.js");
    assert.equal(
      playhtmlDist.includes("unpkg.com/playhtml@latest/dist/style.css"),
      false,
    );
    const patch = readSrc("patches/playhtml+2.14.1.patch");
    assert.ok(patch.includes("unpkg.com/playhtml@latest/dist/style.css"));
    assert.ok(patch.includes("-  const a = document.createElement(\"link\");"));
  });

  it("2. PlayHTML stylesheet is loaded from the installed package build", () => {
    const layout = readSrc("src/app/layout.tsx");
    assert.ok(layout.includes('import "playhtml/dist/style.css"'));
    const pkg = JSON.parse(readSrc("node_modules/playhtml/package.json")) as {
      version: string;
      exports: Record<string, unknown>;
    };
    assert.equal(pkg.version, "2.14.1");
    assert.ok(pkg.exports["./dist/style.css"]);
    const css = readSrc("node_modules/playhtml/dist/style.css");
    assert.ok(css.includes("[can-move]"));
    assert.ok(css.includes("[can-spin]"));
    assert.ok(css.includes("cursor:grab"));
  });

  it("3–4. capture still uses html-to-image; failure handling remains", () => {
    const capture = readSrc("src/lib/canvas/snapshot-capture.ts");
    assert.ok(capture.includes('import { toBlob } from "html-to-image"'));
    assert.ok(capture.includes("toBlob"));
    assert.equal(capture.includes("skipFonts"), false);
    assert.ok(capture.includes("Snapshot capture failed."));
    assert.ok(capture.includes("Canvas viewport is not available."));
  });
});

