/**
 * Social 5 — shared active SUMMON room state (PlayHTML page data).
 * Session-bound global mutex; not durable Postgres.
 */

import {
  SUMMON_MAX_EVENTS,
  isUuidLike,
} from "@/lib/canvas/summon";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export const ACTIVE_SUMMON_PAGE_DATA_NAME = "4663-active-summon" as const;

export type ActiveSummonState = {
  summonId: string;
  ownerSessionId: string;
  /** Ordered event ids (≤8). Slot i → SUMMON_SLOTS[i] (deterministic). */
  eventIds: string[];
  startedAt: string;
};

export type ActiveSummonPageData = {
  active: ActiveSummonState | null;
};

export const EMPTY_ACTIVE_SUMMON_PAGE_DATA: ActiveSummonPageData = {
  active: null,
};

export function normalizeActiveSummonState(
  raw: unknown,
): ActiveSummonState | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;

  if (typeof record.summonId !== "string" || !isUuidLike(record.summonId)) {
    return null;
  }
  if (!isUuid(record.ownerSessionId)) return null;

  if (!Array.isArray(record.eventIds)) return null;
  if (record.eventIds.length === 0) return null;
  if (record.eventIds.length > SUMMON_MAX_EVENTS) return null;

  const seen = new Set<string>();
  const eventIds: string[] = [];
  for (const id of record.eventIds) {
    if (typeof id !== "string" || !isUuidLike(id)) return null;
    const normalized = id.trim().toLowerCase();
    if (seen.has(normalized)) return null;
    seen.add(normalized);
    eventIds.push(normalized);
  }

  if (typeof record.startedAt !== "string" || record.startedAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.startedAt))) return null;

  return {
    summonId: record.summonId.trim().toLowerCase(),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    eventIds,
    startedAt: record.startedAt,
  };
}

export function normalizeActiveSummonPageData(
  raw: unknown,
): ActiveSummonPageData {
  if (raw === null || typeof raw !== "object") {
    return { active: null };
  }
  const record = raw as Record<string, unknown>;
  if (record.active === null || record.active === undefined) {
    return { active: null };
  }
  const active = normalizeActiveSummonState(record.active);
  return { active };
}

export function createActiveSummonState(input: {
  ownerSessionId: string;
  eventIds: readonly string[];
  summonId?: string;
  startedAt?: string;
  createId?: () => string;
  now?: () => Date;
}): ActiveSummonState | null {
  if (!isUuid(input.ownerSessionId)) return null;
  if (input.eventIds.length === 0) return null;
  if (input.eventIds.length > SUMMON_MAX_EVENTS) return null;

  const seen = new Set<string>();
  const eventIds: string[] = [];
  for (const id of input.eventIds) {
    if (typeof id !== "string" || !isUuidLike(id)) return null;
    const normalized = id.trim().toLowerCase();
    if (seen.has(normalized)) return null;
    seen.add(normalized);
    eventIds.push(normalized);
  }

  const createId =
    input.createId ??
    (() =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const now = input.now ?? (() => new Date());

  return {
    summonId: (input.summonId ?? createId()).trim().toLowerCase(),
    ownerSessionId: normalizeSessionId(input.ownerSessionId),
    eventIds,
    startedAt: input.startedAt ?? now().toISOString(),
  };
}

export function clearActiveSummonIfOwner(
  data: ActiveSummonPageData,
  sessionId: string,
): ActiveSummonPageData {
  if (!data.active) return data;
  if (data.active.ownerSessionId !== normalizeSessionId(sessionId)) {
    return data;
  }
  return { active: null };
}

/** Owner Summon click should clear (toggle OFF) rather than re-dispatch. */
export function shouldDismissActiveSummonOnClick(
  data: ActiveSummonPageData,
  sessionId: string,
): boolean {
  if (!data.active) return false;
  return data.active.ownerSessionId === normalizeSessionId(sessionId);
}

export function retainActiveSummonForPresentOwner(
  data: ActiveSummonPageData,
  presentSessionIds: ReadonlySet<string>,
): ActiveSummonPageData {
  if (!data.active) return data;
  if (presentSessionIds.has(data.active.ownerSessionId)) return data;
  return { active: null };
}

export function canClaimActiveSummon(
  data: ActiveSummonPageData,
  presentSessionIds: ReadonlySet<string>,
): boolean {
  if (!data.active) return true;
  // Orphaned active (owner gone) is claimable after retain cleanup.
  return !presentSessionIds.has(data.active.ownerSessionId);
}
