/**
 * Module Lab host — reuse canvas engine, isolate from homepage product layers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EPHEMERAL_TEXTS_PAGE_DATA_NAME,
} from "@/lib/social/ephemeral-text";
import { MODULE_LAB_NOTES_PAGE_DATA_NAME } from "@/modules/create/note/note-state";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const HOMEPAGE_IMPORTS = [
  "EphemeralTextLayer",
  "CanvasSnapshotLayer",
  "RadarAlertLayer",
  "MovablePonsMonitoringObject",
  "MovableLiveChatObject",
  "ParticipantPresenceLayer",
  "ParticipationProvider",
  "BrandAnchors",
  "OfficialContractControl",
  "CanvasControlPalette",
  "canvas-create-actions",
  "session-content-reset",
];

describe("Module Lab host", () => {
  it("is a real /modules route using ModuleLabRoot, not CanvasRoot", () => {
    const page = readSrc("src/app/modules/page.tsx");
    assert.ok(page.includes("ModuleLabRoot"));
    assert.equal(page.includes("CanvasRoot"), false);
    assert.equal(page.includes("from \"@/components/canvas/canvas-root\""), false);
  });

  it("reuses world size, camera hook, and PlayHTML world bounds", () => {
    const surface = readSrc("src/components/modules/module-lab-surface.tsx");
    assert.ok(surface.includes("useCanvasCamera"));
    assert.ok(surface.includes("WORLD_WIDTH_PX"));
    assert.ok(surface.includes("WORLD_HEIGHT_PX"));
    assert.ok(surface.includes("PLAYHTML_WORLD_BOUNDS_ID"));
    assert.ok(surface.includes("data-4663-world-scale=\"1\""));
    assert.ok(surface.includes("NoteLayer"));
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));
    for (const name of HOMEPAGE_IMPORTS) {
      assert.equal(surface.includes(name), false, name);
    }
  });

  it("PlayProvider uses the /modules pathname, not homepage page-data names", () => {
    const tree = readSrc("src/components/modules/module-lab-play-tree.tsx");
    assert.ok(tree.includes("PlayProvider"));
    assert.ok(tree.includes("usePathname"));
    assert.ok(tree.includes('pathname ?? "/modules"'));
    assert.equal(tree.includes(EPHEMERAL_TEXTS_PAGE_DATA_NAME), false);
    const layer = readSrc("src/modules/create/note/note-layer.tsx");
    assert.ok(layer.includes("usePageData"));
    assert.ok(layer.includes("MODULE_LAB_NOTES_PAGE_DATA_NAME"));
    assert.equal(layer.includes(EPHEMERAL_TEXTS_PAGE_DATA_NAME), false);
    assert.equal(
      MODULE_LAB_NOTES_PAGE_DATA_NAME.startsWith("4663-module-lab"),
      true,
    );
  });

  it("NOTE object is movable and protects the editor from PlayHTML drag", () => {
    const object = readSrc("src/modules/create/note/note-object.tsx");
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(object));
    assert.ok(object.includes("PLAYHTML_CANVAS_BOUNDS_ID"));
    assert.ok(object.includes("textarea"));
    assert.ok(object.includes("stopPlayhtmlMoveStart"));
    assert.ok(object.includes("useInteractiveControlProtection"));
    assert.ok(object.includes("usePlayhtmlMoveForeground"));
    assert.ok(object.includes("PlayhtmlMoveHitFill"));
    assert.ok(object.includes("data-4663-note-editor"));
    assert.ok(object.includes("data-4663-note-resize"));
    assert.ok(object.includes("setCreateUiBlocksPan"));
    assert.ok(object.includes("width: `${note.widthPct}%`"));
    assert.ok(object.includes("height: `${note.heightPct}%`"));
  });

  it("resize handle uses native capture listeners, not click-only protection", () => {
    const object = readSrc("src/modules/create/note/note-object.tsx");
    const start = object.indexOf("function NoteResizeHandle");
    const end = object.indexOf("export function NoteObjectView");
    assert.ok(start >= 0 && end > start);
    const handle = object.slice(start, end);
    assert.equal(handle.includes("useInteractiveControlProtection"), false);
    assert.ok(handle.includes('addEventListener("pointerdown"'));
    assert.ok(handle.includes("capture: true"));
    assert.ok(handle.includes("setPointerCapture"));
    assert.ok(handle.includes("setCreateUiBlocksPan(true)"));
    assert.ok(handle.includes("applyNoteResize"));
    assert.ok(handle.includes("screenPointToWorldPoint"));
  });

  it("RESET clears lab actions and HOME uses goHome", () => {
    const surface = readSrc("src/components/modules/module-lab-surface.tsx");
    assert.ok(surface.includes("getModuleLabActions()?.reset()"));
    assert.ok(surface.includes("onHome={goHome}"));
    const layer = readSrc("src/modules/create/note/note-layer.tsx");
    assert.ok(layer.includes("resetModuleLabNotesPageData"));
    assert.equal(layer.includes("notifySessionContentReset"), false);
    assert.equal(layer.includes("registerSessionContentResetHandler"), false);
  });

  it("does not change the homepage surface to mount NOTE", () => {
    const homepage = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(homepage.includes("NoteLayer"), false);
    assert.equal(homepage.includes("module-lab"), false);
    assert.ok(homepage.includes("EphemeralTextLayer"));
  });
});
