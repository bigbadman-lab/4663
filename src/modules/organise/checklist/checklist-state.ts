/**
 * CHECKLIST V1 — Module Lab instance helpers.
 * PlayHTML page-data only. Not a production canvas model.
 */

import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX, type WorldPct } from "@/lib/canvas/world-camera";
import { normalizeLabBoardId } from "@/lib/modules/lab-board-containment";
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

export const CHECKLIST_MODULE_ID = "checklist" as const;

export const MODULE_LAB_CHECKLISTS_PAGE_DATA_NAME =
  "4663-module-lab-checklists" as const;

export const CHECKLIST_MAX_INSTANCES = 40 as const;
export const CHECKLIST_MAX_ITEMS = 30 as const;
export const CHECKLIST_TITLE_MAX_LENGTH = 80 as const;
export const CHECKLIST_ITEM_MAX_LENGTH = 200 as const;
export const CHECKLIST_SPAWN_OFFSET_PCT = LAB_SPAWN_OFFSET_PCT;

export const CHECKLIST_WIDTH_PCT_DEFAULT = (280 / WORLD_WIDTH_PX) * 100;
export const CHECKLIST_HEIGHT_PCT_DEFAULT = (220 / WORLD_HEIGHT_PX) * 100;
export const CHECKLIST_WIDTH_PCT_MIN = (180 / WORLD_WIDTH_PX) * 100;
export const CHECKLIST_HEIGHT_PCT_MIN = (140 / WORLD_HEIGHT_PX) * 100;
export const CHECKLIST_WIDTH_PCT_MAX = (960 / WORLD_WIDTH_PX) * 100;
export const CHECKLIST_HEIGHT_PCT_MAX = (800 / WORLD_HEIGHT_PX) * 100;

export const CHECKLIST_SIZE_LIMITS: LabObjectSizeLimits = {
  widthPctMin: CHECKLIST_WIDTH_PCT_MIN,
  heightPctMin: CHECKLIST_HEIGHT_PCT_MIN,
  widthPctMax: CHECKLIST_WIDTH_PCT_MAX,
  heightPctMax: CHECKLIST_HEIGHT_PCT_MAX,
  widthPctDefault: CHECKLIST_WIDTH_PCT_DEFAULT,
  heightPctDefault: CHECKLIST_HEIGHT_PCT_DEFAULT,
};

export type ChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
};

export type ChecklistInstance = {
  id: string;
  moduleId: typeof CHECKLIST_MODULE_ID;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  title: string;
  items: ChecklistItem[];
  color: LabObjectColor;
  boardId: string | null;
};

export type ModuleLabChecklistsPageData = {
  checklists: ChecklistInstance[];
};

export const EMPTY_MODULE_LAB_CHECKLISTS_PAGE_DATA: ModuleLabChecklistsPageData =
  { checklists: [] };

export function playhtmlChecklistElementId(checklistId: string): string {
  return `4663-lab-checklist-${checklistId}`;
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

export function validateChecklistTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  if (raw.length <= CHECKLIST_TITLE_MAX_LENGTH) return raw;
  return raw.slice(0, CHECKLIST_TITLE_MAX_LENGTH);
}

export function validateChecklistItemText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  if (raw.length <= CHECKLIST_ITEM_MAX_LENGTH) return raw;
  return raw.slice(0, CHECKLIST_ITEM_MAX_LENGTH);
}

export function createChecklistItem(input: {
  text?: string;
  completed?: boolean;
  randomUUID?: () => string;
}): ChecklistItem {
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  return {
    id: normalizeSessionId(randomUUID()),
    text: validateChecklistItemText(input.text ?? ""),
    completed: input.completed === true,
  };
}

export function normalizeChecklistItem(raw: unknown): ChecklistItem | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.id)) return null;
  return {
    id: normalizeSessionId(record.id),
    text: validateChecklistItemText(record.text),
    completed: record.completed === true,
  };
}

function defaultChecklistSizeForOrigin(
  leftPct: number,
  topPct: number,
): LabObjectSize {
  return clampLabObjectSize({
    widthPct: CHECKLIST_WIDTH_PCT_DEFAULT,
    heightPct: CHECKLIST_HEIGHT_PCT_DEFAULT,
    originLeftPct: leftPct,
    originTopPct: topPct,
    limits: CHECKLIST_SIZE_LIMITS,
  });
}

