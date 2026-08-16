/**
 * Module Lab host — reuse canvas engine, isolate from homepage product layers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EPHEMERAL_TEXTS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-text";
import { MODULE_LAB_BOARDS_PAGE_DATA_NAME } from "@/modules/organise/board/board-state";
import { MODULE_LAB_NOTES_PAGE_DATA_NAME } from "@/modules/create/note/note-state";
import { MODULE_LAB_CALENDARS_PAGE_DATA_NAME } from "@/modules/organise/calendar/calendar-state";
import { MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME } from "@/modules/organise/checklist/checklist-state";
import { MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME } from "@/modules/organise/countdown/countdown-state";

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
    assert.ok(surface.includes("BoardLayer"));
    assert.ok(surface.includes("NoteLayer"));
    assert.ok(surface.includes("ChecklistLayer"));
    assert.ok(surface.includes("CountdownLayer"));
    assert.ok(surface.includes("CalendarLayer"));
    assert.ok(surface.includes("LabBoardUiProvider"));
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
    const countdownLayer = readSrc(
      "src/modules/organise/countdown/countdown-layer.tsx",
    );
    assert.ok(countdownLayer.includes("usePageData"));
    assert.ok(
      countdownLayer.includes("MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME"),
    );
    assert.equal(
      countdownLayer.includes(MODULE_LAB_NOTES_PAGE_DATA_NAME),
      false,
    );
    assert.equal(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      "4663-module-lab-countdowns",
    );
    assert.notEqual(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
    );
    const boardLayer = readSrc("src/modules/organise/board/board-layer.tsx");
    assert.ok(boardLayer.includes("usePageData"));
    assert.ok(boardLayer.includes("MODULE_LAB_BOARDS_PAGE_DATA_NAME"));
    assert.equal(MODULE_LAB_BOARDS_PAGE_DATA_NAME, "4663-module-lab-boards");
    assert.notEqual(
      MODULE_LAB_BOARDS_PAGE_DATA_NAME,
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_BOARDS_PAGE_DATA_NAME,
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_BOARDS_PAGE_DATA_NAME,
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
    );
    const calendarLayer = readSrc(
      "src/modules/organise/calendar/calendar-layer.tsx",
    );
    assert.ok(calendarLayer.includes("usePageData"));
    assert.ok(calendarLayer.includes("MODULE_LAB_CALENDARS_PAGE_DATA_NAME"));
    assert.equal(
      MODULE_LAB_CALENDARS_PAGE_DATA_NAME,
      "4663-module-lab-calendars",
    );
    assert.notEqual(
      MODULE_LAB_CALENDARS_PAGE_DATA_NAME,
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_CALENDARS_PAGE_DATA_NAME,
      MODULE_LAB_BOARDS_PAGE_DATA_NAME,
    );
  });

  it("dock lists installable modules from the registry", () => {
    const dock = readSrc("src/components/modules/module-lab-dock.tsx");
    assert.ok(dock.includes("listInstallableModules"));
    assert.ok(dock.includes("data-4663-module-lab-install"));
    assert.ok(dock.includes("[ + MODULE ]"));
    assert.equal(dock.includes("NOTE_MODULE"), false);
    assert.equal(dock.includes("BOARD"), false);
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

  it("COUNTDOWN object is movable, colourable, and ticks locally without persisting remaining time", () => {
    const object = readSrc(
      "src/modules/organise/countdown/countdown-object.tsx",
    );
    const layer = readSrc(
      "src/modules/organise/countdown/countdown-layer.tsx",
    );
    const state = readSrc(
      "src/modules/organise/countdown/countdown-state.ts",
    );
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(object));
    assert.ok(object.includes("PLAYHTML_CANVAS_BOUNDS_ID"));
    assert.ok(object.includes("LabResizeHandle"));
    assert.ok(object.includes("LabObjectColorPicker"));
    assert.ok(object.includes("useInteractiveControlProtection"));
    assert.ok(object.includes("stopPlayhtmlMoveStart"));
    assert.ok(object.includes('type="date"'));
    assert.ok(object.includes('type="time"'));
    assert.ok(object.includes("[ EDIT ]"));
    assert.ok(object.includes("COMPLETE"));
    assert.ok(object.includes("setInterval"));
    assert.ok(object.includes("countdownParts"));
    assert.equal(object.includes("setPageData"), false);
    assert.equal(layer.includes("setInterval"), false);
    assert.equal(state.includes("remainingDays"), false);
    assert.ok(layer.includes('if (moduleId !== "countdown") return'));
    assert.equal(layer.includes("MODULE_LAB_NOTES_PAGE_DATA_NAME"), false);
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

  it("RESET fans out to NOTE, CHECKLIST, COUNTDOWN, BOARD, and CALENDAR and HOME uses goHome", () => {
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
    const countdownLayer = readSrc(
      "src/modules/organise/countdown/countdown-layer.tsx",
    );
    assert.ok(countdownLayer.includes("resetModuleLabCountdownsPageData"));
    assert.ok(countdownLayer.includes('if (moduleId !== "countdown") return'));
    const boardLayer = readSrc("src/modules/organise/board/board-layer.tsx");
    assert.ok(boardLayer.includes("resetModuleLabBoardsPageData"));
    assert.ok(boardLayer.includes('if (moduleId !== "board") return'));
    assert.ok(boardLayer.includes("detachLabBoardChildren"));
    const calendarLayer = readSrc(
      "src/modules/organise/calendar/calendar-layer.tsx",
    );
    assert.ok(calendarLayer.includes("resetModuleLabCalendarsPageData"));
    assert.ok(calendarLayer.includes('if (moduleId !== "calendar") return'));
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
    const countdown = readSrc(
      "src/modules/organise/countdown/countdown-object.tsx",
    );
    assert.ok(countdown.includes("LabObjectColorPicker"));
    const calendar = readSrc(
      "src/modules/organise/calendar/calendar-object.tsx",
    );
    assert.ok(calendar.includes("LabObjectColorPicker"));
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

  it("BOARD object is a movable soft container behind children, without nesting them", () => {
    const object = readSrc("src/modules/organise/board/board-object.tsx");
    const layer = readSrc("src/modules/organise/board/board-layer.tsx");
    const note = readSrc("src/modules/create/note/note-object.tsx");
    const containment = readSrc("src/lib/modules/lab-board-containment.ts");
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(object));
    assert.ok(object.includes("PLAYHTML_CANVAS_BOUNDS_ID"));
    assert.ok(object.includes("LabResizeHandle"));
    assert.ok(object.includes("LabObjectColorPicker"));
    assert.ok(object.includes("data-4663-board-title"));
    assert.ok(object.includes("data-4663-board-title-editor"));
    assert.ok(object.includes("data-4663-board-accepting"));
    assert.ok(object.includes("BoardChromeTitle"));
    assert.equal(object.includes("data-4663-board-label"), false);
    assert.equal(object.includes("BoardTitleInput"), false);
    assert.ok(object.includes("stopPlayhtmlMoveStart"));
    assert.ok(object.includes("useInteractiveControlProtection"));
    const chrome = object.slice(
      object.indexOf("function BoardChromeTitle"),
      object.indexOf("export function BoardObjectView"),
    );
    const view = object.slice(object.indexOf("export function BoardObjectView"));
    assert.ok(chrome.includes("data-4663-board-title"));
    assert.ok(chrome.includes('event.key === "Enter"'));
    assert.ok(chrome.includes('event.key === "Escape"'));
    assert.ok(view.includes("<BoardChromeTitle"));
    assert.ok(view.includes("<LabObjectColorPicker"));
    assert.ok(view.indexOf("<BoardChromeTitle") < view.indexOf("<LabObjectColorPicker"));
    assert.equal((view.match(/<BoardChromeTitle/g) ?? []).length, 1);
    assert.equal(view.includes("BoardTitleInput"), false);
    assert.equal(view.includes("data-4663-board-label"), false);
    assert.ok(object.includes("z-[8]"));
    assert.equal(object.includes("PLAYHTML_MOVE_FOREGROUND_Z_INDEX"), false);
    assert.ok(object.includes("shiftOwnedLabBoardChildren"));
    assert.equal(object.includes("NoteObjectView"), false);
    assert.ok(layer.includes("detachLabBoardChildren"));
    assert.ok(note.includes("useLabBoardAdoption"));
    assert.ok(note.includes("LabBoardCarryFrame"));
    const calendar = readSrc(
      "src/modules/organise/calendar/calendar-object.tsx",
    );
    assert.ok(calendar.includes("useLabBoardAdoption"));
    assert.ok(calendar.includes("LabBoardCarryFrame"));
    assert.ok(object.includes("data-4663-board-chrome"));
    assert.ok(object.includes("nudgeOwnedChildrenBelowBoardChrome"));
    assert.ok(object.includes('className="relative z-[5] flex shrink-0'));
    assert.ok(containment.includes("contentRect"));
    assert.ok(containment.includes("childDeltaToClearContentTop"));
    assert.ok(containment.includes("child's axis-aligned bounding-box centre"));
    const ui = readSrc("src/components/modules/lab-board-ui.tsx");
    assert.ok(ui.includes("resolveBoardDrop"));
    assert.ok(ui.includes("clampHostBelowBoardChrome"));
    assert.ok(ui.includes("requestAnimationFrame"));
    const onMove = ui.slice(
      ui.indexOf("const onMove"),
      ui.indexOf("const onUp"),
    );
    assert.equal(onMove.includes("clampHostBelowBoardChrome"), false);
    assert.ok(layer.includes('if (moduleId !== "board") return'));
  });

  it("CALENDAR object is a movable month grid with local date-only events", () => {
    const object = readSrc(
      "src/modules/organise/calendar/calendar-object.tsx",
    );
    const layer = readSrc(
      "src/modules/organise/calendar/calendar-layer.tsx",
    );
    const state = readSrc(
      "src/modules/organise/calendar/calendar-state.ts",
    );
    assert.ok(/<CanMoveElement[^>]*>\s*<div\b/.test(object));
    assert.ok(object.includes("PLAYHTML_CANVAS_BOUNDS_ID"));
    assert.ok(object.includes("LabResizeHandle"));
    assert.ok(object.includes("LabObjectColorPicker"));
    assert.ok(object.includes("CalendarChromeTitle"));
    assert.ok(object.includes("stopPlayhtmlMoveStart"));
    assert.ok(object.includes("useInteractiveControlProtection"));
    assert.ok(object.includes("useLabBoardAdoption"));
    assert.ok(object.includes("LabBoardCarryFrame"));
    assert.ok(object.includes("calendarMonthCells"));
    assert.ok(object.includes("[ + EVENT ]"));
    assert.ok(object.includes('type="date"'));
    assert.ok(object.includes("data-4663-calendar-today"));
    assert.ok(object.includes("data-4663-calendar-selected"));
    assert.ok(object.includes("defaultSelectedDate"));
    assert.ok(object.includes("resolveCalendarDaySelection"));
    assert.ok(object.includes("eventCreateDate"));
    assert.ok(object.includes("calendarCellSelection"));
    assert.ok(object.includes("data-4663-calendar-event-editor"));
    const eventClick = object.slice(
      object.indexOf("data-4663-calendar-event={"),
      object.indexOf("data-4663-calendar-overflow"),
    );
    assert.ok(eventClick.includes("stopPropagation"));
    assert.ok(eventClick.includes("openEdit"));
    assert.equal(eventClick.includes("openCreate"), false);
    assert.equal(object.includes("setPageData"), false);
    assert.equal(state.includes("toISOString"), false);
    assert.equal(state.includes("Date.parse"), false);
    assert.ok(state.includes("YYYY-MM-DD"));
    assert.ok(layer.includes('if (moduleId !== "calendar") return'));
    assert.ok(layer.includes("registerLabBoardChildSource"));
    assert.equal(layer.includes("MODULE_LAB_NOTES_PAGE_DATA_NAME"), false);
    assert.equal((object.match(/<CalendarChromeTitle/g) ?? []).length, 1);
  });

  it("does not change the homepage surface to mount lab modules", () => {
    const homepage = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(homepage.includes("NoteLayer"), false);
    assert.equal(homepage.includes("ChecklistLayer"), false);
    assert.equal(homepage.includes("CountdownLayer"), false);
    assert.equal(homepage.includes("BoardLayer"), false);
    assert.equal(homepage.includes("CalendarLayer"), false);
    assert.equal(homepage.includes("module-lab"), false);
    assert.ok(homepage.includes("EphemeralTextLayer"));
  });
});
