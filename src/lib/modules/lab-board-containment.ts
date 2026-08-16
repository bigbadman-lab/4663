/**
 * BOARD V1 containment maths — Lab-only, not a scene graph.
 *
 * Adoption rule: a child's axis-aligned bounding-box centre must lie inside
 * the BOARD *content* rect (workspace below the chrome/title strip), not the
 * full BOARD AABB. Touching a board edge or hovering the title strip is not
 * enough. If several BOARDs contain the centre, the last candidate in the
 * given order wins (callers should pass document / paint order so later DOM
 * = topmost).
 *
 * Children keep world-space CSS origins + PlayHTML can-move offsets.
 * BOARD drag applies a session-only CSS translate, then bakes the same
 * world-% delta into child origins on pointerup. Adopt/detach/transfer do
 * not convert coordinates — visual world position is already authoritative
 * unless an owned drop would cover the reserved title strip, in which case
 * the child is settled minimally downward on pointerup.
 */

import {
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from "@/lib/canvas/world-camera";
import { isUuid, normalizeSessionId } from "@/lib/presence/session-id";

export const LAB_BOARD_ADOPTABLE_MODULE_IDS = [
  "note",
  "checklist",
  "countdown",
  "calendar",
] as const;

export type LabBoardAdoptableModuleId =
  (typeof LAB_BOARD_ADOPTABLE_MODULE_IDS)[number];

export type WorldRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type WorldOriginPct = {
  leftPct: number;
  topPct: number;
};

export type BoardCandidate = {
  id: string;
  /** Full BOARD AABB, including the reserved chrome/title strip. */
  rect: WorldRect;
  /** Workspace below chrome. Adoption uses this; defaults to `rect`. */
  contentRect?: WorldRect;
};

export type BoardDropResolution = {
  nextBoardId: string | null;
  clampBoardId: string | null;
};

export function boardAdoptionRect(board: BoardCandidate): WorldRect {
  return board.contentRect ?? board.rect;
}

export function isLabBoardAdoptableModuleId(
  value: string,
): value is LabBoardAdoptableModuleId {
  return (
    value === "note" ||
    value === "checklist" ||
    value === "countdown" ||
    value === "calendar"
  );
}

export function normalizeLabBoardId(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (!isUuid(raw)) return null;
  return normalizeSessionId(raw);
}

export function worldRectCenter(rect: WorldRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function pointInWorldRect(
  point: { x: number; y: number },
  rect: WorldRect,
): boolean {
  if (!(rect.width > 0) || !(rect.height > 0)) return false;
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

/**
 * True when the child's centre is inside `area`.
 * A one-pixel edge overlap of the boxes is not sufficient.
 */
export function isChildCentreInsideBoard(
  child: WorldRect,
  area: WorldRect,
): boolean {
  return pointInWorldRect(worldRectCenter(child), area);
}

export function boardContentRect(
  board: WorldRect,
  chromeHeightWorldPx: number,
): WorldRect {
  const chrome = Math.max(
    0,
    Number.isFinite(chromeHeightWorldPx) ? chromeHeightWorldPx : 0,
  );
  const inset = Math.min(chrome, Math.max(0, board.height));
  const top = board.top + inset;
  return {
    left: board.left,
    top,
    width: board.width,
    height: Math.max(0, board.top + board.height - top),
  };
}

/** Content starts at the bottom of the measured chrome row. */
export function boardContentRectFromChrome(
  board: WorldRect,
  chrome: WorldRect,
): WorldRect {
  const chromeBottom = chrome.top + chrome.height;
  const top = Math.min(
    board.top + board.height,
    Math.max(board.top, chromeBottom),
  );
  return {
    left: board.left,
    top,
    width: board.width,
    height: Math.max(0, board.top + board.height - top),
  };
}

/**
 * Downward-only settle so the child's top edge is not above content.top.
 * No horizontal change. No-op when already fully below the title strip.
 */
export function childDeltaToClearContentTop(
  child: WorldRect,
  content: WorldRect,
): { x: number; y: number } {
  const dy = content.top - child.top;
  if (!(dy > 0) || !Number.isFinite(dy)) return { x: 0, y: 0 };
  return { x: 0, y: dy };
}

export function selectAcceptingBoardId(
  child: WorldRect,
  boards: readonly BoardCandidate[],
): string | null {
  let winner: string | null = null;
  for (const board of boards) {
    if (!board.id) continue;
    if (!isChildCentreInsideBoard(child, boardAdoptionRect(board))) continue;
    winner = board.id;
  }
  return winner;
}

/**
 * Drop resolution: unowned adoption uses the content rect.
 * An owned child dropped on its own title strip stays owned and is clamped
 * into the workspace instead of detaching.
 */
export function resolveBoardDrop(
  currentBoardId: string | null,
  child: WorldRect,
  boards: readonly BoardCandidate[],
): BoardDropResolution {
  const acceptingId = selectAcceptingBoardId(child, boards);
  if (currentBoardId == null) {
    return { nextBoardId: acceptingId, clampBoardId: acceptingId };
  }
  if (acceptingId != null && acceptingId !== currentBoardId) {
    return { nextBoardId: acceptingId, clampBoardId: acceptingId };
  }
  const current = boards.find((board) => board.id === currentBoardId);
  const overCurrent =
    current != null && isChildCentreInsideBoard(child, current.rect);
  if (acceptingId === currentBoardId || overCurrent) {
    return { nextBoardId: currentBoardId, clampBoardId: currentBoardId };
  }
  return { nextBoardId: null, clampBoardId: null };
}

export function worldDeltaPxToOriginPct(
  deltaWorldX: number,
  deltaWorldY: number,
): { deltaLeftPct: number; deltaTopPct: number } {
  const dx = Number.isFinite(deltaWorldX) ? deltaWorldX : 0;
  const dy = Number.isFinite(deltaWorldY) ? deltaWorldY : 0;
  return {
    deltaLeftPct: (dx / WORLD_WIDTH_PX) * 100,
    deltaTopPct: (dy / WORLD_HEIGHT_PX) * 100,
  };
}

/**
 * Shift a world-% origin by a board-move delta.
 * Sizes are not part of this conversion — callers must leave them unchanged.
 */
export function shiftWorldOriginPct(
  origin: WorldOriginPct,
  deltaLeftPct: number,
  deltaTopPct: number,
): WorldOriginPct {
  const dL = Number.isFinite(deltaLeftPct) ? deltaLeftPct : 0;
  const dT = Number.isFinite(deltaTopPct) ? deltaTopPct : 0;
  return {
    leftPct: origin.leftPct + dL,
    topPct: origin.topPct + dT,
  };
}

/**
 * Adopt / detach / transfer keep the current world origin.
 * Ownership is a parent id, not a second coordinate system.
 */
export function worldOriginAfterOwnershipChange(
  origin: WorldOriginPct,
): WorldOriginPct {
  return { leftPct: origin.leftPct, topPct: origin.topPct };
}

export function nextBoardOwnership(
  _currentBoardId: string | null,
  nextBoardId: string | null,
): string | null {
  return nextBoardId;
}
