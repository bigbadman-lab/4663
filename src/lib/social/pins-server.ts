/**
 * Social 7 — server-side PIN load/create (service-role).
 */

import { LIVE_OBJECT_MAX_AGE_MS } from "@/lib/canvas/visible-events";
import { CHAIN_ID, EVENT_TYPE_PONS_BUYING_ACTIVITY } from "@/lib/pons/constants";
import type { PresenceSupabase } from "@/lib/presence/supabase-server";
import {
  CANVAS_PINS_TABLE,
  canvasPinFromRow,
  isEventLiveForPin,
  parseCreatePinInput,
  parseUnpinPinInput,
  pinExpiresAtFromOccurred,
  type CanvasPin,
} from "@/lib/social/canvas-pin";

export type LoadActivePinsResult =
  | { ok: true; pins: CanvasPin[] }
  | { ok: false; error: "pins_unavailable" };

const PIN_SELECT =
  "id, chain_id, event_id, pinned_by_session_id, pinned_by_display_name, pinned_by_colour, token_address, new_buyers, event_occurred_at, trigger_block_number, trigger_tx_hash, created_at, expires_at" as const;

export async function loadActiveCanvasPins(
  supabase: PresenceSupabase,
  now: Date = new Date(),
): Promise<LoadActivePinsResult> {
  const { data, error } = await supabase
    .from(CANVAS_PINS_TABLE)
    .select(PIN_SELECT)
    .eq("chain_id", CHAIN_ID)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, error: "pins_unavailable" };
  }

  const pins: CanvasPin[] = [];
  for (const row of data ?? []) {
    const pin = canvasPinFromRow(row);
    if (pin) pins.push(pin);
  }
  return { ok: true, pins };
}

export type CreateCanvasPinResult =
  | { ok: true; pin: CanvasPin; status: 201 }
  | { ok: false; error: string; status: number };

export async function createCanvasPin(
  supabase: PresenceSupabase,
  body: unknown,
  now: Date = new Date(),
): Promise<CreateCanvasPinResult> {
  const parsed = parseCreatePinInput(body);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 };
  }

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select(
      "id, chain_id, event_type, token_address, new_buyers, occurred_at, trigger_block_number, trigger_tx_hash",
    )
    .eq("id", parsed.eventId)
    .eq("chain_id", CHAIN_ID)
    .maybeSingle();

  if (eventError) {
    return { ok: false, error: "event_lookup_failed", status: 500 };
  }
  if (!eventRow) {
    return { ok: false, error: "event_not_found", status: 404 };
  }

  if (eventRow.event_type !== EVENT_TYPE_PONS_BUYING_ACTIVITY) {
    return { ok: false, error: "invalid_event_type", status: 400 };
  }

  const occurredAt =
    typeof eventRow.occurred_at === "string"
      ? eventRow.occurred_at
      : eventRow.occurred_at != null
        ? new Date(eventRow.occurred_at as string | number | Date).toISOString()
        : null;
  if (!occurredAt || !Number.isFinite(Date.parse(occurredAt))) {
    return { ok: false, error: "invalid_event", status: 400 };
  }

  if (!isEventLiveForPin(occurredAt, now.getTime(), LIVE_OBJECT_MAX_AGE_MS)) {
    return { ok: false, error: "not_live", status: 400 };
  }

  const occurredDate = new Date(occurredAt);
  const expiresAt = pinExpiresAtFromOccurred(occurredDate);

  const { data, error } = await supabase
    .from(CANVAS_PINS_TABLE)
    .insert({
      chain_id: CHAIN_ID,
      event_id: parsed.eventId,
      pinned_by_session_id: parsed.participationSessionId,
      pinned_by_display_name: parsed.displayName,
      pinned_by_colour: parsed.colour,
      token_address: eventRow.token_address,
      new_buyers: eventRow.new_buyers,
      event_occurred_at: occurredAt,
      trigger_block_number: eventRow.trigger_block_number,
      trigger_tx_hash: eventRow.trigger_tx_hash,
      expires_at: expiresAt.toISOString(),
    })
    .select(PIN_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "already_pinned", status: 409 };
    }
    return { ok: false, error: "insert_failed", status: 500 };
  }

  const pin = canvasPinFromRow(data);
  if (!pin) {
    return { ok: false, error: "insert_failed", status: 500 };
  }
  return { ok: true, pin, status: 201 };
}

export type DeleteCanvasPinResult =
  | { ok: true; status: 200; alreadyGone?: boolean }
  | { ok: false; error: string; status: number };

/**
 * Owner UNPIN — service-role delete after session ownership check.
 * Ownership: pinned_by_session_id === claimed participationSessionId.
 */
export async function deleteCanvasPin(
  supabase: PresenceSupabase,
  body: unknown,
): Promise<DeleteCanvasPinResult> {
  const parsed = parseUnpinPinInput(body);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 };
  }

  const { data: row, error: lookupError } = await supabase
    .from(CANVAS_PINS_TABLE)
    .select("id, chain_id, pinned_by_session_id")
    .eq("id", parsed.pinId)
    .eq("chain_id", CHAIN_ID)
    .maybeSingle();

  if (lookupError) {
    return { ok: false, error: "lookup_failed", status: 500 };
  }
  if (!row) {
    // Idempotent: already gone.
    return { ok: true, status: 200, alreadyGone: true };
  }

  const ownerId =
    typeof row.pinned_by_session_id === "string"
      ? row.pinned_by_session_id.trim().toLowerCase()
      : "";
  if (ownerId !== parsed.participationSessionId) {
    return { ok: false, error: "not_pin_owner", status: 403 };
  }

  const { error: deleteError } = await supabase
    .from(CANVAS_PINS_TABLE)
    .delete()
    .eq("id", parsed.pinId)
    .eq("chain_id", CHAIN_ID)
    .eq("pinned_by_session_id", parsed.participationSessionId);

  if (deleteError) {
    return { ok: false, error: "delete_failed", status: 500 };
  }

  return { ok: true, status: 200 };
}
