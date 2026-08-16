/**
 * NOTE V1 — Module Lab instance helpers.
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
  nextLabSpawnPct,
  worldDeltaToLabSizePct,
  type LabObjectSizeLimits,
} from "@/lib/modules/lab-object-size";
import { isUuid, normalizeSessionId } from "@/lib/presence/session-id";

export const NOTE_MODULE_ID = "note" as const;

/** Isolated from homepage PlayHTML names (`4663-ephemeral-texts`, etc.). */
export const MODULE_LAB_NOTES_PAGE_DATA_NAME =
  "4663-module-lab-notes" as const;

export const NOTE_MAX_CONTENT_LENGTH = 2000 as const;
export const NOTE_MAX_INSTANCES = 40 as const;

export const NOTE_SPAWN_OFFSET_PCT = 2.25 as const;
export const NOTE_SPAWN_GRID = 6 as const;

/** Matches the previous CSS stamp (~16rem × ~8.5rem) on the 4800×3200 world. */
export const NOTE_WIDTH_PCT_DEFAULT = (256 / WORLD_WIDTH_PX) * 100;
export const NOTE_HEIGHT_PCT_DEFAULT = (136 / WORLD_HEIGHT_PX) * 100;
export const NOTE_WIDTH_PCT_MIN = (160 / WORLD_WIDTH_PX) * 100;
export const NOTE_HEIGHT_PCT_MIN = (96 / WORLD_HEIGHT_PX) * 100;
export const NOTE_WIDTH_PCT_MAX = (960 / WORLD_WIDTH_PX) * 100;
export const NOTE_HEIGHT_PCT_MAX = (800 / WORLD_HEIGHT_PX) * 100;

export const NOTE_SIZE_LIMITS: LabObjectSizeLimits = {
  widthPctMin: NOTE_WIDTH_PCT_MIN,
  heightPctMin: NOTE_HEIGHT_PCT_MIN,
  widthPctMax: NOTE_WIDTH_PCT_MAX,
  heightPctMax: NOTE_HEIGHT_PCT_MAX,
  widthPctDefault: NOTE_WIDTH_PCT_DEFAULT,
  heightPctDefault: NOTE_HEIGHT_PCT_DEFAULT,
};

export type NoteInstance = {
  id: string;
  moduleId: typeof NOTE_MODULE_ID;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  content: string;
  color: LabObjectColor;
  boardId: string | null;
};

export type NoteSize = {
  widthPct: number;
  heightPct: number;
};

export type ModuleLabNotesPageData = {
  notes: NoteInstance[];
};

export const EMPTY_MODULE_LAB_NOTES_PAGE_DATA: ModuleLabNotesPageData = {
  notes: [],
};

export function playhtmlNoteElementId(noteId: string): string {
  return `4663-lab-note-${noteId}`;
}

export function isPlayhtmlPageDataWritable(input: {
  isLoading: boolean;
  isProviderMissing: boolean;
}): boolean {
  return !input.isLoading && !input.isProviderMissing;
}

export function validateNoteContent(raw: unknown): string {
  if (typeof raw !== "string") return "";
  if (raw.length <= NOTE_MAX_CONTENT_LENGTH) return raw;
  return raw.slice(0, NOTE_MAX_CONTENT_LENGTH);
}

function isFinitePct(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function defaultNoteSizeForOrigin(leftPct: number, topPct: number): NoteSize {
  return clampNoteSize({
    widthPct: NOTE_WIDTH_PCT_DEFAULT,
    heightPct: NOTE_HEIGHT_PCT_DEFAULT,
    originLeftPct: leftPct,
    originTopPct: topPct,
  });
}

export function clampNoteSize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
}): NoteSize {
  return clampLabObjectSize({ ...input, limits: NOTE_SIZE_LIMITS });
}

/** Pointer world-px delta → independent width/height % (no aspect lock). */
export function worldDeltaToNoteSizePct(
  deltaWorldX: number,
  deltaWorldY: number,
): { deltaWidthPct: number; deltaHeightPct: number } {
  return worldDeltaToLabSizePct(deltaWorldX, deltaWorldY);
}

export function applyNoteResize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
  deltaWidthPct: number;
  deltaHeightPct: number;
}): NoteSize {
  return applyLabObjectResize({ ...input, limits: NOTE_SIZE_LIMITS });
}

export function normalizeNoteInstance(raw: unknown): NoteInstance | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.id)) return null;
  if (record.moduleId !== NOTE_MODULE_ID) return null;
  if (!isFinitePct(record.leftPct) || !isFinitePct(record.topPct)) return null;
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;

  const leftPct = record.leftPct;
  const topPct = record.topPct;
  const widthRaw = isFinitePct(record.widthPct) ? record.widthPct : null;
  const heightRaw = isFinitePct(record.heightPct) ? record.heightPct : null;
  const size =
    widthRaw != null || heightRaw != null
      ? clampNoteSize({
          widthPct: widthRaw ?? NOTE_WIDTH_PCT_DEFAULT,
          heightPct: heightRaw ?? NOTE_HEIGHT_PCT_DEFAULT,
          originLeftPct: leftPct,
          originTopPct: topPct,
        })
      : defaultNoteSizeForOrigin(leftPct, topPct);

  return {
    id: normalizeSessionId(record.id),
    moduleId: NOTE_MODULE_ID,
    leftPct,
    topPct,
    widthPct: size.widthPct,
    heightPct: size.heightPct,
    content: validateNoteContent(record.content),
    color: normalizeLabObjectColor(record.color),
    boardId: normalizeLabBoardId(record.boardId),
  };
}