export function normalizeChecklistInstance(
  raw: unknown,
): ChecklistInstance | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.id)) return null;
  if (record.moduleId !== CHECKLIST_MODULE_ID) return null;
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
          widthPct: widthRaw ?? CHECKLIST_WIDTH_PCT_DEFAULT,
          heightPct: heightRaw ?? CHECKLIST_HEIGHT_PCT_DEFAULT,
          originLeftPct: leftPct,
          originTopPct: topPct,
          limits: CHECKLIST_SIZE_LIMITS,
        })
      : defaultChecklistSizeForOrigin(leftPct, topPct);

  const seen = new Set<string>();
  const items: ChecklistItem[] = [];
  if (Array.isArray(record.items)) {
    for (const item of record.items) {
      const normalized = normalizeChecklistItem(item);
      if (!normalized) continue;
      if (seen.has(normalized.id)) continue;
      seen.add(normalized.id);
      items.push(normalized);
      if (items.length >= CHECKLIST_MAX_ITEMS) break;
    }
  }

  return {
    id: normalizeSessionId(record.id),
    moduleId: CHECKLIST_MODULE_ID,
    leftPct,
    topPct,
    widthPct: size.widthPct,
    heightPct: size.heightPct,
    title: validateChecklistTitle(record.title),
    items,
    color: normalizeLabObjectColor(record.color),
    boardId: normalizeLabBoardId(record.boardId),
  };
}

export function normalizeModuleLabChecklistsPageData(
  raw: unknown,
): ModuleLabChecklistsPageData {
  if (raw === null || typeof raw !== "object") {
    return { checklists: [] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.checklists)) {
    return { checklists: [] };
  }
  const seen = new Set<string>();
  const checklists: ChecklistInstance[] = [];
  for (const item of record.checklists) {
    const normalized = normalizeChecklistInstance(item);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    checklists.push(normalized);
    if (checklists.length >= CHECKLIST_MAX_INSTANCES) break;
  }
  return { checklists };
}

export type CreateChecklistInstanceInput = {
  leftPct: number;
  topPct: number;
  title?: string;
  randomUUID?: () => string;
};

export function createChecklistInstance(
  input: CreateChecklistInstanceInput,
): ChecklistInstance {
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const frame = frameFromCenterPct({
    leftPct: input.leftPct,
    topPct: input.topPct,
    limits: CHECKLIST_SIZE_LIMITS,
  });
  return {
    id: normalizeSessionId(randomUUID()),
    moduleId: CHECKLIST_MODULE_ID,
    leftPct: frame.leftPct,
    topPct: frame.topPct,
    widthPct: frame.widthPct,
    heightPct: frame.heightPct,
    title: validateChecklistTitle(input.title ?? ""),
    items: [createChecklistItem({ randomUUID })],
    color: DEFAULT_LAB_OBJECT_COLOR,
    boardId: null,
  };
}

export function canCreateChecklistInstance(
  data: ModuleLabChecklistsPageData,
): boolean {
  return data.checklists.length < CHECKLIST_MAX_INSTANCES;
}

export function addChecklistInstance(
  data: ModuleLabChecklistsPageData,
  checklist: ChecklistInstance,
): ModuleLabChecklistsPageData {
  if (!canCreateChecklistInstance(data)) return data;
  if (data.checklists.some((existing) => existing.id === checklist.id)) {
    return data;
  }
  return { checklists: [...data.checklists, checklist] };
}

function mapChecklist(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  update: (checklist: ChecklistInstance) => ChecklistInstance,
): ModuleLabChecklistsPageData {
  const id = checklistId.trim().toLowerCase();
  let changed = false;
  const checklists = data.checklists.map((checklist) => {
    if (checklist.id !== id) return checklist;
    const next = update(checklist);
    if (next === checklist) return checklist;
    changed = true;
    return next;
  });
  return changed ? { checklists } : data;
}

export function updateChecklistTitle(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  title: string,
): ModuleLabChecklistsPageData {
  const nextTitle = validateChecklistTitle(title);
  return mapChecklist(data, checklistId, (checklist) =>
    checklist.title === nextTitle
      ? checklist
      : { ...checklist, title: nextTitle },
  );
}

export function updateChecklistColor(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  color: LabObjectColor,
): ModuleLabChecklistsPageData {
  const nextColor = normalizeLabObjectColor(color);
  return mapChecklist(data, checklistId, (checklist) =>
    checklist.color === nextColor
      ? checklist
      : { ...checklist, color: nextColor },
  );
}

