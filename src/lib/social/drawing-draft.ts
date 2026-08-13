/**
 * Social 3A — live DRAW draft helpers (transient Broadcast only).
 * Finished drawings remain in PlayHTML page data (ephemeral-drawing.ts).
 */

import {
  DRAWING_MAX_STROKES,
  DRAWING_MAX_TOTAL_POINTS,
  DRAWING_SIZE_PCT_MAX,
  DRAWING_SIZE_PCT_MIN,
  DRAWING_ZONE_HEIGHT_PCT,
  DRAWING_ZONE_WIDTH_PCT,
  hasMeaningfulStrokes,
  normalizeDrawingStrokes,
  resolveDrawingAspectRatio,
  type DrawingStroke,
} from "@/lib/social/ephemeral-drawing";
import { clampCanvasPct } from "@/lib/social/ephemeral-text";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export {
  SOCIAL_BROADCAST_CHANNEL_NAME,
  createThrottledSender,
} from "@/lib/social/text-draft";

export const DRAWING_DRAFT_UPDATED_EVENT = "drawing-draft-updated" as const;
export const DRAWING_DRAFT_CLEARED_EVENT = "drawing-draft-cleared" as const;

/** Broadcast cadence for live drawing (~visibly live, not per raw pointermove). */
export const DRAWING_DRAFT_THROTTLE_MS = 75 as const;

/** Drop remote drawing drafts that stop updating (missed clear / idle). */
export const DRAWING_DRAFT_STALE_MS = 8_000 as const;

export type DrawingDraft = {
  draftDrawingId: string;
  ownerSessionId: string;
  strokes: DrawingStroke[];
  leftPct: number;
  topPct: number;
  widthPct: number;
  /** Legacy size hint; layout uses widthPct + aspectRatio. */
  heightPct: number;
  /** Frozen authoring pixel aspect (width / height). */
  aspectRatio: number;
  updatedAt: string;
};

export type DrawingDraftCleared = {
  draftDrawingId: string;
  ownerSessionId: string;
};

export function createDrawingDraftId(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return normalizeSessionId(randomUUID());
}

function clampSizePct(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(DRAWING_SIZE_PCT_MAX, Math.max(DRAWING_SIZE_PCT_MIN, value));
}

export function normalizeDrawingDraft(raw: unknown): DrawingDraft | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.draftDrawingId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;

  const strokes = normalizeDrawingStrokes(record.strokes);
  if (!strokes) return null;

  if (typeof record.leftPct !== "number" || !Number.isFinite(record.leftPct)) {
    return null;
  }
  if (typeof record.topPct !== "number" || !Number.isFinite(record.topPct)) {
    return null;
  }
  if (
    typeof record.widthPct !== "number" ||
    !Number.isFinite(record.widthPct)
  ) {
    return null;
  }
  if (
    typeof record.heightPct !== "number" ||
    !Number.isFinite(record.heightPct)
  ) {
    return null;
  }
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;
  if (
    record.widthPct < DRAWING_SIZE_PCT_MIN ||
    record.widthPct > DRAWING_SIZE_PCT_MAX
  ) {
    return null;
  }
  if (
    record.heightPct < DRAWING_SIZE_PCT_MIN ||
    record.heightPct > DRAWING_SIZE_PCT_MAX
  ) {
    return null;
  }

  const widthPct = clampSizePct(record.widthPct, DRAWING_ZONE_WIDTH_PCT);
  const heightPct = clampSizePct(record.heightPct, DRAWING_ZONE_HEIGHT_PCT);
  const aspectRatio = resolveDrawingAspectRatio({
    aspectRatio: record.aspectRatio,
    widthPct,
    heightPct,
  });
  if (aspectRatio === null) return null;

  if (typeof record.updatedAt !== "string" || record.updatedAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.updatedAt))) return null;

  return {
    draftDrawingId: normalizeSessionId(record.draftDrawingId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    strokes,
    leftPct: clampCanvasPct(record.leftPct),
    topPct: clampCanvasPct(record.topPct),
    widthPct,
    heightPct,
    aspectRatio,
    updatedAt: record.updatedAt,
  };
}