export function normalizeModuleLabNotesPageData(
  raw: unknown,
): ModuleLabNotesPageData {
  if (raw === null || typeof raw !== "object") {
    return { notes: [] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.notes)) {
    return { notes: [] };
  }

  const seen = new Set<string>();
  const notes: NoteInstance[] = [];
  for (const item of record.notes) {
    const normalized = normalizeNoteInstance(item);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    notes.push(normalized);
    if (notes.length >= NOTE_MAX_INSTANCES) break;
  }
  return { notes };
}

export type CreateNoteInstanceInput = {
  leftPct: number;
  topPct: number;
  content?: string;
  randomUUID?: () => string;
};

export function createNoteInstance(
  input: CreateNoteInstanceInput,
): NoteInstance {
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const frame = frameFromCenterPct({
    leftPct: input.leftPct,
    topPct: input.topPct,
    limits: NOTE_SIZE_LIMITS,
  });
  return {
    id: normalizeSessionId(randomUUID()),
    moduleId: NOTE_MODULE_ID,
    leftPct: frame.leftPct,
    topPct: frame.topPct,
    widthPct: frame.widthPct,
    heightPct: frame.heightPct,
    content: validateNoteContent(input.content ?? ""),
    color: DEFAULT_LAB_OBJECT_COLOR,
    boardId: null,
  };
}

export function canCreateNoteInstance(data: ModuleLabNotesPageData): boolean {
  return data.notes.length < NOTE_MAX_INSTANCES;
}

export function addNoteInstance(
  data: ModuleLabNotesPageData,
  note: NoteInstance,
): ModuleLabNotesPageData {
  if (!canCreateNoteInstance(data)) return data;
  if (data.notes.some((existing) => existing.id === note.id)) return data;
  return { notes: [...data.notes, note] };
}

export function updateNoteContent(
  data: ModuleLabNotesPageData,
  noteId: string,
  content: string,
): ModuleLabNotesPageData {
  const id = noteId.trim().toLowerCase();
  const nextContent = validateNoteContent(content);
  let changed = false;
  const notes = data.notes.map((note) => {
    if (note.id !== id) return note;
    if (note.content === nextContent) return note;
    changed = true;
    return { ...note, content: nextContent };
  });
  return changed ? { notes } : data;
}

export function updateNoteColor(
  data: ModuleLabNotesPageData,
  noteId: string,
  color: LabObjectColor,
): ModuleLabNotesPageData {
  const id = noteId.trim().toLowerCase();
  const nextColor = normalizeLabObjectColor(color);
  let changed = false;
  const notes = data.notes.map((note) => {
    if (note.id !== id) return note;
    if (note.color === nextColor) return note;
    changed = true;
    return { ...note, color: nextColor };
  });
  return changed ? { notes } : data;
}

export function updateNoteSize(
  data: ModuleLabNotesPageData,
  noteId: string,
  size: NoteSize,
): ModuleLabNotesPageData {
  const id = noteId.trim().toLowerCase();
  let changed = false;
  const notes = data.notes.map((note) => {
    if (note.id !== id) return note;
    const next = clampNoteSize({
      widthPct: size.widthPct,
      heightPct: size.heightPct,
      originLeftPct: note.leftPct,
      originTopPct: note.topPct,
    });
    if (
      note.widthPct === next.widthPct &&
      note.heightPct === next.heightPct
    ) {
      return note;
    }
    changed = true;
    return { ...note, ...next };
  });
  return changed ? { notes } : data;
}

export function updateNoteBoardId(
  data: ModuleLabNotesPageData,
  noteId: string,
  boardId: string | null,
): ModuleLabNotesPageData {
  const id = noteId.trim().toLowerCase();
  const nextBoardId = normalizeLabBoardId(boardId);
  let changed = false;
  const notes = data.notes.map((note) => {
    if (note.id !== id) return note;
    if (note.boardId === nextBoardId) return note;
    changed = true;
    return { ...note, boardId: nextBoardId };
  });
  return changed ? { notes } : data;
}

export function shiftNoteOrigin(
  data: ModuleLabNotesPageData,
  noteId: string,
  deltaLeftPct: number,
  deltaTopPct: number,
): ModuleLabNotesPageData {
  const id = noteId.trim().toLowerCase();
  const dL = Number.isFinite(deltaLeftPct) ? deltaLeftPct : 0;
  const dT = Number.isFinite(deltaTopPct) ? deltaTopPct : 0;
  if (dL === 0 && dT === 0) return data;
  let changed = false;
  const notes = data.notes.map((note) => {
    if (note.id !== id) return note;
    changed = true;
    return {
      ...note,
      leftPct: note.leftPct + dL,
      topPct: note.topPct + dT,
    };
  });
  return changed ? { notes } : data;
}

export function removeNoteInstance(
  data: ModuleLabNotesPageData,
  noteId: string,
): ModuleLabNotesPageData {
  const id = noteId.trim().toLowerCase();
  const notes = data.notes.filter((note) => note.id !== id);
  return notes.length === data.notes.length ? data : { notes };
}

export function resetModuleLabNotesPageData(): ModuleLabNotesPageData {
  return { notes: [] };
}

/**
 * Offset later notes from a shared spawn origin so they do not stack.
 * Grid wraps; not a placement engine.
 */
export function nextNoteSpawnPct(
  existingCount: number,
  base: WorldPct,
): WorldPct {
  return nextLabSpawnPct(
    existingCount,
    base,
    NOTE_SPAWN_OFFSET_PCT,
    NOTE_SPAWN_GRID,
  );
}
