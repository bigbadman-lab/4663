/**
 * BOARD V1 — Module Lab soft container.
 * PlayHTML page-data stores the board frame only. Children keep their own
 * page-data and an optional boardId.
 */

import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX, type WorldPct } from "@/lib/canvas/world-camera";
import {
  DEFAULT_LAB_OBJECT_COLOR,
  normalizeLabObjectColor,
  type LabObjectColor,
} from "@/lib/modules/lab-object-color";
import {
  applyLabObjectResize,
  clampLabObjectSize,
  frameFromCenterPct,
  LAB_SPAWN_OFFSET_PCT,
  nextLabSpawnPct,
  worldDeltaToLabSizePct,
  type LabObjectSize,
  type LabObjectSizeLimits,
} from "@/lib/modules/lab-object-size";
import { isUuid, normalizeSessionId } from "@/lib/presence/session-id";

export const BOARD_MODULE_ID = "board" as const;

export const MODULE_LAB_BOARDS_PAGE_DATA_NAME =
  "4663-module-lab-boards" as const;

export const BOARD_MAX_INSTANCES = 40 as const;
export const BOARD_TITLE_MAX_LENGTH = 80 as const;
export const BOARD_DEFAULT_TITLE = "BOARD" as const;
export const BOARD_SPAWN_OFFSET_PCT = LAB_SPAWN_OFFSET_PCT;

export const BOARD_WIDTH_PCT_DEFAULT = (560 / WORLD_WIDTH_PX) * 100;
export const BOARD_HEIGHT_PCT_DEFAULT = (380 / WORLD_HEIGHT_PX) * 100;
export const BOARD_WIDTH_PCT_MIN = (320 / WORLD_WIDTH_PX) * 100;
export const BOARD_HEIGHT_PCT_MIN = (220 / WORLD_HEIGHT_PX) * 100;
export const BOARD_WIDTH_PCT_MAX = (1600 / WORLD_WIDTH_PX) * 100;
export const BOARD_HEIGHT_PCT_MAX = (1200 / WORLD_HEIGHT_PX) * 100;

export const BOARD_SIZE_LIMITS: LabObjectSizeLimits = {
  widthPctMin: BOARD_WIDTH_PCT_MIN,
  heightPctMin: BOARD_HEIGHT_PCT_MIN,
  widthPctMax: BOARD_WIDTH_PCT_MAX,
  heightPctMax: BOARD_HEIGHT_PCT_MAX,
  widthPctDefault: BOARD_WIDTH_PCT_DEFAULT,
  heightPctDefault: BOARD_HEIGHT_PCT_DEFAULT,
};

export type BoardInstance = {
  id: string;
  moduleId: typeof BOARD_MODULE_ID;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  title: string;
  color: LabObjectColor;
};

export type ModuleLabBoardsPageData = {
  boards: BoardInstance[];
};

export const EMPTY_MODULE_LAB_BOARDS_PAGE_DATA: ModuleLabBoardsPageData = {
  boards: [],
};

export function playhtmlBoardElementId(boardId: string): string {
  return `4663-lab-board-${boardId}`;
}

export function isPlayhtmlPageDataWritable(input: {
  isLoading: boolean;
  isProviderMissing: boolean;
}): boolean {
  return !input.isLoading && !input.isProviderMissing;
}

function isFinitePct(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateBoardTitle(raw: unknown): string {
  if (typeof raw !== "string") return BOARD_DEFAULT_TITLE;
  const next =
    raw.length <= BOARD_TITLE_MAX_LENGTH
      ? raw
      : raw.slice(0, BOARD_TITLE_MAX_LENGTH);
  return next.trim() === "" ? BOARD_DEFAULT_TITLE : next;
}

function defaultBoardSizeForOrigin(
  leftPct: number,
  topPct: number,
): LabObjectSize {
  return clampLabObjectSize({
    widthPct: BOARD_WIDTH_PCT_DEFAULT,
    heightPct: BOARD_HEIGHT_PCT_DEFAULT,
    originLeftPct: leftPct,
    originTopPct: topPct,
    limits: BOARD_SIZE_LIMITS,
  });
}

export function normalizeBoardInstance(raw: unknown): BoardInstance | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.id)) return null;
  if (record.moduleId !== BOARD_MODULE_ID) return null;
  if (!isFinitePct(record.leftPct) || !isFinitePct(record.topPct)) return null;
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;

  const leftPct = record.leftPct;
  const topPct = record.topPct;
  const widthRaw = isFinitePct(record.widthPct) ? record.widthPct : null;
  const heightRaw = isFinitePct(record.heightPct) ? record.heightPct : null;
  const size =
    widthRaw != null || heightRaw != null
      ? clampLabObjectSize({
          widthPct: widthRaw ?? BOARD_WIDTH_PCT_DEFAULT,
          heightPct: heightRaw ?? BOARD_HEIGHT_PCT_DEFAULT,
          originLeftPct: leftPct,
          originTopPct: topPct,
          limits: BOARD_SIZE_LIMITS,
        })
      : defaultBoardSizeForOrigin(leftPct, topPct);

  return {
    id: normalizeSessionId(record.id),
    moduleId: BOARD_MODULE_ID,
    leftPct,
    topPct,
    widthPct: size.widthPct,
    heightPct: size.heightPct,
    title: validateBoardTitle(record.title),
    color: normalizeLabObjectColor(record.color),
  };
}

