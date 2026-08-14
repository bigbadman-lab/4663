/**
 * Social 3B — live BRUSH draft helpers (transient Broadcast only).
 * Finished brush strokes live in PlayHTML page data (ephemeral-brush.ts).
 */

import {
  BRUSH_MAX_STROKES,
  BRUSH_MAX_TOTAL_POINTS,
  countBrushPoints,
  hasMeaningfulBrushStrokes,
  normalizeBrushStrokes,
  type BrushStroke,
} from "@/lib/social/ephemeral-brush";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export {
  SOCIAL_BROADCAST_CHANNEL_NAME,
  createThrottledSender,
} from "@/lib/social/text-draft";

export const BRUSH_DRAFT_UPDATED_EVENT = "brush-draft-updated" as const;
export const BRUSH_DRAFT_CLEARED_EVENT = "brush-draft-cleared" as const;

/** Same cadence as OBJECT drawing drafts. */
export const BRUSH_DRAFT_THROTTLE_MS = 75 as const;

export const BRUSH_DRAFT_STALE_MS = 8_000 as const;

export type BrushDraft = {
  draftBrushId: string;
  ownerSessionId: string;
  strokes: BrushStroke[];
  updatedAt: string;
};

export type BrushDraftCleared = {
  draftBrushId: string;
  ownerSessionId: string;
};

export function createBrushDraftId(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return normalizeSessionId(randomUUID());
}

export function normalizeBrushDraft(raw: unknown): BrushDraft | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.draftBrushId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;

  const strokes = normalizeBrushStrokes(record.strokes);
  if (!strokes) return null;

  if (typeof record.updatedAt !== "string" || record.updatedAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.updatedAt))) return null;

  return {
    draftBrushId: normalizeSessionId(record.draftBrushId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    strokes,
    updatedAt: record.updatedAt,
  };
}

export function normalizeBrushDraftCleared(
  raw: unknown,
): BrushDraftCleared | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.draftBrushId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;
  return {
    draftBrushId: normalizeSessionId(record.draftBrushId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
  };
}

export function buildBrushDraft(input: {
  draftBrushId: string;
  ownerSessionId: string;
  strokes: BrushStroke[];
  now?: () => Date;
}): BrushDraft | null {
  if (!isUuid(input.draftBrushId) || !isUuid(input.ownerSessionId)) {
    return null;
  }
  if (input.strokes.length > BRUSH_MAX_STROKES) return null;
  if (countBrushPoints(input.strokes) > BRUSH_MAX_TOTAL_POINTS) return null;

  const now = input.now ?? (() => new Date());
  return {
    draftBrushId: normalizeSessionId(input.draftBrushId),
    ownerSessionId: normalizeSessionId(input.ownerSessionId),
    strokes: input.strokes,
    updatedAt: now().toISOString(),
  };
}

export function upsertBrushDraft(
  drafts: readonly BrushDraft[],
  draft: BrushDraft,
): BrushDraft[] {
  const without = drafts.filter(
    (d) =>
      d.draftBrushId !== draft.draftBrushId &&
      d.ownerSessionId !== draft.ownerSessionId,
  );
  return [...without, draft];
}

export function removeBrushDraft(
  drafts: readonly BrushDraft[],
  draftBrushId: string,
): BrushDraft[] {
  return drafts.filter((d) => d.draftBrushId !== draftBrushId);
}

export function removeBrushDraftsByOwner(
  drafts: readonly BrushDraft[],
  ownerSessionId: string,
): BrushDraft[] {
  const owner = normalizeSessionId(ownerSessionId);
  return drafts.filter((d) => d.ownerSessionId !== owner);
}

export function retainBrushDraftsForPresentOwners(
  drafts: readonly BrushDraft[],
  presentSessionIds: ReadonlySet<string>,
): BrushDraft[] {
  return drafts.filter((d) => presentSessionIds.has(d.ownerSessionId));
}

export function pruneStaleBrushDrafts(
  drafts: readonly BrushDraft[],
  nowMs: number,
  staleMs: number = BRUSH_DRAFT_STALE_MS,
): BrushDraft[] {
  return drafts.filter((d) => {
    const updated = Date.parse(d.updatedAt);
    if (!Number.isFinite(updated)) return false;
    return nowMs - updated <= staleMs;
  });
}

export function brushDraftsForRemoteView(
  drafts: readonly BrushDraft[],
  selfSessionId: string | null,
): BrushDraft[] {
  if (!selfSessionId) return [...drafts];
  const self = normalizeSessionId(selfSessionId);
  return drafts.filter((d) => d.ownerSessionId !== self);
}

export function brushDraftCanPublish(
  strokes: readonly BrushStroke[],
): boolean {
  return hasMeaningfulBrushStrokes(strokes);
}