export function normalizeDrawingDraftCleared(
  raw: unknown,
): DrawingDraftCleared | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.draftDrawingId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;
  return {
    draftDrawingId: normalizeSessionId(record.draftDrawingId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
  };
}

export function buildDrawingDraft(input: {
  draftDrawingId: string;
  ownerSessionId: string;
  strokes: DrawingStroke[];
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  aspectRatio: number;
  now?: () => Date;
}): DrawingDraft | null {
  if (!isUuid(input.draftDrawingId) || !isUuid(input.ownerSessionId)) {
    return null;
  }
  if (input.strokes.length > DRAWING_MAX_STROKES) return null;
  if (
    input.strokes.reduce((n, s) => n + s.points.length, 0) >
    DRAWING_MAX_TOTAL_POINTS
  ) {
    return null;
  }

  const widthPct = clampSizePct(input.widthPct, DRAWING_ZONE_WIDTH_PCT);
  const heightPct = clampSizePct(input.heightPct, DRAWING_ZONE_HEIGHT_PCT);
  const aspectRatio = resolveDrawingAspectRatio({
    aspectRatio: input.aspectRatio,
    widthPct,
    heightPct,
  });
  if (aspectRatio === null) return null;

  const now = input.now ?? (() => new Date());
  return {
    draftDrawingId: normalizeSessionId(input.draftDrawingId),
    ownerSessionId: normalizeSessionId(input.ownerSessionId),
    strokes: input.strokes,
    leftPct: clampCanvasPct(input.leftPct),
    topPct: clampCanvasPct(input.topPct),
    widthPct,
    heightPct,
    aspectRatio,
    updatedAt: now().toISOString(),
  };
}

export function upsertDrawingDraft(
  drafts: readonly DrawingDraft[],
  draft: DrawingDraft,
): DrawingDraft[] {
  const without = drafts.filter(
    (d) =>
      d.draftDrawingId !== draft.draftDrawingId &&
      d.ownerSessionId !== draft.ownerSessionId,
  );
  return [...without, draft];
}

export function removeDrawingDraft(
  drafts: readonly DrawingDraft[],
  draftDrawingId: string,
): DrawingDraft[] {
  return drafts.filter((d) => d.draftDrawingId !== draftDrawingId);
}

export function removeDrawingDraftsByOwner(
  drafts: readonly DrawingDraft[],
  ownerSessionId: string,
): DrawingDraft[] {
  const owner = normalizeSessionId(ownerSessionId);
  return drafts.filter((d) => d.ownerSessionId !== owner);
}

export function retainDrawingDraftsForPresentOwners(
  drafts: readonly DrawingDraft[],
  presentSessionIds: ReadonlySet<string>,
): DrawingDraft[] {
  return drafts.filter((d) => presentSessionIds.has(d.ownerSessionId));
}

export function pruneStaleDrawingDrafts(
  drafts: readonly DrawingDraft[],
  nowMs: number,
  staleMs: number = DRAWING_DRAFT_STALE_MS,
): DrawingDraft[] {
  return drafts.filter((d) => {
    const updated = Date.parse(d.updatedAt);
    if (!Number.isFinite(updated)) return false;
    return nowMs - updated <= staleMs;
  });
}

export function drawingDraftsForRemoteView(
  drafts: readonly DrawingDraft[],
  selfSessionId: string | null,
): DrawingDraft[] {
  if (!selfSessionId) return [...drafts];
  const self = normalizeSessionId(selfSessionId);
  return drafts.filter((d) => d.ownerSessionId !== self);
}

export function drawingDraftCanPublish(
  strokes: readonly DrawingStroke[],
): boolean {
  return hasMeaningfulStrokes(strokes);
}
