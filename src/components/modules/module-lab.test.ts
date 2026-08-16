/**
 * Module Lab host — reuse canvas engine, isolate from homepage product layers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EPHEMERAL_TEXTS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-text";
import { MODULE_LAB_NOTES_PAGE_DATA_NAME } from "@/modules/create/note/note-state";
import { MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME } from "@/modules/organise/checklist/checklist-state";

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
    assert.ok(surface.includes("ChecklistLayer"));
    assert.ok(surface.includes("data-4663-canvas-empty-hit"));
    for (const name of HOMEPAGE_IMPORTS) {
      assert.equal(surface.includes(name), false, name);
    }
  });

  it("PlayProvider uses the /modules pathname and isolated page-data names", () => {
    const tree = readSrc("src/components/modules/module-lab-play-tree.tsx");
    assert.ok(tree.includes("PlayProvider"));
    assert.ok(tree.includes("usePathname"));
    assert.ok(tree.includes('pathname ?? "/modules"'));
    assert.equal(tree.includes(EPHEMERAL_TEXTS_PAGE_DATA_NAME), false);
    const noteLayer = readSrc("src/modules/create/note/note-layer.tsx");
    assert.ok(noteLayer.includes("usePageData"));
    assert.ok(noteLayer.includes("MODULE_LAB_NOTES_PAGE_DATA_NAME"));
    assert.equal(noteLayer.includes(EPHEMERAL_TEXTS_PAGE_DATA_NAME), false);
    const checklistLayer = readSrc(
      "src/modules/organise/checklist/checklist-layer.tsx",
    );
    assert.ok(checklistLayer.includes("usePageData"));
    assert.ok(
      checklistLayer.includes("MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME"),
    );
    assert.equal(
      checklistLayer.includes(MODULE_LAB_NOTES_PAGE_DATA_NAME),
      false,
    );
    assert.equal(
      MODULE_LAB_NOTES_PAGE_DATA_NAME.startsWith("4663-module-lab"),
      true,
    );
    assert.equal(
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME.startsWith("4663-module-lab"),
      true,
    );
    assert.notEqual(
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
    );
  });

  it("dock lists NOTE and CHECKLIST from the registry", () => {
    const dock = readSrc("src/components/modules/module-lab-dock.tsx");
    assert.ok(dock.includes("listInstallableModules"));
    assert.ok(dock.includes("data-4663-module-lab-install"));
    assert.ok(dock.includes("[ + MODULE ]"));
    assert.equal(dock.includes("COUNTDOWN"), false);
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
    assert.ok(object.includes("LabResizeHandle"));
    assert.ok(object.includes("data-4663-note-resize"));
    assert.ok(object.includes("width: `${note.widthPct}%`"));
    assert.ok(object.includes("height: `${note.heightPct}%`"));
  });

  it("CHECKLIST object is movable and protects title, items, and controls", () => {
    const object = readSrc("src/modules/organise/checklist/checklist-object.tsx");
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(object));
    assert.ok(object.includes("PLAYHTML_CANVAS_BOUNDS_ID"));
    assert.ok(object.includes("stopPlayhtmlMoveStart"));
    assert.ok(object.includes("useInteractiveControlProtection"));
    assert.ok(object.includes("usePlayhtmlMoveForeground"));
    assert.ok(object.includes("PlayhtmlMoveHitFill"));
    assert.ok(object.includes("LabResizeHandle"));
    assert.ok(object.includes("data-4663-checklist-editor"));
    assert.ok(object.includes("data-4663-checklist-resize"));
    assert.ok(object.includes("data-4663-checklist-toggle"));
    assert.ok(object.includes("[ + ITEM ]"));
    assert.ok(object.includes("line-through"));
    assert.equal(object.includes("useInteractiveControlProtection") && object.includes("LabResizeHandle"), true);
    assert.equal(object.includes("function LabResizeHandle"), false);
  });

  it("shared resize handle uses native capture listeners, not click-only protection", () => {
    const handle = readSrc("src/components/modules/lab-resize-handle.tsx");
    assert.equal(
      handle.includes("use-interactive-control-protection"),
      false,
    );
    assert.ok(handle.includes('addEventListener("pointerdown"'));
    assert.ok(handle.includes("capture: true"));
    assert.ok(handle.includes("setPointerCapture"));
    assert.ok(handle.includes("setCreateUiBlocksPan(true)"));
    assert.ok(handle.includes("applyLabObjectResize"));
    assert.ok(handle.includes("screenPointToWorldPoint"));
  });

  it("RESET fans out to NOTE and CHECKLIST and HOME uses goHome", () => {
    const surface = readSrc("src/components/modules/module-lab-surface.tsx");
    assert.ok(surface.includes("getModuleLabActions().reset()"));
    assert.ok(surface.includes("onHome={goHome}"));
    const noteLayer = readSrc("src/modules/create/note/note-layer.tsx");
    assert.ok(noteLayer.includes("resetModuleLabNotesPageData"));
    assert.ok(noteLayer.includes('if (moduleId !== "note") return'));
    assert.equal(noteLayer.includes("notifySessionContentReset"), false);
    const checklistLayer = readSrc(
      "src/modules/organise/checklist/checklist-layer.tsx",
    );
    assert.ok(checklistLayer.includes("resetModuleLabChecklistsPageData"));
    assert.ok(checklistLayer.includes('if (moduleId !== "checklist") return'));
    assert.equal(
      checklistLayer.includes("notifySessionContentReset"),
      false,
    );
    const actions = readSrc("src/lib/modules/lab-actions.ts");
    assert.ok(actions.includes("new Set<ModuleLabActionHandlers>()"));
  });

  it("NOTE and CHECKLIST share the Lab colour picker without changing resize", () => {
    const picker = readSrc("src/components/modules/lab-object-color-picker.tsx");
    assert.ok(picker.includes("LAB_OBJECT_COLOR_IDS"));
    assert.ok(picker.includes("useInteractiveControlProtection"));
    assert.ok(picker.includes("stopPlayhtmlMoveStart"));
    assert.ok(picker.includes("data-4663-lab-color-trigger"));
    assert.ok(picker.includes("data-4663-lab-color-badge"));
    assert.ok(picker.includes('aria-label="Choose colour"'));
    assert.ok(picker.includes("grid h-3.5 w-3.5 grid-cols-2 grid-rows-2"));
    assert.ok(picker.includes("LAB_OBJECT_COLORS.yellow.background"));
    assert.ok(picker.includes("LAB_OBJECT_COLORS.blue.background"));
    assert.ok(picker.includes("LAB_OBJECT_COLORS.pink.background"));
    assert.ok(picker.includes("LAB_OBJECT_COLORS.dark.background"));
    assert.equal(picker.includes("h-2.5 w-2.5 rounded-full border"), false);
    assert.ok(picker.includes("data-4663-lab-color-swatch"));
    assert.ok(picker.includes("data-4663-lab-color-palette"));
    assert.equal(picker.includes("note-state"), false);
    assert.equal(picker.includes("checklist-state"), false);
    const note = readSrc("src/modules/create/note/note-object.tsx");
    const checklist = readSrc(
      "src/modules/organise/checklist/checklist-object.tsx",
    );
    assert.ok(note.includes("LabObjectColorPicker"));
    assert.ok(checklist.includes("LabObjectColorPicker"));
    assert.ok(note.includes("labObjectColorVisual"));
    assert.ok(checklist.includes("labObjectColorVisual"));
    const handle = readSrc("src/components/modules/lab-resize-handle.tsx");
    assert.equal(handle.includes("lab-object-color"), false);
    assert.equal(handle.includes("use-interactive-control-protection"), false);
    assert.ok(handle.includes('addEventListener("pointerdown"'));
    assert.ok(handle.includes("setPointerCapture"));
  });

  it("colour palette stacks above object body editors, not under them", () => {
    const note = readSrc("src/modules/create/note/note-object.tsx");
    const checklist = readSrc(
      "src/modules/organise/checklist/checklist-object.tsx",
    );
    const picker = readSrc("src/components/modules/lab-object-color-picker.tsx");
    const hitFill = readSrc(
      "src/components/canvas/playhtml-move-hit-fill.tsx",
    );

    assert.ok(note.includes("relative z-[5] flex shrink-0"));
    assert.ok(checklist.includes("relative z-[5] flex shrink-0"));
    assert.ok(picker.includes("relative z-[5]"));
    assert.ok(picker.includes("absolute right-0 top-full z-[6]"));
    assert.ok(picker.includes("data-4663-lab-color-palette"));

    const noteView = note.slice(note.indexOf("export function NoteObjectView"));
    const listView = checklist.slice(
      checklist.indexOf("export function ChecklistObjectView"),
    );
    const noteChrome = noteView.indexOf("relative z-[5] flex shrink-0");
    const notePicker = noteView.indexOf("<LabObjectColorPicker");
    const noteEditor = noteView.indexOf("<NoteEditor");
    assert.ok(noteChrome >= 0 && notePicker > noteChrome && noteEditor > notePicker);

    const listChrome = listView.indexOf("relative z-[5] flex shrink-0");
    const listPicker = listView.indexOf("<LabObjectColorPicker");
    const listTitle = listView.indexOf("<ChecklistTitleInput");
    const listItems = listView.indexOf("data-4663-checklist-items");
    assert.ok(listChrome >= 0 && listPicker > listChrome);
    assert.ok(listTitle > listPicker && listItems > listTitle);

    assert.ok(note.includes("relative z-[1] min-h-0 w-full flex-1"));
    assert.ok(checklist.includes("relative z-[1] min-h-0 flex-1 overflow-y-auto"));
    assert.ok(hitFill.includes("absolute inset-0 z-0"));

    const noteFrame = note.slice(
      note.indexOf('className="relative flex h-full w-full flex-col border'),
      note.indexOf('className="relative flex h-full w-full flex-col border') + 90,
    );
    const listFrame = checklist.slice(
      checklist.indexOf('className="relative flex h-full w-full flex-col border'),
      checklist.indexOf('className="relative flex h-full w-full flex-col border') + 90,
    );
    assert.equal(noteFrame.includes("overflow-hidden"), false);
    assert.equal(listFrame.includes("overflow-hidden"), false);
  });

  it("does not change the homepage surface to mount lab modules", () => {
    const homepage = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(homepage.includes("NoteLayer"), false);
    assert.equal(homepage.includes("ChecklistLayer"), false);
    assert.equal(homepage.includes("module-lab"), false);
    assert.ok(homepage.includes("EphemeralTextLayer"));
  });
});
