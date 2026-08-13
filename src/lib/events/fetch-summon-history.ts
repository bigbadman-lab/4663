/**
 * Browser fetch of GET /api/events/summon-history for Summon selection/recovery.
 */

import { validateSummonHistoryEventDto } from "@/lib/events/normalize";
import type { SummonHistoryEvent } from "@/lib/events/types";
import { SUMMON_MAX_EVENTS } from "@/lib/canvas/summon";

export const SUMMON_HISTORY_PATH = "/api/events/summon-history" as const;
/** Fetch a pool larger than one summon so thin history still fills the cap. */
export const SUMMON_HISTORY_FETCH_LIMIT = Math.max(
  20,
  SUMMON_MAX_EVENTS * 5,
) as number;

export async function fetchSummonHistoryEvents(
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<SummonHistoryEvent[]> {
  const res = await fetchFn(
    `${SUMMON_HISTORY_PATH}?limit=${SUMMON_HISTORY_FETCH_LIMIT}`,
    {
      method: "GET",
      cache: "no-store",
      signal,
    },
  );
  if (!res.ok) {
    throw new Error(`summon history HTTP ${res.status}`);
  }

  const body: unknown = await res.json();
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Array.isArray((body as { events?: unknown }).events)
  ) {
    throw new Error("summon history malformed");
  }

  const events: SummonHistoryEvent[] = [];
  for (const item of (body as { events: unknown[] }).events) {
    const dto = validateSummonHistoryEventDto(item);
    if (dto) events.push(dto);
  }
  return events;
}
