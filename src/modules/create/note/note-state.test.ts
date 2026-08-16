/**
 * NOTE V1 instance helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addNoteInstance,
  applyNoteResize,
  canCreateNoteInstance,
  createNoteInstance,
  EMPTY_MODULE_LAB_NOTES_PAGE_DATA,
  MODULE_LAB_NOTES_PAGE_DATA_NAME,
  nextNoteSpawnPct,
  normalizeModuleLabNotesPageData,
  normalizeNoteInstance,
  NOTE_HEIGHT_PCT_DEFAULT,
  NOTE_HEIGHT_PCT_MAX,
  NOTE_HEIGHT_PCT_MIN,
  NOTE_MAX_CONTENT_LENGTH,
  NOTE_MAX_INSTANCES,
  NOTE_SPAWN_OFFSET_PCT,
  NOTE_WIDTH_PCT_DEFAULT,
  NOTE_WIDTH_PCT_MAX,
  NOTE_WIDTH_PCT_MIN,
  playhtmlNoteElementId,
  removeNoteInstance,
  resetModuleLabNotesPageData,
  updateNoteContent,
  updateNoteColor,
  updateNoteSize,
  validateNoteContent,
  worldDeltaToNoteSizePct,
} from "@/modules/create/note/note-state";
import { EPHEMERAL_TEXTS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-text";
import { EPHEMERAL_DRAWINGS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-drawing";
import { CANVAS_LINKS_PAGE_DATA_NAME } from "@/lib/social/canvas-link";
import { CANVAS_SNAPSHOTS_PAGE_DATA_NAME } from "@/lib/social/canvas-snapshot";

const NOTE_A = "550e8400-e29b-41d4-a716-446655440000";
const NOTE_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("NOTE instance helpers", () => {
  it("creates unique ids for multiple instances", () => {
    const a = createNoteInstance({
      leftPct: 40,
      topPct: 40,
      randomUUID: () => NOTE_A,
    });
    const b = createNoteInstance({
      leftPct: 44,
      topPct: 42,
      randomUUID: () => NOTE_B,
    });
    assert.equal(a.id, NOTE_A);
    assert.equal(b.id, NOTE_B);
    assert.notEqual(a.id, b.id);
    assert.equal(a.moduleId, "note");
    assert.equal(a.content, "");
    assert.equal(a.widthPct, NOTE_WIDTH_PCT_DEFAULT);
    assert.equal(a.heightPct, NOTE_HEIGHT_PCT_DEFAULT);
    assert.equal(a.color, "bone");
    assert.equal(b.color, "bone");
    assert.notEqual(a.leftPct, b.leftPct);
    assert.ok(a.widthPct > 0);
    assert.ok(a.heightPct > 0);
  });

  it("allows empty content and clamps max length", () => {
    assert.equal(validateNoteContent(""), "");
    assert.equal(validateNoteContent("  keep  "), "  keep  ");
    const exact = "n".repeat(NOTE_MAX_CONTENT_LENGTH);
    assert.equal(validateNoteContent(exact), exact);
    assert.equal(
      validateNoteContent(`${exact}x`).length,
      NOTE_MAX_CONTENT_LENGTH,
    );
    assert.equal(validateNoteContent(1), "");
  });

  it("normalizes valid notes and drops malformed / duplicate ids", () => {
    const valid = createNoteInstance({
      leftPct: 50,
      topPct: 50,
      content: "hello",
      randomUUID: () => NOTE_A,
    });
    const data = normalizeModuleLabNotesPageData({
      notes: [
        valid,
        { ...valid, id: "not-a-uuid" },
        { ...valid, moduleId: "text" },
        valid,
        { id: NOTE_B, moduleId: "note", leftPct: 10, topPct: 10, content: "b" },
      ],
    });
    assert.equal(data.notes.length, 2);
    assert.equal(data.notes[0]?.id, NOTE_A);
    assert.equal(data.notes[1]?.id, NOTE_B);
    assert.equal(data.notes[1]?.widthPct, NOTE_WIDTH_PCT_DEFAULT);
    assert.equal(data.notes[1]?.heightPct, NOTE_HEIGHT_PCT_DEFAULT);
    assert.equal(normalizeNoteInstance(null), null);
    assert.deepEqual(normalizeModuleLabNotesPageData(null), { notes: [] });
  });

  it("updates one note without mutating another", () => {
    const a = createNoteInstance({
      leftPct: 20,
      topPct: 20,
      content: "one",
      randomUUID: () => NOTE_A,
    });
    const b = createNoteInstance({
      leftPct: 30,
      topPct: 30,
      content: "two",
      randomUUID: () => NOTE_B,
    });
    const start = { notes: [a, b] };
    const next = updateNoteContent(start, NOTE_A, "edited");
    assert.equal(next.notes[0]?.content, "edited");
    assert.equal(next.notes[1]?.content, "two");
    assert.equal(start.notes[0]?.content, "one");
    assert.equal(next.notes[1]?.leftPct, b.leftPct);
    assert.equal(next.notes[1]?.widthPct, b.widthPct);
  });

  it("offsets spawn so later notes do not share the same origin", () => {
    const base = { leftPct: 50, topPct: 40 };
    const first = nextNoteSpawnPct(0, base);
    const second = nextNoteSpawnPct(1, base);
    const seventh = nextNoteSpawnPct(6, base);
    assert.deepEqual(first, base);
    assert.equal(second.leftPct, 50 + NOTE_SPAWN_OFFSET_PCT);
    assert.equal(second.topPct, 40);
    assert.notDeepEqual(second, first);
    assert.equal(seventh.leftPct, 50);
    assert.equal(seventh.topPct, 40 + NOTE_SPAWN_OFFSET_PCT);
  });

  it("RESET returns empty lab notes without touching homepage page-data names", () => {
    const filled = addNoteInstance(
      EMPTY_MODULE_LAB_NOTES_PAGE_DATA,
      createNoteInstance({
        leftPct: 50,
        topPct: 50,
        randomUUID: () => NOTE_A,
      }),
    );
    assert.equal(filled.notes.length, 1);
    assert.deepEqual(resetModuleLabNotesPageData(), { notes: [] });
    assert.equal(
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
      "4663-module-lab-notes",
    );
    assert.notEqual(
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
      EPHEMERAL_TEXTS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
      EPHEMERAL_DRAWINGS_PAGE_DATA_NAME,
    );
    assert.notEqual(MODULE_LAB_NOTES_PAGE_DATA_NAME, CANVAS_LINKS_PAGE_DATA_NAME);
    assert.notEqual(
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
      CANVAS_SNAPSHOTS_PAGE_DATA_NAME,
    );
  });

  it("caps instance count and removes by id", () => {
    let data = EMPTY_MODULE_LAB_NOTES_PAGE_DATA;
    for (let i = 0; i < NOTE_MAX_INSTANCES; i += 1) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      data = addNoteInstance(
        data,
        createNoteInstance({
          leftPct: 50,
          topPct: 50,
          randomUUID: () => id,
        }),
      );
    }
    assert.equal(data.notes.length, NOTE_MAX_INSTANCES);
    assert.equal(canCreateNoteInstance(data), false);
    const extra = createNoteInstance({
      leftPct: 10,
      topPct: 10,
      randomUUID: () => NOTE_A,
    });
    assert.equal(addNoteInstance(data, extra).notes.length, NOTE_MAX_INSTANCES);
    const afterRemove = removeNoteInstance(data, data.notes[0]!.id);
    assert.equal(afterRemove.notes.length, NOTE_MAX_INSTANCES - 1);
    assert.equal(
      playhtmlNoteElementId(NOTE_A),
      `4663-lab-note-${NOTE_A}`,
    );
  });

  it("legacy notes without dimensions normalize to the default size", () => {
    const legacy = normalizeNoteInstance({
      id: NOTE_A,
      moduleId: "note",
      leftPct: 40,
      topPct: 41,
      content: "keep me",
    });
    assert.ok(legacy);
    assert.equal(legacy.widthPct, NOTE_WIDTH_PCT_DEFAULT);
    assert.equal(legacy.heightPct, NOTE_HEIGHT_PCT_DEFAULT);
    assert.equal(legacy.leftPct, 40);
    assert.equal(legacy.topPct, 41);
    assert.equal(legacy.content, "keep me");
    assert.equal(legacy.color, "bone");
  });

  it("clamps resize to min, max, and remaining world room", () => {
    const shrunk = applyNoteResize({
      widthPct: NOTE_WIDTH_PCT_DEFAULT,
      heightPct: NOTE_HEIGHT_PCT_DEFAULT,
      originLeftPct: 20,
      originTopPct: 20,
      deltaWidthPct: -100,
      deltaHeightPct: -100,
    });
    assert.equal(shrunk.widthPct, NOTE_WIDTH_PCT_MIN);
    assert.equal(shrunk.heightPct, NOTE_HEIGHT_PCT_MIN);

    const grown = applyNoteResize({
      widthPct: NOTE_WIDTH_PCT_DEFAULT,
      heightPct: NOTE_HEIGHT_PCT_DEFAULT,
      originLeftPct: 10,
      originTopPct: 10,
      deltaWidthPct: 100,
      deltaHeightPct: 100,
    });
    assert.equal(grown.widthPct, NOTE_WIDTH_PCT_MAX);
    assert.equal(grown.heightPct, NOTE_HEIGHT_PCT_MAX);

    const againstEdge = applyNoteResize({
      widthPct: NOTE_WIDTH_PCT_DEFAULT,
      heightPct: NOTE_HEIGHT_PCT_DEFAULT,
      originLeftPct: 95,
      originTopPct: 96,
      deltaWidthPct: 50,
      deltaHeightPct: 50,
    });
    assert.ok(againstEdge.widthPct <= 5);
    assert.ok(againstEdge.heightPct <= 4);
    assert.ok(againstEdge.widthPct + 95 <= 100 + 1e-9);
    assert.ok(againstEdge.heightPct + 96 <= 100 + 1e-9);
  });

  it("resizes width and height independently from pointer world delta", () => {
    const delta = worldDeltaToNoteSizePct(480, 0);
    assert.equal(delta.deltaWidthPct, 10);
    assert.equal(delta.deltaHeightPct, 0);
    const next = applyNoteResize({
      widthPct: NOTE_WIDTH_PCT_DEFAULT,
      heightPct: NOTE_HEIGHT_PCT_DEFAULT,
      originLeftPct: 20,
      originTopPct: 20,
      deltaWidthPct: delta.deltaWidthPct,
      deltaHeightPct: delta.deltaHeightPct,
    });
    assert.equal(next.widthPct, NOTE_WIDTH_PCT_DEFAULT + 10);
    assert.equal(next.heightPct, NOTE_HEIGHT_PCT_DEFAULT);
  });

  it("resizing one note does not change another note's size or content", () => {
    const a = createNoteInstance({
      leftPct: 20,
      topPct: 20,
      content: "one",
      randomUUID: () => NOTE_A,
    });
    const b = createNoteInstance({
      leftPct: 30,
      topPct: 30,
      content: "two",
      randomUUID: () => NOTE_B,
    });
    const start = { notes: [a, b] };
    const next = updateNoteSize(start, NOTE_A, {
      widthPct: NOTE_WIDTH_PCT_DEFAULT + 4,
      heightPct: NOTE_HEIGHT_PCT_DEFAULT + 3,
    });
    assert.ok(next.notes[0]!.widthPct > a.widthPct);
    assert.ok(next.notes[0]!.heightPct > a.heightPct);
    assert.equal(next.notes[0]!.content, "one");
    assert.equal(next.notes[1]!.widthPct, b.widthPct);
    assert.equal(next.notes[1]!.heightPct, b.heightPct);
    assert.equal(next.notes[1]!.content, "two");
    assert.equal(start.notes[0]!.widthPct, a.widthPct);
  });

  it("assigns default colour to new notes and normalizes legacy / invalid colour", () => {
    const created = createNoteInstance({
      leftPct: 20,
      topPct: 20,
      randomUUID: () => NOTE_A,
    });
    assert.equal(created.color, "bone");
    const legacy = normalizeNoteInstance({
      id: NOTE_A,
      moduleId: "note",
      leftPct: 20,
      topPct: 20,
      content: "old",
    });
    assert.equal(legacy?.color, "bone");
    const invalid = normalizeNoteInstance({
      id: NOTE_A,
      moduleId: "note",
      leftPct: 20,
      topPct: 20,
      content: "old",
      color: "neon",
    });
    assert.equal(invalid?.color, "bone");
    const kept = normalizeNoteInstance({
      ...created,
      color: "yellow",
    });
    assert.equal(kept?.color, "yellow");
    assert.equal(kept?.content, created.content);
  });

  it("updates one note colour without mutating another note", () => {
    const a = createNoteInstance({
      leftPct: 20,
      topPct: 20,
      content: "one",
      randomUUID: () => NOTE_A,
    });
    const b = createNoteInstance({
      leftPct: 30,
      topPct: 30,
      content: "two",
      randomUUID: () => NOTE_B,
    });
    const start = { notes: [a, b] };
    const next = updateNoteColor(start, NOTE_A, "green");
    assert.equal(next.notes[0]?.color, "green");
    assert.equal(next.notes[0]?.content, "one");
    assert.equal(next.notes[1]?.color, "bone");
    assert.equal(next.notes[1]?.content, "two");
    assert.equal(start.notes[0]?.color, "bone");
    const mixed = updateNoteColor(next, NOTE_B, "dark");
    assert.equal(mixed.notes[0]?.color, "green");
    assert.equal(mixed.notes[1]?.color, "dark");
  });
});
