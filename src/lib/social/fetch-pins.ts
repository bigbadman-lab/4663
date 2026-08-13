/**
 * Browser fetch helpers for Social 7 PIN API.
 */

import {
  PINS_API_PATH,
  normalizeCanvasPin,
  type CanvasPin,
} from "@/lib/social/canvas-pin";

export async function fetchActiveCanvasPins(
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<CanvasPin[]> {
  const res = await fetchFn(PINS_API_PATH, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(`pins GET HTTP ${res.status}`);
  }

  const body: unknown = await res.json();
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Array.isArray((body as { pins?: unknown }).pins)
  ) {
    throw new Error("pins GET malformed");
  }

  const pins: CanvasPin[] = [];
  for (const item of (body as { pins: unknown[] }).pins) {
    const pin = normalizeCanvasPin(item);
    if (pin) pins.push(pin);
  }
  return pins;
}

export type PostCanvasPinInput = {
  eventId: string;
  participationSessionId: string;
  displayName: string;
  colour: string;
};

export type PostCanvasPinResult =
  | { ok: true; pin: CanvasPin }
  | { ok: false; error: string; status: number };

export async function postCanvasPin(
  input: PostCanvasPinInput,
  fetchFn: typeof fetch = fetch,
): Promise<PostCanvasPinResult> {
  const res = await fetchFn(PINS_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "invalid_response", status: res.status };
  }

  if (res.status === 201 || res.ok) {
    const pin = normalizeCanvasPin(
      payload !== null &&
        typeof payload === "object" &&
        !Array.isArray(payload)
        ? (payload as { pin?: unknown }).pin
        : null,
    );
    if (!pin) {
      return { ok: false, error: "invalid_response", status: res.status };
    }
    return { ok: true, pin };
  }

  const error =
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as { error?: unknown }).error === "string"
      ? (payload as { error: string }).error
      : "create_failed";

  return { ok: false, error, status: res.status };
}