export function updateChecklistSize(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  size: LabObjectSize,
): ModuleLabChecklistsPageData {
  return mapChecklist(data, checklistId, (checklist) => {
    const next = clampLabObjectSize({
      widthPct: size.widthPct,
      heightPct: size.heightPct,
      originLeftPct: checklist.leftPct,
      originTopPct: checklist.topPct,
      limits: CHECKLIST_SIZE_LIMITS,
    });
    if (
      checklist.widthPct === next.widthPct &&
      checklist.heightPct === next.heightPct
    ) {
      return checklist;
    }
    return { ...checklist, ...next };
  });
}

export function updateChecklistBoardId(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  boardId: string | null,
): ModuleLabChecklistsPageData {
  const nextBoardId = normalizeLabBoardId(boardId);
  return mapChecklist(data, checklistId, (checklist) =>
    checklist.boardId === nextBoardId
      ? checklist
      : { ...checklist, boardId: nextBoardId },
  );
}

export function shiftChecklistOrigin(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  deltaLeftPct: number,
  deltaTopPct: number,
): ModuleLabChecklistsPageData {
  const dL = Number.isFinite(deltaLeftPct) ? deltaLeftPct : 0;
  const dT = Number.isFinite(deltaTopPct) ? deltaTopPct : 0;
  if (dL === 0 && dT === 0) return data;
  return mapChecklist(data, checklistId, (checklist) => ({
    ...checklist,
    leftPct: checklist.leftPct + dL,
    topPct: checklist.topPct + dT,
  }));
}

export function canAddChecklistItem(checklist: ChecklistInstance): boolean {
  return checklist.items.length < CHECKLIST_MAX_ITEMS;
}

export function addChecklistItem(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  item?: ChecklistItem,
): ModuleLabChecklistsPageData {
  return mapChecklist(data, checklistId, (checklist) => {
    if (!canAddChecklistItem(checklist)) return checklist;
    const nextItem = item ?? createChecklistItem({});
    if (checklist.items.some((existing) => existing.id === nextItem.id)) {
      return checklist;
    }
    return { ...checklist, items: [...checklist.items, nextItem] };
  });
}

export function updateChecklistItemText(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  itemId: string,
  text: string,
): ModuleLabChecklistsPageData {
  const nextText = validateChecklistItemText(text);
  const itemKey = itemId.trim().toLowerCase();
  return mapChecklist(data, checklistId, (checklist) => {
    let changed = false;
    const items = checklist.items.map((row) => {
      if (row.id !== itemKey) return row;
      if (row.text === nextText) return row;
      changed = true;
      return { ...row, text: nextText };
    });
    return changed ? { ...checklist, items } : checklist;
  });
}

export function toggleChecklistItem(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  itemId: string,
): ModuleLabChecklistsPageData {
  const itemKey = itemId.trim().toLowerCase();
  return mapChecklist(data, checklistId, (checklist) => {
    let changed = false;
    const items = checklist.items.map((row) => {
      if (row.id !== itemKey) return row;
      changed = true;
      return { ...row, completed: !row.completed };
    });
    return changed ? { ...checklist, items } : checklist;
  });
}

export function removeChecklistItem(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
  itemId: string,
): ModuleLabChecklistsPageData {
  const itemKey = itemId.trim().toLowerCase();
  return mapChecklist(data, checklistId, (checklist) => {
    const items = checklist.items.filter((row) => row.id !== itemKey);
    return items.length === checklist.items.length
      ? checklist
      : { ...checklist, items };
  });
}

export function removeChecklistInstance(
  data: ModuleLabChecklistsPageData,
  checklistId: string,
): ModuleLabChecklistsPageData {
  const id = checklistId.trim().toLowerCase();
  const checklists = data.checklists.filter((row) => row.id !== id);
  return checklists.length === data.checklists.length ? data : { checklists };
}

export function resetModuleLabChecklistsPageData(): ModuleLabChecklistsPageData {
  return { checklists: [] };
}

export function worldDeltaToChecklistSizePct(
  deltaWorldX: number,
  deltaWorldY: number,
): { deltaWidthPct: number; deltaHeightPct: number } {
  return worldDeltaToLabSizePct(deltaWorldX, deltaWorldY);
}

export function applyChecklistResize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
  deltaWidthPct: number;
  deltaHeightPct: number;
}): LabObjectSize {
  return applyLabObjectResize({ ...input, limits: CHECKLIST_SIZE_LIMITS });
}

export function nextChecklistSpawnPct(
  existingCount: number,
  base: WorldPct,
): WorldPct {
  return nextLabSpawnPct(existingCount, base);
}
