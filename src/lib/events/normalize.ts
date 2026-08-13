/**
 * Row → public DTO normalization for events.
 * Malformed rows are discarded (fail closed for the product surface).
 */

import {
  PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
  PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY,
  type PublicEvent,
  type SummonHistoryEvent,
} from "@/lib/events/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const TX_HASH_RE = /^0x[0-9a-f]{64}$/;
const BIGINT_MAX = BigInt("9223372036854775807");

/** Raw events row fields used for public normalization (+ payload for prod gate). */
export type EventsRow = {
  id?: unknown;
  event_type?: unknown;
  token_address?: unknown;
  new_buyers?: unknown;
  occurred_at?: unknown;
  trigger_block_number?: unknown;
  trigger_tx_hash?: unknown;
  payload?: unknown;
};

function asNonNegInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0 && Math.trunc(n) === n) {
      return Math.trunc(n);
    }
  }
  return null;
}

function asPositiveInt(value: unknown): number | null {
  const n = asNonNegInt(value);
  if (n === null || n < 1) return null;
  return n;
}

/**
 * Mirror of SQL safe_event_launch_block intent for service-role post-filter.
 * Returns null for missing/malformed/out-of-range values; never throws.
 */
export function safeLaunchBlockFromPayload(payload: unknown): bigint | null {
  if (payload === null || payload === undefined) return null;
  if (typeof payload !== "object" || Array.isArray(payload)) return null;

  const raw = (payload as Record<string, unknown>).launch_block_number;
  let text: string | null = null;

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) return null;
    text = String(raw);
  } else if (typeof raw === "string") {
    text = raw;
  } else {
    return null;
  }

  if (text === "" || !/^[0-9]+$/.test(text)) return null;

  try {
    const block = BigInt(text);
    if (block > BIGINT_MAX) return null;
    return block;
  } catch {
    return null;
  }
}

export function isProductionLaunchBlock(
  payload: unknown,
  productionStartBlock: bigint,
): boolean {
  const launch = safeLaunchBlockFromPayload(payload);
  return launch !== null && launch > productionStartBlock;
}

function toIsoOccurredAt(value: unknown): string | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) return null;
    return value.toISOString();
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeTriggerTxHash(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined; // malformed → discard row
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return null;
  if (!TX_HASH_RE.test(normalized)) return undefined;
  return normalized;
}

function normalizeEventFields(
  r: EventsRow,
  expectedType:
    | typeof PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY
    | typeof PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
): PublicEvent | null {
  if (typeof r.id !== "string" || !UUID_RE.test(r.id.trim())) return null;
  const id = r.id.trim().toLowerCase();

  if (r.event_type !== expectedType) return null;

  if (typeof r.token_address !== "string") return null;
  const tokenAddress = r.token_address.trim().toLowerCase();
  if (!ADDRESS_RE.test(tokenAddress)) return null;

  const newBuyers = asPositiveInt(r.new_buyers);
  if (newBuyers === null) return null;

  const occurredAt = toIsoOccurredAt(r.occurred_at);
  if (occurredAt === null) return null;

  const triggerBlockNumber = asNonNegInt(r.trigger_block_number);
  if (triggerBlockNumber === null) return null;

  const triggerTxHash = normalizeTriggerTxHash(r.trigger_tx_hash);
  if (triggerTxHash === undefined) return null;

  return {
    id,
    type: expectedType,
    tokenAddress,
    newBuyers,
    occurredAt,
    triggerBlockNumber,
    triggerTxHash,
  };
}

/**
 * Normalize a DB events row into the live public contract (buying activity only).
 */
export function normalizePublicEvent(row: unknown): PublicEvent | null {
  if (row === null || row === undefined) return null;
  if (typeof row !== "object" || Array.isArray(row)) return null;
  return normalizeEventFields(
    row as EventsRow,
    PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY,
  );
}

/**
 * Normalize a DB events row into a Summon history DTO (continuation only).
 */
export function normalizeSummonHistoryEvent(
  row: unknown,
): SummonHistoryEvent | null {
  if (row === null || row === undefined) return null;
  if (typeof row !== "object" || Array.isArray(row)) return null;
  const dto = normalizeEventFields(
    row as EventsRow,
    PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
  );
  return dto as SummonHistoryEvent | null;
}

/**
 * Validate an already-public API DTO (camelCase). Fail closed on malformation.
 */
export function validatePublicEventDto(value: unknown): PublicEvent | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const r = value as Record<string, unknown>;

  if (typeof r.id !== "string" || !UUID_RE.test(r.id.trim())) return null;
  const id = r.id.trim().toLowerCase();

  if (r.type !== PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY) return null;

  if (typeof r.tokenAddress !== "string") return null;
  const tokenAddress = r.tokenAddress.trim().toLowerCase();
  if (!ADDRESS_RE.test(tokenAddress)) return null;

  const newBuyers = asPositiveInt(r.newBuyers);
  if (newBuyers === null) return null;

  const occurredAt = toIsoOccurredAt(r.occurredAt);
  if (occurredAt === null) return null;

  const triggerBlockNumber = asNonNegInt(r.triggerBlockNumber);
  if (triggerBlockNumber === null) return null;

  const triggerTxHash = normalizeTriggerTxHash(r.triggerTxHash);
  if (triggerTxHash === undefined) return null;

  return {
    id,
    type: PUBLIC_EVENT_TYPE_PONS_BUYING_ACTIVITY,
    tokenAddress,
    newBuyers,
    occurredAt,
    triggerBlockNumber,
    triggerTxHash,
  };
}

/**
 * Validate a Summon history API DTO (continuation only). Fail closed.
 */
export function validateSummonHistoryEventDto(
  value: unknown,
): SummonHistoryEvent | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const r = value as Record<string, unknown>;

  if (typeof r.id !== "string" || !UUID_RE.test(r.id.trim())) return null;
  const id = r.id.trim().toLowerCase();

  if (r.type !== PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION) return null;

  if (typeof r.tokenAddress !== "string") return null;
  const tokenAddress = r.tokenAddress.trim().toLowerCase();
  if (!ADDRESS_RE.test(tokenAddress)) return null;

  const newBuyers = asPositiveInt(r.newBuyers);
  if (newBuyers === null) return null;

  const occurredAt = toIsoOccurredAt(r.occurredAt);
  if (occurredAt === null) return null;

  const triggerBlockNumber = asNonNegInt(r.triggerBlockNumber);
  if (triggerBlockNumber === null) return null;

  const triggerTxHash = normalizeTriggerTxHash(r.triggerTxHash);
  if (triggerTxHash === undefined) return null;

  return {
    id,
    type: PUBLIC_EVENT_TYPE_PONS_BUYER_CONTINUATION,
    tokenAddress,
    newBuyers,
    occurredAt,
    triggerBlockNumber,
    triggerTxHash,
  };
}
