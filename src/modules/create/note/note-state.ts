/**
 * NOTE V1 — Module Lab instance helpers.
 * PlayHTML page-data only. Not a production canvas model.
 */

import {
  clampWorldPct,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
  type WorldPct,
} from "@/lib/canvas/world-camera";
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

export type NoteInstance = {
  id: string;
  moduleId: typeof NOTE_MODULE_ID;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  content: string;
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

function clampNoteOriginPct(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

/**
 * Size against a top-left origin: min/max plus remaining world room.
 * If remaining room is below min, prefer staying in-bounds.
 */
export function clampNoteSize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
}): NoteSize {
  const originLeftPct = clampNoteOriginPct(input.originLeftPct);
  const originTopPct = clampNoteOriginPct(input.originTopPct);
  const roomW = Math.max(0, 100 - originLeftPct);
  const roomH = Math.max(0, 100 - originTopPct);
  const maxW = Math.min(NOTE_WIDTH_PCT_MAX, roomW);
  const maxH = Math.min(NOTE_HEIGHT_PCT_MAX, roomH);
  const minW = Math.min(NOTE_WIDTH_PCT_MIN, maxW);
  const minH = Math.min(NOTE_HEIGHT_PCT_MIN, maxH);
  const widthPct = Number.isFinite(input.widthPct)
    ? input.widthPct
    : NOTE_WIDTH_PCT_DEFAULT;
  const heightPct = Number.isFinite(input.heightPct)
    ? input.heightPct
    : NOTE_HEIGHT_PCT_DEFAULT;
  return {
    widthPct: Math.min(maxW, Math.max(minW, widthPct)),
    heightPct: Math.min(maxH, Math.max(minH, heightPct)),
  };
}

/** Pointer world-px delta → independent width/height % (no aspect lock). */
export function worldDeltaToNoteSizePct(
  deltaWorldX: number,
  deltaWorldY: number,
): { deltaWidthPct: number; deltaHeightPct: number } {
  return {
    deltaWidthPct: (deltaWorldX / WORLD_WIDTH_PX) * 100,
    deltaHeightPct: (deltaWorldY / WORLD_HEIGHT_PX) * 100,
  };
}

export function applyNoteResize(input: {
  widthPct: number;
  heightPct: number;
  originLeftPct: number;
  originTopPct: number;
  deltaWidthPct: number;
  deltaHeightPct: number;
}): NoteSize {
  const dW = Number.isFinite(input.deltaWidthPct) ? input.deltaWidthPct : 0;
  const dH = Number.isFinite(input.deltaHeightPct) ? input.deltaHeightPct : 0;
  return clampNoteSize({
    widthPct: input.widthPct + dW,
    heightPct: input.heightPct + dH,
    originLeftPct: input.originLeftPct,
    originTopPct: input.originTopPct,
  });
}

function defaultNoteSizeForOrigin(
  leftPct: number,
  topPct: number,
): NoteSize {
  return clampNoteSize({
    widthPct: NOTE_WIDTH_PCT_DEFAULT,
    heightPct: NOTE_HEIGHT_PCT_DEFAULT,
    originLeftPct: leftPct,
    originTopPct: topPct,
  });
}

function fitNoteFrame(input: {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}): {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
} {
  const size = clampNoteSize({
    widthPct: input.widthPct,
    heightPct: input.heightPct,
    originLeftPct: 0,
    originTopPct: 0,
  });
  let leftPct = clampNoteOriginPct(input.leftPct);
  let topPct = clampNoteOriginPct(input.topPct);
  if (leftPct + size.widthPct > 100) {
    leftPct = Math.max(0, 100 - size.widthPct);
  }
  if (topPct + size.heightPct > 100) {
    topPct = Math.max(0, 100 - size.heightPct);
  }
  const fitted = clampNoteSize({
    widthPct: size.widthPct,
    heightPct: size.heightPct,
    originLeftPct: leftPct,
    originTopPct: topPct,
  });
  return { leftPct, topPct, ...fitted };
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
  const size = defaultNoteSizeForOrigin(0, 0);
  const centerLeft = clampWorldPct(input.leftPct);
  const centerTop = clampWorldPct(input.topPct);
  const frame = fitNoteFrame({
    leftPct: centerLeft - size.widthPct / 2,
    topPct: centerTop - size.heightPct / 2,
    widthPct: size.widthPct,
    heightPct: size.heightPct,
  });
  return {
    id: normalizeSessionId(randomUUID()),
    moduleId: NOTE_MODULE_ID,
    leftPct: frame.leftPct,
    topPct: frame.topPct,
    widthPct: frame.widthPct,
    heightPct: frame.heightPct,
    content: validateNoteContent(input.content ?? ""),
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
  const n = Math.max(0, Math.floor(existingCount));
  const col = n % NOTE_SPAWN_GRID;
  const row = Math.floor(n / NOTE_SPAWN_GRID) % NOTE_SPAWN_GRID;
  return {
    leftPct: clampWorldPct(base.leftPct + col * NOTE_SPAWN_OFFSET_PCT),
    topPct: clampWorldPct(base.topPct + row * NOTE_SPAWN_OFFSET_PCT),
  };
}
