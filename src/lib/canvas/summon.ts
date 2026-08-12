/**
 * Stage 10B.9 — shared SUMMON pure helpers.
 * Ephemeral PlayHTML event payload + selection/resolve/lifetime.
 */

import type { CanvasSlot } from "@/lib/canvas/slots";
import {
  comparePublicEventsNewestFirst,
  isEventVisibleByAge,
  LIVE_OBJECT_MAX_AGE_MS,
} from "@/lib/canvas/visible-events";
import type { PublicEvent } from "@/lib/events/types";

export const PLAYHTML_SUMMON_EVENT_TYPE = "4663-summon" as const;

export const SUMMON_MAX_EVENTS = 8 as const;
export const SUMMON_LIFETIME_MS = 20_000 as const;
export const SUMMON_COOLDOWN_MS = 4_000 as const;

export type SummonPayload = {
  summonId: string;
  eventIds: string[];
  startedAt: number;
};

/** Eight sparse mid-canvas origins — independent of live CANVAS_SLOTS. */
export const SUMMON_SLOTS: readonly CanvasSlot[] = [
  { id: "summon-0", leftPct: 12, topPct: 24 },
  { id: "summon-1", leftPct: 36, topPct: 20 },
  { id: "summon-2", leftPct: 62, topPct: 24 },
  { id: "summon-3", leftPct: 84, topPct: 30 },
  { id: "summon-4", leftPct: 18, topPct: 48 },
  { id: "summon-5", leftPct: 44, topPct: 54 },
  { id: "summon-6", leftPct: 68, topPct: 50 },
  { id: "summon-7", leftPct: 88, topPct: 58 },
] as const;

export function playhtmlSummonedElementId(
  summonId: string,
  eventId: string,
): string {
  return `4663-summoned-${summonId}-${eventId}`;
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** Fail-closed parse of incoming PlayHTML summon payloads. */
export function parseSummonPayload(raw: unknown): SummonPayload | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  const summonId = rec.summonId;
  const startedAt = rec.startedAt;
  const eventIds = rec.eventIds;

  if (typeof summonId !== "string" || !isUuidLike(summonId)) return null;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return null;
  if (!Array.isArray(eventIds)) return null;
  if (eventIds.length > SUMMON_MAX_EVENTS) return null;

  const ids: string[] = [];
  for (const id of eventIds) {
    if (typeof id !== "string" || id.length === 0 || !isUuidLike(id)) {
      return null;
    }
    ids.push(id);
  }

  return { summonId, eventIds: ids, startedAt };
}

export function isSummonExpired(
  startedAt: number,
  nowMs: number,
  lifetimeMs: number = SUMMON_LIFETIME_MS,
): boolean {
  return nowMs - startedAt >= lifetimeMs;
}

export function isSummonStaleOnReceive(
  startedAt: number,
  nowMs: number,
  lifetimeMs: number = SUMMON_LIFETIME_MS,
): boolean {
  return isSummonExpired(startedAt, nowMs, lifetimeMs);
}

export function canDispatchSummon(
  lastDispatchAt: number | null,
  nowMs: number,
  cooldownMs: number = SUMMON_COOLDOWN_MS,
): boolean {
  if (lastDispatchAt === null) return true;
  return nowMs - lastDispatchAt >= cooldownMs;
}

/**
 * Newest-first historical ids, excluding currently-live (<=90s) events.
 */
export function selectSummonEventIds(
  events: readonly PublicEvent[],
  nowMs: number,
  maxCount: number = SUMMON_MAX_EVENTS,
  liveMaxAgeMs: number = LIVE_OBJECT_MAX_AGE_MS,
): string[] {
  const cap = Math.max(0, Math.trunc(maxCount));
  if (cap === 0) return [];

  const liveIds = new Set(
    events
      .filter((event) => isEventVisibleByAge(event, nowMs, liveMaxAgeMs))
      .map((event) => event.id),
  );

  const historical = events.filter((event) => !liveIds.has(event.id));
  historical.sort(comparePublicEventsNewestFirst);
  return historical.slice(0, cap).map((event) => event.id);
}

export function createSummonPayload(
  eventIds: readonly string[],
  options?: {
    summonId?: string;
    startedAt?: number;
    createId?: () => string;
  },
): SummonPayload | null {
  if (eventIds.length === 0) return null;
  const createId =
    options?.createId ??
    (() =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return {
    summonId: options?.summonId ?? createId(),
    eventIds: [...eventIds].slice(0, SUMMON_MAX_EVENTS),
    startedAt: options?.startedAt ?? Date.now(),
  };
}

/**
 * Resolve payload ids from known events, preserving payload order.
 * Optionally merge a one-shot recovery map for missing ids.
 */
export function resolveSummonEvents(
  eventIds: readonly string[],
  localEvents: readonly PublicEvent[],
  recoveryEvents: readonly PublicEvent[] = [],
): PublicEvent[] {
  const map = new Map<string, PublicEvent>();
  for (const event of localEvents) map.set(event.id, event);
  for (const event of recoveryEvents) {
    if (!map.has(event.id)) map.set(event.id, event);
  }

  const out: PublicEvent[] = [];
  for (const id of eventIds) {
    const event = map.get(id);
    if (event) out.push(event);
  }
  return out;
}

/** Drop summoned events that are currently live on this client. */
export function suppressLiveDuplicates(
  events: readonly PublicEvent[],
  liveIds: ReadonlySet<string>,
): PublicEvent[] {
  return events.filter((event) => !liveIds.has(event.id));
}

export function assignSummonSlots(
  events: readonly PublicEvent[],
  slots: readonly CanvasSlot[] = SUMMON_SLOTS,
): Array<{ event: PublicEvent; slot: CanvasSlot }> {
  const out: Array<{ event: PublicEvent; slot: CanvasSlot }> = [];
  for (let i = 0; i < events.length && i < slots.length; i += 1) {
    out.push({ event: events[i]!, slot: slots[i]! });
  }
  return out;
}

/**
 * Whether applying this summon should proceed (replace prior / ignore duplicate / ignore stale).
 */
export function shouldApplySummon(args: {
  payload: SummonPayload;
  activeSummonId: string | null;
  nowMs: number;
}): "apply" | "ignore-duplicate" | "ignore-stale" {
  if (isSummonStaleOnReceive(args.payload.startedAt, args.nowMs)) {
    return "ignore-stale";
  }
  if (args.activeSummonId === args.payload.summonId) {
    return "ignore-duplicate";
  }
  return "apply";
}
