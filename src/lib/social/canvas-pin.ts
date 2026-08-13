/**
 * Social 7 — durable 24h PIN helpers (validation + normalize).
 * persistent_24h — do not wire into LEAVE/RESET/Presence cleanup.
 */

import { LIVE_OBJECT_MAX_AGE_MS } from "@/lib/canvas/visible-events";
import { CHAIN_ID } from "@/lib/pons/constants";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";
import {
  isParticipationColour,
  type ParticipationColour,
} from "@/lib/social/colour";
import { validateDisplayName } from "@/lib/social/display-name";
import {
  PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY,
  type PublicEvent,
} from "@/lib/events/types";

export const PINS_API_PATH = "/api/social/pins" as const;
export const CANVAS_PINS_TABLE = "canvas_pins" as const;
export const CANVAS_PINS_REALTIME_CHANNEL = "4663-canvas-pins" as const;
export const PIN_TTL_MS = 24 * 60 * 60 * 1000;
/** Eligible live presentation type for PIN (current Social MVP UI path). */
export const PIN_ELIGIBLE_EVENT_TYPE = PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY;

export type CanvasPin = {
  id: string;
  chainId: typeof CHAIN_ID;
  eventId: string;
  pinnedBySessionId: string;
  pinnedByDisplayName: string;
  pinnedByColour: ParticipationColour;
  createdAt: string;
  expiresAt: string;
  /** Snapshot sufficient to render without live stream. */
  event: PublicEvent;
};

export function pinExpiresAtFromOccurred(occurredAt: Date): Date {
  return new Date(occurredAt.getTime() + PIN_TTL_MS);
}

/**
 * LIVE eligibility for PIN / live layer.
 * LIVE iff age >= 0 AND age < LIVE_OBJECT_MAX_AGE_MS (exactly 10m → not LIVE).
 */
export function isEventLiveForPin(
  occurredAtIso: string,
  nowMs: number,
  liveMaxAgeMs: number = LIVE_OBJECT_MAX_AGE_MS,
): boolean {
  const occurred = Date.parse(occurredAtIso);
  if (!Number.isFinite(occurred)) return false;
  const age = nowMs - occurred;
  return age >= 0 && age < liveMaxAgeMs;
}

export function isPinActive(
  pin: Pick<CanvasPin, "expiresAt">,
  nowMs: number,
): boolean {
  const expiresMs = Date.parse(pin.expiresAt);
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs > nowMs;
}

export function pruneExpiredPins(
  pins: readonly CanvasPin[],
  nowMs: number,
): CanvasPin[] {
  return pins.filter((pin) => isPinActive(pin, nowMs));
}

export function upsertCanvasPin(
  pins: readonly CanvasPin[],
  pin: CanvasPin,
): CanvasPin[] {
  const filtered = pins.filter(
    (p) => p.id !== pin.id && p.eventId !== pin.eventId,
  );
  return [...filtered, pin].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export function removeCanvasPinById(
  pins: readonly CanvasPin[],
  pinId: string,
): CanvasPin[] {
  if (!isUuid(pinId)) return [...pins];
  const id = normalizeSessionId(pinId);
  return pins.filter((pin) => pin.id !== id);
}

export function isPinOwner(
  pin: Pick<CanvasPin, "pinnedBySessionId">,
  sessionId: string | null | undefined,
): boolean {
  if (!sessionId || !isUuid(sessionId)) return false;
  return pin.pinnedBySessionId === normalizeSessionId(sessionId);
}

/**
 * After UNPIN: live copy restores only while event remains LIVE (<10m).
 * Pure helper for tests / documentation of restoration rule.
 */
export function shouldRestoreLiveAfterUnpin(
  occurredAtIso: string,
  nowMs: number,
  liveMaxAgeMs: number = LIVE_OBJECT_MAX_AGE_MS,
): boolean {
  return isEventLiveForPin(occurredAtIso, nowMs, liveMaxAgeMs);
}

export function pinnedEventIdSet(
  pins: readonly CanvasPin[],
  nowMs: number = Date.now(),
): Set<string> {
  const set = new Set<string>();
  for (const pin of pruneExpiredPins(pins, nowMs)) {
    set.add(pin.eventId);
  }
  return set;
}

export function suppressLiveEventsWhenPinned(
  events: readonly PublicEvent[],
  pinnedEventIds: ReadonlySet<string>,
): PublicEvent[] {
  if (pinnedEventIds.size === 0) return [...events];
  return events.filter((event) => !pinnedEventIds.has(event.id));
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Date.parse(value))
  );
}

