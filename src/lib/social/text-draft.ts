/**
 * Social 2B — live TEXT draft helpers (transient Broadcast only).
 * Published texts remain in PlayHTML page data (Social 2A).
 */

import {
  clampCanvasPct,
  EPHEMERAL_TEXT_MAX_LENGTH,
  validateTextBody,
} from "@/lib/social/ephemeral-text";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export const SOCIAL_BROADCAST_CHANNEL_NAME = "4663-social-broadcast" as const;

export const TEXT_DRAFT_UPDATED_EVENT = "text-draft-updated" as const;
export const TEXT_DRAFT_CLEARED_EVENT = "text-draft-cleared" as const;

/** Broadcast cadence for live typing (~visibly live, not per raw key). */
export const TEXT_DRAFT_THROTTLE_MS = 100 as const;

/** Drop remote drafts that stop updating (missed clear / idle). */
export const TEXT_DRAFT_STALE_MS = 8_000 as const;

export type TextDraft = {
  draftId: string;
  ownerSessionId: string;
  body: string;
  leftPct: number;
  topPct: number;
  updatedAt: string;
};

export type TextDraftCleared = {
  draftId: string;
  ownerSessionId: string;
};

export function createTextDraftId(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return normalizeSessionId(randomUUID());
}

export function normalizeTextDraft(raw: unknown): TextDraft | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.draftId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;

  if (typeof record.body !== "string") return null;
  if (record.body.length > EPHEMERAL_TEXT_MAX_LENGTH) return null;
  // Allow empty body (cursor-only remote); reject control-only spam via length only.

  if (typeof record.leftPct !== "number" || !Number.isFinite(record.leftPct)) {
    return null;
  }
  if (typeof record.topPct !== "number" || !Number.isFinite(record.topPct)) {
    return null;
  }
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;

  if (typeof record.updatedAt !== "string" || record.updatedAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.updatedAt))) return null;

  return {
    draftId: normalizeSessionId(record.draftId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    body: record.body.slice(0, EPHEMERAL_TEXT_MAX_LENGTH),
    leftPct: clampCanvasPct(record.leftPct),
    topPct: clampCanvasPct(record.topPct),
    updatedAt: record.updatedAt,
  };
}

export function normalizeTextDraftCleared(
  raw: unknown,
): TextDraftCleared | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.draftId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;
  return {
    draftId: normalizeSessionId(record.draftId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
  };
}

export function buildTextDraft(input: {
  draftId: string;
  ownerSessionId: string;
  body: string;
  leftPct: number;
  topPct: number;
  now?: () => Date;
}): TextDraft | null {
  if (!isUuid(input.draftId) || !isUuid(input.ownerSessionId)) return null;
  if (typeof input.body !== "string") return null;
  const body = input.body.slice(0, EPHEMERAL_TEXT_MAX_LENGTH);
  const now = input.now ?? (() => new Date());
  return {
    draftId: normalizeSessionId(input.draftId),
    ownerSessionId: normalizeSessionId(input.ownerSessionId),
    body,
    leftPct: clampCanvasPct(input.leftPct),
    topPct: clampCanvasPct(input.topPct),
    updatedAt: now().toISOString(),
  };
}

/** Upsert by draftId; one active draft per owner preferred at call sites. */
export function upsertTextDraft(
  drafts: readonly TextDraft[],
  draft: TextDraft,
): TextDraft[] {
  const without = drafts.filter(
    (d) =>
      d.draftId !== draft.draftId &&
      d.ownerSessionId !== draft.ownerSessionId,
  );
  return [...without, draft];
}

export function removeTextDraft(
  drafts: readonly TextDraft[],
  draftId: string,
): TextDraft[] {
  return drafts.filter((d) => d.draftId !== draftId);
}

export function removeTextDraftsByOwner(
  drafts: readonly TextDraft[],
  ownerSessionId: string,
): TextDraft[] {
  const owner = normalizeSessionId(ownerSessionId);
  return drafts.filter((d) => d.ownerSessionId !== owner);
}

export function retainTextDraftsForPresentOwners(
  drafts: readonly TextDraft[],
  presentSessionIds: ReadonlySet<string>,
): TextDraft[] {
  return drafts.filter((d) => presentSessionIds.has(d.ownerSessionId));
}

export function pruneStaleTextDrafts(
  drafts: readonly TextDraft[],
  nowMs: number,
  staleMs: number = TEXT_DRAFT_STALE_MS,
): TextDraft[] {
  return drafts.filter((d) => {
    const updated = Date.parse(d.updatedAt);
    if (!Number.isFinite(updated)) return false;
    return nowMs - updated <= staleMs;
  });
}

export function draftsForRemoteView(
  drafts: readonly TextDraft[],
  selfSessionId: string | null,
): TextDraft[] {
  if (!selfSessionId) return [...drafts];
  const self = normalizeSessionId(selfSessionId);
  return drafts.filter((d) => d.ownerSessionId !== self);
}

/**
 * Leading+trailing throttle: sends immediately, then at most once per `ms`,
 * always flushing the latest value after the window (so final chars aren't lost).
 */
export function createThrottledSender<T>(
  send: (value: T) => void,
  ms: number,
  timers: {
    setTimeoutFn: (handler: () => void, ms: number) => unknown;
    clearTimeoutFn: (id: unknown) => void;
  } = {
    setTimeoutFn: (handler, delay) => setTimeout(handler, delay),
    clearTimeoutFn: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
): {
  push: (value: T) => void;
  flush: () => void;
  cancel: () => void;
} {
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let pending: T | null = null;
  let timer: unknown = null;

  const clearTimer = () => {
    if (timer !== null) {
      timers.clearTimeoutFn(timer);
      timer = null;
    }
  };

  const emit = (value: T) => {
    lastSentAt = Date.now();
    pending = null;
    send(value);
  };

  return {
    push(value: T) {
      const now = Date.now();
      const elapsed = now - lastSentAt;
      if (elapsed >= ms) {
        clearTimer();
        emit(value);
        return;
      }
      pending = value;
      if (timer !== null) return;
      timer = timers.setTimeoutFn(() => {
        timer = null;
        if (pending !== null) {
          emit(pending);
        }
      }, ms - elapsed);
    },
    flush() {
      clearTimer();
      if (pending !== null) {
        emit(pending);
      }
    },
    cancel() {
      clearTimer();
      pending = null;
    },
  };
}

/** Re-export body validation for publish path tests. */
export { validateTextBody, EPHEMERAL_TEXT_MAX_LENGTH };