export function normalizeModuleLabBoardsPageData(
  raw: unknown,
): ModuleLabBoardsPageData {
  if (raw === null || typeof raw !== "object") {
    return { boards: [] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.boards)) {
    return { boards: [] };
  }
  const seen = new Set<string>();
  const boards: BoardInstance[] = [];
  for (const item of record.boards) {
    const normalized = normalizeBoardInstance(item);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    boards.push(normalized);
    if (boards.length >= BOARD_MAX_INSTANCES) break;
  }
  return { boards };
}

export type CreateBoardInstanceInput = {
  leftPct: number;
  topPct: number;
  title?: string;
  randomUUID?: () => string;
};

export function createBoardInstance(
  input: CreateBoardInstanceInput,
): BoardInstance {
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const frame = frameFromCenterPct({
    leftPct: input.leftPct,
    topPct: input.topPct,
    limits: BOARD_SIZE_LIMITS,
  });
  return {
    id: normalizeSessionId(randomUUID()),
    moduleId: BOARD_MODULE_ID,
    leftPct: frame.leftPct,
    topPct: frame.topPct,
    widthPct: frame.widthPct,
    heightPct: frame.heightPct,
    title: validateBoardTitle(input.title ?? BOARD_DEFAULT_TITLE),
    color: DEFAULT_LAB_OBJECT_COLOR,
  };
}

export function canCreateBoardInstance(
  data: ModuleLabBoardsPageData,
): boolean {
  return data.boards.length < BOARD_MAX_INSTANCES;
}

export function addBoardInstance(
  data: ModuleLabBoardsPageData,
  board: BoardInstance,
): ModuleLabBoardsPageData {
  if (!canCreateBoardInstance(data)) return data;
  if (data.boards.some((existing) => existing.id === board.id)) return data;
  return { boards: [...data.boards, board] };
}

function mapBoard(
  data: ModuleLabBoardsPageData,
  boardId: string,
  update: (board: BoardInstance) => BoardInstance,
): ModuleLabBoardsPageData {
  const id = boardId.trim().toLowerCase();
  let changed = false;
  const boards = data.boards.map((board) => {
    if (board.id !== id) return board;
    const next = update(board);
    if (next === board) return board;
    changed = true;
    return next;
  });
  return changed ? { boards } : data;
}

export function updateBoardTitle(
  data: ModuleLabBoardsPageData,
  boardId: string,
  title: string,
): ModuleLabBoardsPageData {
  const nextTitle = validateBoardTitle(title);
  return mapBoard(data, boardId, (board) =>
    board.title === nextTitle ? board : { ...board, title: nextTitle },
  );
}

export function updateBoardColor(
  data: ModuleLabBoardsPageData,
  boardId: string,
  color: LabObjectColor,
): ModuleLabBoardsPageData {
  const nextColor = normalizeLabObjectColor(color);
  return mapBoard(data, boardId, (board) =>
    board.color === nextColor ? board : { ...board, color: nextColor },
  );
}

export function updateBoardSize(
  data: ModuleLabBoardsPageData,
  boardId: string,
  size: LabObjectSize,
): ModuleLabBoardsPageData {
  return mapBoard(data, boardId, (board) => {
    const next = clampLabObjectSize({
      widthPct: size.widthPct,
      heightPct: size.heightPct,
      originLeftPct: board.leftPct,
      originTopPct: board.topPct,
      limits: BOARD_SIZE_LIMITS,
    });
    if (
      board.widthPct === next.widthPct &&
      board.heightPct === next.heightPct
    ) {
      return board;
    }
    return { ...board, ...next };
  });
}

export function removeBoardInstance(
  data: ModuleLabBoardsPageData,
  boardId: string,
): ModuleLabBoardsPageData {
  const id = boardId.trim().toLowerCase();
  const boards = data.boards.filter((board) => board.id !== id);
  return boards.length === data.boards.length ? data : { boards };
}

export function resetModuleLabBoardsPageData(): ModuleLabBoardsPageData {
  return { boards: [] };
}

export function worldDeltaToBoardSizePct(
  deltaWorldX: number,
  deltaWorldY: number,
): { deltaWidthPct: number; deltaHeightPct: number } {
  return worldDeltaToLabSizePct(deltaWorldX, deltaWorldY);
}

export function applyBoardResize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
  deltaWidthPct: number;
  deltaHeightPct: number;
}): LabObjectSize {
  return applyLabObjectResize({ ...input, limits: BOARD_SIZE_LIMITS });
}

export function nextBoardSpawnPct(
  existingCount: number,
  base: WorldPct,
): WorldPct {
  return nextLabSpawnPct(existingCount, base);
}