function normalizePublicEventSnapshot(raw: unknown): PublicEvent | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.id)) return null;
  if (record.type !== PIN_ELIGIBLE_EVENT_TYPE) return null;
  if (typeof record.tokenAddress !== "string") return null;
  if (
    typeof record.newBuyers !== "number" ||
    !Number.isFinite(record.newBuyers) ||
    record.newBuyers < 1
  ) {
    return null;
  }
  if (!isIsoTimestamp(record.occurredAt)) return null;
  if (
    typeof record.triggerBlockNumber !== "number" ||
    !Number.isFinite(record.triggerBlockNumber)
  ) {
    return null;
  }
  const tx =
    record.triggerTxHash === null || typeof record.triggerTxHash === "string"
      ? record.triggerTxHash
      : null;

  return {
    id: normalizeSessionId(record.id),
    type: PIN_ELIGIBLE_EVENT_TYPE,
    tokenAddress: record.tokenAddress,
    newBuyers: Math.trunc(record.newBuyers),
    occurredAt: record.occurredAt,
    triggerBlockNumber: Math.trunc(record.triggerBlockNumber),
    triggerTxHash: tx,
  };
}

export function normalizeCanvasPin(raw: unknown): CanvasPin | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.id)) return null;
  if (!isUuid(record.eventId)) return null;
  if (!isUuid(record.pinnedBySessionId)) return null;

  const chainId =
    typeof record.chainId === "number" ? record.chainId : Number(record.chainId);
  if (chainId !== CHAIN_ID) return null;

  const nameResult = validateDisplayName(record.pinnedByDisplayName);
  if (!nameResult.ok) return null;
  if (!isParticipationColour(record.pinnedByColour)) return null;

  if (!isIsoTimestamp(record.createdAt)) return null;
  if (!isIsoTimestamp(record.expiresAt)) return null;

  const event = normalizePublicEventSnapshot(record.event);
  if (!event) return null;
  if (event.id !== normalizeSessionId(record.eventId)) return null;

  const occurredMs = Date.parse(event.occurredAt);
  const expiresMs = Date.parse(record.expiresAt);
  if (expiresMs !== occurredMs + PIN_TTL_MS) {
    // Allow small drift only if equal within same second representation —
    // require exact TTL from helpers for trusted DTOs.
    if (expiresMs - occurredMs !== PIN_TTL_MS) return null;
  }

  return {
    id: normalizeSessionId(record.id),
    chainId: CHAIN_ID,
    eventId: normalizeSessionId(record.eventId),
    pinnedBySessionId: normalizeSessionId(record.pinnedBySessionId),
    pinnedByDisplayName: nameResult.name,
    pinnedByColour: record.pinnedByColour,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    event,
  };
}

/** Map postgres pin row (snake_case + snapshot cols) → CanvasPin. */
export function canvasPinFromRow(raw: unknown): CanvasPin | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  return normalizeCanvasPin({
    id: row.id,
    chainId: row.chain_id,
    eventId: row.event_id,
    pinnedBySessionId: row.pinned_by_session_id,
    pinnedByDisplayName: row.pinned_by_display_name,
    pinnedByColour: row.pinned_by_colour,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    event: {
      id: row.event_id,
      type: PIN_ELIGIBLE_EVENT_TYPE,
      tokenAddress: row.token_address,
      newBuyers: row.new_buyers,
      occurredAt: row.event_occurred_at,
      triggerBlockNumber: row.trigger_block_number,
      triggerTxHash: row.trigger_tx_hash ?? null,
    },
  });
}

export type ParsedCreatePin =
  | {
      ok: true;
      eventId: string;
      participationSessionId: string;
      displayName: string;
      colour: ParticipationColour;
    }
  | { ok: false; error: string };

export function parseCreatePinInput(body: unknown): ParsedCreatePin {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const record = body as Record<string, unknown>;

  if (!isUuid(record.eventId)) {
    return { ok: false, error: "invalid_event" };
  }
  if (!isUuid(record.participationSessionId)) {
    return { ok: false, error: "invalid_session" };
  }
  const nameResult = validateDisplayName(record.displayName);
  if (!nameResult.ok) {
    return { ok: false, error: "invalid_display_name" };
  }
  if (!isParticipationColour(record.colour)) {
    return { ok: false, error: "invalid_colour" };
  }

  return {
    ok: true,
    eventId: normalizeSessionId(record.eventId),
    participationSessionId: normalizeSessionId(record.participationSessionId),
    displayName: nameResult.name,
    colour: record.colour,
  };
}

export type ParsedUnpinPin =
  | {
      ok: true;
      pinId: string;
      participationSessionId: string;
    }
  | { ok: false; error: string };

export function parseUnpinPinInput(body: unknown): ParsedUnpinPin {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const record = body as Record<string, unknown>;
  if (!isUuid(record.pinId)) {
    return { ok: false, error: "invalid_pin" };
  }
  if (!isUuid(record.participationSessionId)) {
    return { ok: false, error: "invalid_session" };
  }
  return {
    ok: true,
    pinId: normalizeSessionId(record.pinId),
    participationSessionId: normalizeSessionId(record.participationSessionId),
  };
}

export function playhtmlPinnedElementId(pinId: string): string {
  return `4663-pinned-${pinId}`;
}
