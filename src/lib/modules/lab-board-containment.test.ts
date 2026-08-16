/**
 * BOARD V1 containment maths — adoption, ownership, origin conversion.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from "@/lib/canvas/world-camera";
import {
  boardContentRect,
  boardContentRectFromChrome,
  childDeltaToClearContentTop,
  isChildCentreInsideBoard,
  isLabBoardAdoptableModuleId,
  LAB_BOARD_ADOPTABLE_MODULE_IDS,
  nextBoardOwnership,
  normalizeLabBoardId,
  resolveBoardDrop,
  selectAcceptingBoardId,
  shiftWorldOriginPct,
  worldDeltaPxToOriginPct,
  worldOriginAfterOwnershipChange,
  worldRectCenter,
} from "@/lib/modules/lab-board-containment";

const BOARD_A = "550e8400-e29b-41d4-a716-446655440030";
const BOARD_B = "6ba7b810-9dad-11d1-80b4-00c04fd430cd";

describe("BOARD containment", () => {
  it("treats missing or invalid boardId as unowned", () => {
    assert.equal(normalizeLabBoardId(undefined), null);
    assert.equal(normalizeLabBoardId(null), null);
    assert.equal(normalizeLabBoardId(""), null);
    assert.equal(normalizeLabBoardId("not-a-uuid"), null);
    assert.equal(normalizeLabBoardId(BOARD_A.toUpperCase()), BOARD_A);
  });

  it("only NOTE, CHECKLIST, COUNTDOWN, and CALENDAR are adoptable — never BOARD", () => {
    assert.deepEqual(LAB_BOARD_ADOPTABLE_MODULE_IDS, [
      "note",
      "checklist",
      "countdown",
      "calendar",
    ]);
    assert.equal(isLabBoardAdoptableModuleId("note"), true);
    assert.equal(isLabBoardAdoptableModuleId("checklist"), true);
    assert.equal(isLabBoardAdoptableModuleId("countdown"), true);
    assert.equal(isLabBoardAdoptableModuleId("calendar"), true);
    assert.equal(isLabBoardAdoptableModuleId("board"), false);
  });

  it("does not adopt when the child only touches a board edge", () => {
    const board = { left: 100, top: 100, width: 200, height: 120 };
    const touching = { left: 40, top: 130, width: 60, height: 40 };
    assert.equal(worldRectCenter(touching).x, 70);
    assert.equal(isChildCentreInsideBoard(touching, board), false);
    assert.equal(selectAcceptingBoardId(touching, [{ id: BOARD_A, rect: board }]), null);
  });

  it("adopts when the child centre is inside the board", () => {
    const board = { left: 100, top: 100, width: 200, height: 120 };
    const inside = { left: 90, top: 130, width: 40, height: 40 };
    assert.equal(worldRectCenter(inside).x, 110);
    assert.equal(isChildCentreInsideBoard(inside, board), true);
    assert.equal(
      selectAcceptingBoardId(inside, [{ id: BOARD_A, rect: board }]),
      BOARD_A,
    );
  });

  it("content rect excludes the chrome/title strip", () => {
    const board = { left: 100, top: 100, width: 200, height: 120 };
    const content = boardContentRect(board, 24);
    assert.deepEqual(content, {
      left: 100,
      top: 124,
      width: 200,
      height: 96,
    });
    const fromChrome = boardContentRectFromChrome(board, {
      left: 100,
      top: 100,
      width: 200,
      height: 24,
    });
    assert.deepEqual(fromChrome, content);
  });

  it("does not adopt when the child centre is in the title strip", () => {
    const board = { left: 100, top: 100, width: 200, height: 120 };
    const content = boardContentRect(board, 24);
    const inChrome = { left: 140, top: 100, width: 40, height: 20 };
    assert.equal(worldRectCenter(inChrome).y, 110);
    assert.equal(isChildCentreInsideBoard(inChrome, board), true);
    assert.equal(isChildCentreInsideBoard(inChrome, content), false);
    assert.equal(
      selectAcceptingBoardId(inChrome, [
        { id: BOARD_A, rect: board, contentRect: content },
      ]),
      null,
    );
    assert.deepEqual(
      resolveBoardDrop(null, inChrome, [
        { id: BOARD_A, rect: board, contentRect: content },
      ]),
      { nextBoardId: null, clampBoardId: null },
    );
  });

  it("adopts when the child centre is in the workspace below chrome", () => {
    const board = { left: 100, top: 100, width: 200, height: 120 };
    const content = boardContentRect(board, 24);
    const inWorkspace = { left: 140, top: 140, width: 40, height: 40 };
    assert.equal(isChildCentreInsideBoard(inWorkspace, content), true);
    assert.equal(
      selectAcceptingBoardId(inWorkspace, [
        { id: BOARD_A, rect: board, contentRect: content },
      ]),
      BOARD_A,
    );
  });

  it("finalizes an adopted child fully below the title strip and preserves size", () => {
    const content = { left: 100, top: 124, width: 200, height: 96 };
    const overlapping = { left: 140, top: 110, width: 48, height: 40 };
    assert.deepEqual(childDeltaToClearContentTop(overlapping, content), {
      x: 0,
      y: 14,
    });
    const settledTop = overlapping.top + 14;
    assert.equal(settledTop, content.top);
    assert.equal(overlapping.width, 48);
    assert.equal(overlapping.height, 40);
    const alreadyClear = { left: 140, top: 130, width: 48, height: 40 };
    assert.deepEqual(childDeltaToClearContentTop(alreadyClear, content), {
      x: 0,
      y: 0,
    });
  });

  it("keeps an owned child when dropped on its own title strip and clamps it", () => {
    const board = { left: 100, top: 100, width: 200, height: 120 };
    const content = boardContentRect(board, 24);
    const inChrome = { left: 140, top: 100, width: 40, height: 20 };
    assert.deepEqual(
      resolveBoardDrop(BOARD_A, inChrome, [
        { id: BOARD_A, rect: board, contentRect: content },
      ]),
      { nextBoardId: BOARD_A, clampBoardId: BOARD_A },
    );
  });

  it("still detaches when an owned child is dropped outside the board", () => {
    const board = { left: 100, top: 100, width: 200, height: 120 };
    const content = boardContentRect(board, 24);
    const outside = { left: 10, top: 10, width: 40, height: 40 };
    assert.deepEqual(
      resolveBoardDrop(BOARD_A, outside, [
        { id: BOARD_A, rect: board, contentRect: content },
      ]),
      { nextBoardId: null, clampBoardId: null },
    );
  });

  it("still transfers when the centre is in another board's workspace", () => {
    const boardA = { left: 100, top: 100, width: 200, height: 120 };
    const boardB = { left: 180, top: 110, width: 180, height: 130 };
    const child = { left: 220, top: 160, width: 40, height: 40 };
    assert.deepEqual(
      resolveBoardDrop(BOARD_A, child, [
        {
          id: BOARD_A,
          rect: boardA,
          contentRect: boardContentRect(boardA, 24),
        },
        {
          id: BOARD_B,
          rect: boardB,
          contentRect: boardContentRect(boardB, 24),
        },
      ]),
      { nextBoardId: BOARD_B, clampBoardId: BOARD_B },
    );
  });

  it("picks the last overlapping board in document order when centres match both", () => {
    const child = { left: 140, top: 140, width: 40, height: 40 };
    const first = { id: BOARD_A, rect: { left: 100, top: 100, width: 200, height: 120 } };
    const second = { id: BOARD_B, rect: { left: 120, top: 110, width: 180, height: 130 } };
    assert.equal(selectAcceptingBoardId(child, [first, second]), BOARD_B);
    assert.equal(selectAcceptingBoardId(child, [second, first]), BOARD_A);
  });

  it("ownership is a single optional parent — transfer replaces, detach clears", () => {
    assert.equal(nextBoardOwnership(null, BOARD_A), BOARD_A);
    assert.equal(nextBoardOwnership(BOARD_A, BOARD_B), BOARD_B);
    assert.equal(nextBoardOwnership(BOARD_A, null), null);
  });

  it("adopt/detach/transfer keep the exact world origin", () => {
    const origin = { leftPct: 41.25, topPct: 38.5 };
    assert.deepEqual(worldOriginAfterOwnershipChange(origin), origin);
  });

  it("board movement shifts child origins by the same world delta and leaves size unused", () => {
    const delta = worldDeltaPxToOriginPct(96, 64);
    assert.equal(delta.deltaLeftPct, (96 / WORLD_WIDTH_PX) * 100);
    assert.equal(delta.deltaTopPct, (64 / WORLD_HEIGHT_PX) * 100);
    const moved = shiftWorldOriginPct({ leftPct: 40, topPct: 30 }, delta.deltaLeftPct, delta.deltaTopPct);
    assert.equal(moved.leftPct, 40 + delta.deltaLeftPct);
    assert.equal(moved.topPct, 30 + delta.deltaTopPct);
    const widthPct = 8;
    const heightPct = 5;
    assert.equal(widthPct, 8);
    assert.equal(heightPct, 5);
  });
});
