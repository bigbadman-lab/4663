/**
 * BOARD V1 instance helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANVAS_LINKS_PAGE_DATA_NAME } from "@/lib/social/canvas-link";
import { CANVAS_SNAPSHOTS_PAGE_DATA_NAME } from "@/lib/social/canvas-snapshot";
import { EPHEMERAL_DRAWINGS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-drawing";
import { EPHEMERAL_TEXTS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-text";
import { MODULE_LAB_NOTES_PAGE_DATA_NAME } from "@/modules/create/note/note-state";
import { MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME } from "@/modules/organise/checklist/checklist-state";
import { MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME } from "@/modules/organise/countdown/countdown-state";
import {
  addBoardInstance,
  applyBoardResize,
  BOARD_HEIGHT_PCT_DEFAULT,
  BOARD_HEIGHT_PCT_MAX,
  BOARD_HEIGHT_PCT_MIN,
  BOARD_MAX_INSTANCES,
  BOARD_DEFAULT_TITLE,
  BOARD_SPAWN_OFFSET_PCT,
  BOARD_TITLE_MAX_LENGTH,
  BOARD_WIDTH_PCT_DEFAULT,
  BOARD_WIDTH_PCT_MAX,
  BOARD_WIDTH_PCT_MIN,
  canCreateBoardInstance,
  createBoardInstance,
  EMPTY_MODULE_LAB_BOARDS_PAGE_DATA,
  MODULE_LAB_BOARDS_PAGE_DATA_NAME,
  nextBoardSpawnPct,
  normalizeBoardInstance,
  normalizeModuleLabBoardsPageData,
  playhtmlBoardElementId,
  removeBoardInstance,
  resetModuleLabBoardsPageData,
  updateBoardColor,
  updateBoardSize,
  updateBoardTitle,
  validateBoardTitle,
} from "@/modules/organise/board/board-state";
import {
  createNoteInstance,
  shiftNoteOrigin,
  updateNoteBoardId,
  type ModuleLabNotesPageData,
} from "@/modules/create/note/note-state";
import {
  createChecklistInstance,
  updateChecklistBoardId,
} from "@/modules/organise/checklist/checklist-state";
import {
  createCountdownInstance,
  updateCountdownBoardId,
} from "@/modules/organise/countdown/countdown-state";
import {
  createCalendarInstance,
  shiftCalendarOrigin,
  updateCalendarBoardId,
  type ModuleLabCalendarsPageData,
} from "@/modules/organise/calendar/calendar-state";
import {
  detachLabBoardChildren,
  registerLabBoardChildSource,
  setLabBoardChildOwnership,
  shiftOwnedLabBoardChildren,
} from "@/lib/modules/lab-board-bridge";
import { worldDeltaPxToOriginPct } from "@/lib/modules/lab-board-containment";

const BOARD_A = "550e8400-e29b-41d4-a716-446655440030";
const BOARD_B = "6ba7b810-9dad-11d1-80b4-00c04fd430cd";
const NOTE_A = "550e8400-e29b-41d4-a716-446655440000";
const LIST_A = "550e8400-e29b-41d4-a716-446655440010";
const ITEM_A = "550e8400-e29b-41d4-a716-446655440011";
const COUNT_A = "550e8400-e29b-41d4-a716-446655440020";
const CAL_A = "550e8400-e29b-41d4-a716-446655440050";

function paddedUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function sequentialUuid(...ids: string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    index += 1;
    if (!id) throw new Error("uuid sequence exhausted");
    return id;
  };
}

describe("BOARD instance helpers", () => {
  it("creates unique ids, default BOARD title, default colour, and a large frame", () => {
    const a = createBoardInstance({
      leftPct: 40,
      topPct: 40,
      randomUUID: () => BOARD_A,
    });
    const b = createBoardInstance({
      leftPct: 50,
      topPct: 42,
      randomUUID: () => BOARD_B,
    });
    assert.equal(a.id, BOARD_A);
    assert.equal(b.id, BOARD_B);
    assert.notEqual(a.id, b.id);
    assert.equal(a.moduleId, "board");
    assert.equal(a.title, BOARD_DEFAULT_TITLE);
    assert.equal(a.title, "BOARD");
    assert.equal(a.color, "bone");
    assert.equal(a.widthPct, BOARD_WIDTH_PCT_DEFAULT);
    assert.equal(a.heightPct, BOARD_HEIGHT_PCT_DEFAULT);
    assert.ok(a.widthPct > 8);
    assert.ok(a.heightPct > 8);
    assert.equal("children" in a, false);
    assert.equal("boardId" in a, false);
  });

  it("clamps title length and treats empty/legacy titles as BOARD", () => {
    assert.equal(validateBoardTitle(""), BOARD_DEFAULT_TITLE);
    assert.equal(validateBoardTitle("   "), BOARD_DEFAULT_TITLE);
    assert.equal(validateBoardTitle("  keep  "), "  keep  ");
    const exact = "b".repeat(BOARD_TITLE_MAX_LENGTH);
    assert.equal(validateBoardTitle(exact), exact);
    assert.equal(validateBoardTitle(`${exact}x`).length, BOARD_TITLE_MAX_LENGTH);
    assert.equal(validateBoardTitle(1), BOARD_DEFAULT_TITLE);
    assert.equal(validateBoardTitle(undefined), BOARD_DEFAULT_TITLE);
  });

  it("normalizes valid boards and drops malformed / duplicate ids", () => {
    const valid = createBoardInstance({
      leftPct: 50,
      topPct: 50,
      title: "alpha",
      randomUUID: () => BOARD_A,
    });
    const data = normalizeModuleLabBoardsPageData({
      boards: [
        valid,
        { ...valid, id: "not-a-uuid" },
        { ...valid, moduleId: "note" },
        valid,
        { id: BOARD_B, moduleId: "board", leftPct: 10, topPct: 10 },
      ],
    });
    assert.equal(data.boards.length, 2);
    assert.equal(data.boards[0]?.id, BOARD_A);
    assert.equal(data.boards[1]?.id, BOARD_B);
    assert.equal(data.boards[1]?.widthPct, BOARD_WIDTH_PCT_DEFAULT);
    assert.equal(data.boards[1]?.title, BOARD_DEFAULT_TITLE);
    assert.equal(normalizeBoardInstance(null), null);
    assert.deepEqual(normalizeModuleLabBoardsPageData(null), { boards: [] });
  });

  it("legacy boards without dimensions normalize to the default size", () => {
    const legacy = normalizeBoardInstance({
      id: BOARD_A,
      moduleId: "board",
      leftPct: 40,
      topPct: 41,
      title: "keep me",
    });
    assert.ok(legacy);
    assert.equal(legacy.widthPct, BOARD_WIDTH_PCT_DEFAULT);
    assert.equal(legacy.heightPct, BOARD_HEIGHT_PCT_DEFAULT);
    assert.equal(legacy.leftPct, 40);
    assert.equal(legacy.topPct, 41);
    assert.equal(legacy.title, "keep me");
    assert.equal(legacy.color, "bone");
  });

  it("legacy empty titles normalize to BOARD", () => {
    const missing = normalizeBoardInstance({
      id: BOARD_A,
      moduleId: "board",
      leftPct: 40,
      topPct: 41,
    });
    const blank = normalizeBoardInstance({
      id: BOARD_B,
      moduleId: "board",
      leftPct: 40,
      topPct: 41,
      title: "",
    });
    assert.equal(missing?.title, BOARD_DEFAULT_TITLE);
    assert.equal(blank?.title, BOARD_DEFAULT_TITLE);
  });

  it("updates one board without mutating another", () => {
    const a = createBoardInstance({
      leftPct: 20,
      topPct: 20,
      title: "one",
      randomUUID: () => BOARD_A,
    });
    const b = createBoardInstance({
      leftPct: 30,
      topPct: 30,
      title: "two",
      randomUUID: () => BOARD_B,
    });
    const start = { boards: [a, b] };
    const next = updateBoardTitle(start, BOARD_A, "edited");
    assert.equal(next.boards[0]?.title, "edited");
    assert.equal(next.boards[1]?.title, "two");
    assert.equal(start.boards[0]?.title, "one");
    const cleared = updateBoardTitle(next, BOARD_A, "");
    assert.equal(cleared.boards[0]?.title, BOARD_DEFAULT_TITLE);
    const recolored = updateBoardColor(next, BOARD_B, "blue");
    assert.equal(recolored.boards[0]?.color, "bone");
    assert.equal(recolored.boards[1]?.color, "blue");
  });

  it("clamps resize to min, max, and remaining world room", () => {
    const shrunk = applyBoardResize({
      widthPct: BOARD_WIDTH_PCT_DEFAULT,
      heightPct: BOARD_HEIGHT_PCT_DEFAULT,
      originLeftPct: 20,
      originTopPct: 20,
      deltaWidthPct: -100,
      deltaHeightPct: -100,
    });
    assert.equal(shrunk.widthPct, BOARD_WIDTH_PCT_MIN);
    assert.equal(shrunk.heightPct, BOARD_HEIGHT_PCT_MIN);

    const grown = applyBoardResize({
      widthPct: BOARD_WIDTH_PCT_DEFAULT,
      heightPct: BOARD_HEIGHT_PCT_DEFAULT,
      originLeftPct: 20,
      originTopPct: 20,
      deltaWidthPct: 100,
      deltaHeightPct: 100,
    });
    assert.equal(grown.widthPct, BOARD_WIDTH_PCT_MAX);
    assert.equal(grown.heightPct, BOARD_HEIGHT_PCT_MAX);

    const cramped = applyBoardResize({
      widthPct: BOARD_WIDTH_PCT_DEFAULT,
      heightPct: BOARD_HEIGHT_PCT_DEFAULT,
      originLeftPct: 97,
      originTopPct: 97,
      deltaWidthPct: 100,
      deltaHeightPct: 100,
    });
    assert.ok(cramped.widthPct <= 3);
    assert.ok(cramped.heightPct <= 3);
  });

  it("resize updates board size only — child sizes are not in board state", () => {
    const board = createBoardInstance({
      leftPct: 20,
      topPct: 20,
      randomUUID: () => BOARD_A,
    });
    const next = updateBoardSize(
      { boards: [board] },
      BOARD_A,
      { widthPct: BOARD_WIDTH_PCT_MIN, heightPct: BOARD_HEIGHT_PCT_MIN },
    );
    assert.equal(next.boards[0]?.widthPct, BOARD_WIDTH_PCT_MIN);
    assert.equal(next.boards[0]?.heightPct, BOARD_HEIGHT_PCT_MIN);
    assert.equal(next.boards[0]?.leftPct, board.leftPct);
    assert.equal(next.boards[0]?.topPct, board.topPct);
  });

  it("offsets spawn so later boards do not share the same origin", () => {
    const base = { leftPct: 50, topPct: 40 };
    const first = nextBoardSpawnPct(0, base);
    const second = nextBoardSpawnPct(1, base);
    assert.deepEqual(first, base);
    assert.equal(second.leftPct, 50 + BOARD_SPAWN_OFFSET_PCT);
  });

  it("caps instance count and removes by id", () => {
    let data = EMPTY_MODULE_LAB_BOARDS_PAGE_DATA;
    for (let i = 0; i < BOARD_MAX_INSTANCES; i += 1) {
      data = addBoardInstance(
        data,
        createBoardInstance({
          leftPct: 50,
          topPct: 50,
          randomUUID: () => paddedUuid(i),
        }),
      );
    }
    assert.equal(data.boards.length, BOARD_MAX_INSTANCES);
    assert.equal(canCreateBoardInstance(data), false);
    const extra = createBoardInstance({
      leftPct: 10,
      topPct: 10,
      randomUUID: () => BOARD_A,
    });
    assert.equal(addBoardInstance(data, extra).boards.length, BOARD_MAX_INSTANCES);
    const afterRemove = removeBoardInstance(data, data.boards[0]!.id);
    assert.equal(afterRemove.boards.length, BOARD_MAX_INSTANCES - 1);
    assert.equal(playhtmlBoardElementId(BOARD_A), `4663-lab-board-${BOARD_A}`);
  });

  it("RESET returns empty lab boards without touching homepage page-data names", () => {
    const filled = addBoardInstance(
      EMPTY_MODULE_LAB_BOARDS_PAGE_DATA,
      createBoardInstance({
        leftPct: 50,
        topPct: 50,
        randomUUID: () => BOARD_A,
      }),
    );
    assert.equal(filled.boards.length, 1);
    assert.deepEqual(resetModuleLabBoardsPageData(), { boards: [] });
    assert.equal(MODULE_LAB_BOARDS_PAGE_DATA_NAME, "4663-module-lab-boards");
    assert.notEqual(MODULE_LAB_BOARDS_PAGE_DATA_NAME, MODULE_LAB_NOTES_PAGE_DATA_NAME);
    assert.notEqual(
      MODULE_LAB_BOARDS_PAGE_DATA_NAME,
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_BOARDS_PAGE_DATA_NAME,
      MODULE_LAB_COUNTDOWNS_PAGE_DATA_NAME,
    );
    assert.notEqual(MODULE_LAB_BOARDS_PAGE_DATA_NAME, EPHEMERAL_TEXTS_PAGE_DATA_NAME);
    assert.notEqual(
      MODULE_LAB_BOARDS_PAGE_DATA_NAME,
      EPHEMERAL_DRAWINGS_PAGE_DATA_NAME,
    );
    assert.notEqual(MODULE_LAB_BOARDS_PAGE_DATA_NAME, CANVAS_LINKS_PAGE_DATA_NAME);
    assert.notEqual(
      MODULE_LAB_BOARDS_PAGE_DATA_NAME,
      CANVAS_SNAPSHOTS_PAGE_DATA_NAME,
    );
  });
});

describe("BOARD ownership via child state", { concurrency: false }, () => {
  it("NOTE, CHECKLIST, COUNTDOWN, and CALENDAR can adopt a board and cannot belong to two", () => {
    const note = createNoteInstance({
      leftPct: 40,
      topPct: 40,
      randomUUID: () => NOTE_A,
    });
    const list = createChecklistInstance({
      leftPct: 42,
      topPct: 42,
      randomUUID: sequentialUuid(LIST_A, ITEM_A),
    });
    const countdown = createCountdownInstance({
      leftPct: 44,
      topPct: 44,
      randomUUID: () => COUNT_A,
    });
    const calendar = createCalendarInstance({
      leftPct: 46,
      topPct: 46,
      now: new Date(2026, 7, 16),
      randomUUID: () => CAL_A,
    });
    assert.equal(note.boardId, null);
    assert.equal(list.boardId, null);
    assert.equal(countdown.boardId, null);
    assert.equal(calendar.boardId, null);

    const notes = updateNoteBoardId({ notes: [note] }, NOTE_A, BOARD_A);
    const lists = updateChecklistBoardId({ checklists: [list] }, LIST_A, BOARD_A);
    const countdowns = updateCountdownBoardId(
      { countdowns: [countdown] },
      COUNT_A,
      BOARD_A,
    );
    const calendars = updateCalendarBoardId(
      { calendars: [calendar] },
      CAL_A,
      BOARD_A,
    );
    assert.equal(notes.notes[0]?.boardId, BOARD_A);
    assert.equal(lists.checklists[0]?.boardId, BOARD_A);
    assert.equal(countdowns.countdowns[0]?.boardId, BOARD_A);
    assert.equal(calendars.calendars[0]?.boardId, BOARD_A);

    const transferred = updateCalendarBoardId(calendars, CAL_A, BOARD_B);
    assert.equal(transferred.calendars[0]?.boardId, BOARD_B);

    const detached = updateCalendarBoardId(transferred, CAL_A, null);
    assert.equal(detached.calendars[0]?.boardId, null);
    assert.equal(detached.calendars[0]?.leftPct, calendar.leftPct);
    assert.equal(detached.calendars[0]?.topPct, calendar.topPct);
  });

  it("deleting a board detaches children and leaves them at their world origin", () => {
    let notes: ModuleLabNotesPageData = {
      notes: [
        {
          ...createNoteInstance({
            leftPct: 40,
            topPct: 41,
            randomUUID: () => NOTE_A,
          }),
          boardId: BOARD_A,
        },
      ],
    };
    const unregister = registerLabBoardChildSource({
      kind: "note",
      ownedIds: (boardId) =>
        notes.notes.filter((row) => row.boardId === boardId).map((row) => row.id),
      setBoardId: (instanceId, boardId) => {
        notes = updateNoteBoardId(notes, instanceId, boardId);
      },
      shiftOrigin: (instanceId, dL, dT) => {
        notes = shiftNoteOrigin(notes, instanceId, dL, dT);
      },
    });
    const ownedLeft = notes.notes[0]?.leftPct;
    const ownedTop = notes.notes[0]?.topPct;
    const ownedWidth = notes.notes[0]?.widthPct;
    detachLabBoardChildren(BOARD_A);
    const remaining = removeBoardInstance(
      {
        boards: [
          createBoardInstance({
            leftPct: 20,
            topPct: 20,
            randomUUID: () => BOARD_A,
          }),
        ],
      },
      BOARD_A,
    );
    assert.equal(remaining.boards.length, 0);
    assert.equal(notes.notes.length, 1);
    assert.equal(notes.notes[0]?.boardId, null);
    assert.equal(notes.notes[0]?.leftPct, ownedLeft);
    assert.equal(notes.notes[0]?.topPct, ownedTop);
    assert.equal(notes.notes[0]?.widthPct, ownedWidth);
    unregister();
  });

  it("moving a board shifts owned children by the same origin delta without resizing them", () => {
    const created = createNoteInstance({
      leftPct: 40,
      topPct: 30,
      randomUUID: () => NOTE_A,
    });
    let notes: ModuleLabNotesPageData = {
      notes: [
        {
          ...created,
          boardId: BOARD_A,
        },
      ],
    };
    const startLeft = notes.notes[0]!.leftPct;
    const startTop = notes.notes[0]!.topPct;
    const startWidth = notes.notes[0]!.widthPct;
    const startHeight = notes.notes[0]!.heightPct;
    const unregister = registerLabBoardChildSource({
      kind: "note",
      ownedIds: (boardId) =>
        notes.notes.filter((row) => row.boardId === boardId).map((row) => row.id),
      setBoardId: (instanceId, boardId) => {
        notes = updateNoteBoardId(notes, instanceId, boardId);
      },
      shiftOrigin: (instanceId, dL, dT) => {
        notes = shiftNoteOrigin(notes, instanceId, dL, dT);
      },
    });
    const delta = worldDeltaPxToOriginPct(96, 32);
    shiftOwnedLabBoardChildren(BOARD_A, delta.deltaLeftPct, delta.deltaTopPct);
    assert.equal(notes.notes[0]?.leftPct, startLeft + delta.deltaLeftPct);
    assert.equal(notes.notes[0]?.topPct, startTop + delta.deltaTopPct);
    assert.equal(notes.notes[0]?.widthPct, startWidth);
    assert.equal(notes.notes[0]?.heightPct, startHeight);
    assert.equal(notes.notes[0]?.boardId, BOARD_A);
    unregister();
  });

  it("setLabBoardChildOwnership writes through the registered source", () => {
    let notes: ModuleLabNotesPageData = {
      notes: [
        createNoteInstance({
          leftPct: 12,
          topPct: 14,
          randomUUID: () => NOTE_A,
        }),
      ],
    };
    const unregister = registerLabBoardChildSource({
      kind: "note",
      ownedIds: (boardId) =>
        notes.notes.filter((row) => row.boardId === boardId).map((row) => row.id),
      setBoardId: (instanceId, boardId) => {
        notes = updateNoteBoardId(notes, instanceId, boardId);
      },
      shiftOrigin: (instanceId, dL, dT) => {
        notes = shiftNoteOrigin(notes, instanceId, dL, dT);
      },
    });
    setLabBoardChildOwnership(NOTE_A, BOARD_A);
    assert.equal(notes.notes[0]?.boardId, BOARD_A);
    setLabBoardChildOwnership(NOTE_A, BOARD_B);
    assert.equal(notes.notes[0]?.boardId, BOARD_B);
    setLabBoardChildOwnership(NOTE_A, null);
    assert.equal(notes.notes[0]?.boardId, null);
    unregister();
  });

  it("BOARD carry and delete detach work for CALENDAR through the existing child source", () => {
    let calendars: ModuleLabCalendarsPageData = {
      calendars: [
        {
          ...createCalendarInstance({
            leftPct: 40,
            topPct: 30,
            now: new Date(2026, 7, 16),
            randomUUID: () => CAL_A,
          }),
          boardId: BOARD_A,
        },
      ],
    };
    const startLeft = calendars.calendars[0]!.leftPct;
    const startTop = calendars.calendars[0]!.topPct;
    const startWidth = calendars.calendars[0]!.widthPct;
    const unregister = registerLabBoardChildSource({
      kind: "calendar",
      ownedIds: (boardId) =>
        calendars.calendars
          .filter((row) => row.boardId === boardId)
          .map((row) => row.id),
      setBoardId: (instanceId, boardId) => {
        calendars = updateCalendarBoardId(calendars, instanceId, boardId);
      },
      shiftOrigin: (instanceId, dL, dT) => {
        calendars = shiftCalendarOrigin(calendars, instanceId, dL, dT);
      },
    });
    const delta = worldDeltaPxToOriginPct(96, 32);
    shiftOwnedLabBoardChildren(BOARD_A, delta.deltaLeftPct, delta.deltaTopPct);
    assert.equal(
      calendars.calendars[0]?.leftPct,
      startLeft + delta.deltaLeftPct,
    );
    assert.equal(calendars.calendars[0]?.topPct, startTop + delta.deltaTopPct);
    assert.equal(calendars.calendars[0]?.widthPct, startWidth);
    assert.equal(calendars.calendars[0]?.boardId, BOARD_A);
    detachLabBoardChildren(BOARD_A);
    assert.equal(calendars.calendars[0]?.boardId, null);
    assert.equal(
      calendars.calendars[0]?.leftPct,
      startLeft + delta.deltaLeftPct,
    );
    unregister();
  });
});
