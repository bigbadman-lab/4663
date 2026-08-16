/**
 * CHECKLIST V1 instance helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANVAS_LINKS_PAGE_DATA_NAME } from "@/lib/social/canvas-link";
import { CANVAS_SNAPSHOTS_PAGE_DATA_NAME } from "@/lib/social/canvas-snapshot";
import { EPHEMERAL_DRAWINGS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-drawing";
import { EPHEMERAL_TEXTS_PAGE_DATA_NAME } from "@/lib/social/ephemeral-text";
import { MODULE_LAB_NOTES_PAGE_DATA_NAME } from "@/modules/create/note/note-state";
import {
  addChecklistInstance,
  addChecklistItem,
  applyChecklistResize,
  canAddChecklistItem,
  canCreateChecklistInstance,
  CHECKLIST_HEIGHT_PCT_DEFAULT,
  CHECKLIST_HEIGHT_PCT_MAX,
  CHECKLIST_HEIGHT_PCT_MIN,
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_MAX_INSTANCES,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_SPAWN_OFFSET_PCT,
  CHECKLIST_TITLE_MAX_LENGTH,
  CHECKLIST_WIDTH_PCT_DEFAULT,
  CHECKLIST_WIDTH_PCT_MAX,
  CHECKLIST_WIDTH_PCT_MIN,
  createChecklistInstance,
  createChecklistItem,
  EMPTY_MODULE_LAB_CHECKLISTS_PAGE_DATA,
  MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
  nextChecklistSpawnPct,
  normalizeChecklistInstance,
  normalizeChecklistItem,
  normalizeModuleLabChecklistsPageData,
  playhtmlChecklistElementId,
  removeChecklistInstance,
  removeChecklistItem,
  resetModuleLabChecklistsPageData,
  toggleChecklistItem,
  updateChecklistItemText,
  updateChecklistSize,
  updateChecklistTitle,
  updateChecklistColor,
  validateChecklistItemText,
  validateChecklistTitle,
  worldDeltaToChecklistSizePct,
} from "@/modules/organise/checklist/checklist-state";

const LIST_A = "550e8400-e29b-41d4-a716-446655440010";
const LIST_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c9";
const ITEM_A = "550e8400-e29b-41d4-a716-446655440011";
const ITEM_B = "550e8400-e29b-41d4-a716-446655440012";
const ITEM_C = "6ba7b810-9dad-11d1-80b4-00c04fd430ca";
const ITEM_D = "6ba7b810-9dad-11d1-80b4-00c04fd430cb";

function sequentialUuid(...ids: string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    index += 1;
    if (!id) throw new Error("uuid sequence exhausted");
    return id;
  };
}

function paddedUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

describe("CHECKLIST instance helpers", () => {
  it("creates unique ids, empty title, and one empty item by default", () => {
    const a = createChecklistInstance({
      leftPct: 40,
      topPct: 40,
      randomUUID: sequentialUuid(LIST_A, ITEM_A),
    });
    const b = createChecklistInstance({
      leftPct: 44,
      topPct: 42,
      randomUUID: sequentialUuid(LIST_B, ITEM_C),
    });
    assert.equal(a.id, LIST_A);
    assert.equal(b.id, LIST_B);
    assert.notEqual(a.id, b.id);
    assert.equal(a.moduleId, "checklist");
    assert.equal(a.title, "");
    assert.equal(a.items.length, 1);
    assert.equal(a.items[0]?.id, ITEM_A);
    assert.equal(a.items[0]?.text, "");
    assert.equal(a.items[0]?.completed, false);
    assert.notEqual(a.items[0]?.id, b.items[0]?.id);
    assert.equal(a.widthPct, CHECKLIST_WIDTH_PCT_DEFAULT);
    assert.equal(a.heightPct, CHECKLIST_HEIGHT_PCT_DEFAULT);
    assert.equal(a.color, "bone");
    assert.equal(b.color, "bone");
    assert.notEqual(a.leftPct, b.leftPct);
  });

  it("clamps title and item text independently", () => {
    assert.equal(validateChecklistTitle(""), "");
    assert.equal(validateChecklistTitle("  keep  "), "  keep  ");
    const exactTitle = "t".repeat(CHECKLIST_TITLE_MAX_LENGTH);
    assert.equal(validateChecklistTitle(exactTitle), exactTitle);
    assert.equal(
      validateChecklistTitle(`${exactTitle}x`).length,
      CHECKLIST_TITLE_MAX_LENGTH,
    );
    assert.equal(validateChecklistTitle(1), "");

    const exactItem = "i".repeat(CHECKLIST_ITEM_MAX_LENGTH);
    assert.equal(validateChecklistItemText(exactItem), exactItem);
    assert.equal(
      validateChecklistItemText(`${exactItem}x`).length,
      CHECKLIST_ITEM_MAX_LENGTH,
    );
    assert.equal(validateChecklistItemText(null), "");
  });

  it("normalizes valid checklists and drops malformed / duplicate ids", () => {
    const valid = createChecklistInstance({
      leftPct: 50,
      topPct: 50,
      title: "errands",
      randomUUID: sequentialUuid(LIST_A, ITEM_A),
    });
    const data = normalizeModuleLabChecklistsPageData({
      checklists: [
        valid,
        { ...valid, id: "not-a-uuid" },
        { ...valid, moduleId: "note" },
        valid,
        {
          id: LIST_B,
          moduleId: "checklist",
          leftPct: 10,
          topPct: 10,
          title: "b",
          items: [
            { id: ITEM_C, text: "keep", completed: true },
            { id: "nope", text: "drop" },
            { id: ITEM_C, text: "dup" },
            { id: ITEM_D, text: "second", completed: "yes" },
          ],
        },
      ],
    });
    assert.equal(data.checklists.length, 2);
    assert.equal(data.checklists[0]?.id, LIST_A);
    assert.equal(data.checklists[1]?.id, LIST_B);
    assert.equal(data.checklists[1]?.widthPct, CHECKLIST_WIDTH_PCT_DEFAULT);
    assert.equal(data.checklists[1]?.heightPct, CHECKLIST_HEIGHT_PCT_DEFAULT);
    assert.equal(data.checklists[1]?.items.length, 2);
    assert.equal(data.checklists[1]?.items[0]?.id, ITEM_C);
    assert.equal(data.checklists[1]?.items[0]?.completed, true);
    assert.equal(data.checklists[1]?.items[1]?.id, ITEM_D);
    assert.equal(data.checklists[1]?.items[1]?.completed, false);
    assert.equal(normalizeChecklistInstance(null), null);
    assert.equal(normalizeChecklistItem({ id: "x" }), null);
    assert.deepEqual(normalizeModuleLabChecklistsPageData(null), {
      checklists: [],
    });
  });

  it("updates one checklist without mutating another", () => {
    const a = createChecklistInstance({
      leftPct: 20,
      topPct: 20,
      title: "one",
      randomUUID: sequentialUuid(LIST_A, ITEM_A),
    });
    const b = createChecklistInstance({
      leftPct: 30,
      topPct: 30,
      title: "two",
      randomUUID: sequentialUuid(LIST_B, ITEM_C),
    });
    const start = { checklists: [a, b] };
    const titled = updateChecklistTitle(start, LIST_A, "edited");
    assert.equal(titled.checklists[0]?.title, "edited");
    assert.equal(titled.checklists[1]?.title, "two");
    assert.equal(start.checklists[0]?.title, "one");

    const added = addChecklistItem(
      titled,
      LIST_A,
      createChecklistItem({ text: "milk", randomUUID: () => ITEM_B }),
    );
    assert.equal(added.checklists[0]?.items.length, 2);
    assert.equal(added.checklists[1]?.items.length, 1);
    assert.equal(added.checklists[1]?.items[0]?.id, ITEM_C);
    assert.equal(start.checklists[0]?.items.length, 1);

    const edited = updateChecklistItemText(added, LIST_A, ITEM_A, "first");
    assert.equal(edited.checklists[0]?.items[0]?.text, "first");
    assert.equal(edited.checklists[0]?.items[0]?.id, ITEM_A);
    assert.equal(edited.checklists[1]?.items[0]?.text, "");

    const toggled = toggleChecklistItem(edited, LIST_A, ITEM_A);
    assert.equal(toggled.checklists[0]?.items[0]?.completed, true);
    assert.equal(toggled.checklists[0]?.items[0]?.id, ITEM_A);
    assert.equal(toggled.checklists[1]?.items[0]?.completed, false);

    const removed = removeChecklistItem(toggled, LIST_A, ITEM_B);
    assert.equal(removed.checklists[0]?.items.length, 1);
    assert.equal(removed.checklists[0]?.items[0]?.id, ITEM_A);
    assert.equal(removed.checklists[1]?.items[0]?.id, ITEM_C);
  });

  it("keeps item ids stable across edit and toggle", () => {
    const list = createChecklistInstance({
      leftPct: 20,
      topPct: 20,
      randomUUID: sequentialUuid(LIST_A, ITEM_A),
    });
    let data = { checklists: [list] };
    const originalId = data.checklists[0]!.items[0]!.id;
    data = updateChecklistItemText(data, LIST_A, originalId, "buy eggs");
    data = toggleChecklistItem(data, LIST_A, originalId);
    data = updateChecklistTitle(data, LIST_A, "groceries");
    assert.equal(data.checklists[0]?.items[0]?.id, originalId);
    assert.equal(data.checklists[0]?.items[0]?.text, "buy eggs");
    assert.equal(data.checklists[0]?.items[0]?.completed, true);
    assert.equal(data.checklists[0]?.title, "groceries");
  });

  it("offsets spawn so later checklists do not share the same origin", () => {
    const base = { leftPct: 50, topPct: 40 };
    const first = nextChecklistSpawnPct(0, base);
    const second = nextChecklistSpawnPct(1, base);
    const seventh = nextChecklistSpawnPct(6, base);
    assert.deepEqual(first, base);
    assert.equal(second.leftPct, 50 + CHECKLIST_SPAWN_OFFSET_PCT);
    assert.equal(second.topPct, 40);
    assert.notDeepEqual(second, first);
    assert.equal(seventh.leftPct, 50);
    assert.equal(seventh.topPct, 40 + CHECKLIST_SPAWN_OFFSET_PCT);
  });

  it("RESET returns empty lab checklists without touching other page-data names", () => {
    const filled = addChecklistInstance(
      EMPTY_MODULE_LAB_CHECKLISTS_PAGE_DATA,
      createChecklistInstance({
        leftPct: 50,
        topPct: 50,
        randomUUID: sequentialUuid(LIST_A, ITEM_A),
      }),
    );
    assert.equal(filled.checklists.length, 1);
    assert.deepEqual(resetModuleLabChecklistsPageData(), { checklists: [] });
    assert.equal(
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
      "4663-module-lab-checklists",
    );
    assert.notEqual(
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
      MODULE_LAB_NOTES_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
      EPHEMERAL_TEXTS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
      EPHEMERAL_DRAWINGS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
      CANVAS_LINKS_PAGE_DATA_NAME,
    );
    assert.notEqual(
      MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME,
      CANVAS_SNAPSHOTS_PAGE_DATA_NAME,
    );
  });

  it("caps instance count, item count, and removes by id", () => {
    let data = EMPTY_MODULE_LAB_CHECKLISTS_PAGE_DATA;
    for (let i = 0; i < CHECKLIST_MAX_INSTANCES; i += 1) {
      data = addChecklistInstance(
        data,
        createChecklistInstance({
          leftPct: 50,
          topPct: 50,
          randomUUID: sequentialUuid(paddedUuid(i), paddedUuid(1000 + i)),
        }),
      );
    }
    assert.equal(data.checklists.length, CHECKLIST_MAX_INSTANCES);
    assert.equal(canCreateChecklistInstance(data), false);
    const extra = createChecklistInstance({
      leftPct: 10,
      topPct: 10,
      randomUUID: sequentialUuid(LIST_A, ITEM_A),
    });
    assert.equal(
      addChecklistInstance(data, extra).checklists.length,
      CHECKLIST_MAX_INSTANCES,
    );

    let one = {
      checklists: [
        createChecklistInstance({
          leftPct: 20,
          topPct: 20,
          randomUUID: sequentialUuid(LIST_A, ITEM_A),
        }),
      ],
    };
    for (let i = 1; i < CHECKLIST_MAX_ITEMS; i += 1) {
      one = addChecklistItem(
        one,
        LIST_A,
        createChecklistItem({ randomUUID: () => paddedUuid(2000 + i) }),
      );
    }
    assert.equal(one.checklists[0]?.items.length, CHECKLIST_MAX_ITEMS);
    assert.equal(canAddChecklistItem(one.checklists[0]!), false);
    assert.equal(
      addChecklistItem(one, LIST_A).checklists[0]?.items.length,
      CHECKLIST_MAX_ITEMS,
    );

    const afterRemove = removeChecklistInstance(data, data.checklists[0]!.id);
    assert.equal(afterRemove.checklists.length, CHECKLIST_MAX_INSTANCES - 1);
    assert.equal(
      playhtmlChecklistElementId(LIST_A),
      `4663-lab-checklist-${LIST_A}`,
    );
  });

  it("legacy checklists without dimensions or items normalize safely", () => {
    const legacy = normalizeChecklistInstance({
      id: LIST_A,
      moduleId: "checklist",
      leftPct: 40,
      topPct: 41,
      title: "keep me",
    });
    assert.ok(legacy);
    assert.equal(legacy.widthPct, CHECKLIST_WIDTH_PCT_DEFAULT);
    assert.equal(legacy.heightPct, CHECKLIST_HEIGHT_PCT_DEFAULT);
    assert.equal(legacy.leftPct, 40);
    assert.equal(legacy.topPct, 41);
    assert.equal(legacy.title, "keep me");
    assert.deepEqual(legacy.items, []);
    assert.equal(legacy.color, "bone");
  });

  it("clamps resize to min, max, and remaining world room", () => {
    const shrunk = applyChecklistResize({
      widthPct: CHECKLIST_WIDTH_PCT_DEFAULT,
      heightPct: CHECKLIST_HEIGHT_PCT_DEFAULT,
      originLeftPct: 20,
      originTopPct: 20,
      deltaWidthPct: -100,
      deltaHeightPct: -100,
    });
    assert.equal(shrunk.widthPct, CHECKLIST_WIDTH_PCT_MIN);
    assert.equal(shrunk.heightPct, CHECKLIST_HEIGHT_PCT_MIN);

    const grown = applyChecklistResize({
      widthPct: CHECKLIST_WIDTH_PCT_DEFAULT,
      heightPct: CHECKLIST_HEIGHT_PCT_DEFAULT,
      originLeftPct: 10,
      originTopPct: 10,
      deltaWidthPct: 100,
      deltaHeightPct: 100,
    });
    assert.equal(grown.widthPct, CHECKLIST_WIDTH_PCT_MAX);
    assert.equal(grown.heightPct, CHECKLIST_HEIGHT_PCT_MAX);

    const againstEdge = applyChecklistResize({
      widthPct: CHECKLIST_WIDTH_PCT_DEFAULT,
      heightPct: CHECKLIST_HEIGHT_PCT_DEFAULT,
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
    const delta = worldDeltaToChecklistSizePct(480, 0);
    assert.equal(delta.deltaWidthPct, 10);
    assert.equal(delta.deltaHeightPct, 0);
    const next = applyChecklistResize({
      widthPct: CHECKLIST_WIDTH_PCT_DEFAULT,
      heightPct: CHECKLIST_HEIGHT_PCT_DEFAULT,
      originLeftPct: 20,
      originTopPct: 20,
      deltaWidthPct: delta.deltaWidthPct,
      deltaHeightPct: delta.deltaHeightPct,
    });
    assert.equal(next.widthPct, CHECKLIST_WIDTH_PCT_DEFAULT + 10);
    assert.equal(next.heightPct, CHECKLIST_HEIGHT_PCT_DEFAULT);
  });

  it("resizing one checklist does not change another checklist's size or items", () => {
    const a = createChecklistInstance({
      leftPct: 20,
      topPct: 20,
      title: "one",
      randomUUID: sequentialUuid(LIST_A, ITEM_A),
    });
    const b = createChecklistInstance({
      leftPct: 30,
      topPct: 30,
      title: "two",
      randomUUID: sequentialUuid(LIST_B, ITEM_C),
    });
    const start = { checklists: [a, b] };
    const next = updateChecklistSize(start, LIST_A, {
      widthPct: CHECKLIST_WIDTH_PCT_DEFAULT + 4,
      heightPct: CHECKLIST_HEIGHT_PCT_DEFAULT + 3,
    });
    assert.ok(next.checklists[0]!.widthPct > a.widthPct);
    assert.ok(next.checklists[0]!.heightPct > a.heightPct);
    assert.equal(next.checklists[0]!.title, "one");
    assert.equal(next.checklists[0]!.items[0]?.id, ITEM_A);
    assert.equal(next.checklists[1]!.widthPct, b.widthPct);
    assert.equal(next.checklists[1]!.heightPct, b.heightPct);
    assert.equal(next.checklists[1]!.title, "two");
    assert.equal(next.checklists[1]!.items[0]?.id, ITEM_C);
    assert.equal(start.checklists[0]!.widthPct, a.widthPct);
  });

  it("assigns default colour to new checklists and normalizes legacy / invalid colour", () => {
    const created = createChecklistInstance({
      leftPct: 20,
      topPct: 20,
      randomUUID: sequentialUuid(LIST_A, ITEM_A),
    });
    assert.equal(created.color, "bone");
    const legacy = normalizeChecklistInstance({
      id: LIST_A,
      moduleId: "checklist",
      leftPct: 20,
      topPct: 20,
      title: "old",
      items: created.items,
    });
    assert.equal(legacy?.color, "bone");
    assert.equal(legacy?.title, "old");
    assert.equal(legacy?.items[0]?.id, ITEM_A);
    const invalid = normalizeChecklistInstance({
      id: LIST_A,
      moduleId: "checklist",
      leftPct: 20,
      topPct: 20,
      title: "old",
      items: created.items,
      color: "neon",
    });
    assert.equal(invalid?.color, "bone");
    const kept = normalizeChecklistInstance({
      ...created,
      color: "pink",
    });
    assert.equal(kept?.color, "pink");
    assert.equal(kept?.title, created.title);
    assert.equal(kept?.items[0]?.id, ITEM_A);
  });

  it("updates one checklist colour without mutating another instance's items or title", () => {
    const a = createChecklistInstance({
      leftPct: 20,
      topPct: 20,
      title: "one",
      randomUUID: sequentialUuid(LIST_A, ITEM_A),
    });
    const b = createChecklistInstance({
      leftPct: 30,
      topPct: 30,
      title: "two",
      randomUUID: sequentialUuid(LIST_B, ITEM_C),
    });
    const start = { checklists: [a, b] };
    const next = updateChecklistColor(start, LIST_A, "orange");
    assert.equal(next.checklists[0]?.color, "orange");
    assert.equal(next.checklists[0]?.title, "one");
    assert.equal(next.checklists[0]?.items[0]?.id, ITEM_A);
    assert.equal(next.checklists[1]?.color, "bone");
    assert.equal(next.checklists[1]?.title, "two");
    assert.equal(next.checklists[1]?.items[0]?.id, ITEM_C);
    assert.equal(start.checklists[0]?.color, "bone");
    const mixed = updateChecklistColor(next, LIST_B, "purple");
    assert.equal(mixed.checklists[0]?.color, "orange");
    assert.equal(mixed.checklists[1]?.color, "purple");
    assert.equal(mixed.checklists[0]?.items[0]?.text, "");
    assert.equal(mixed.checklists[1]?.title, "two");
  });
});
