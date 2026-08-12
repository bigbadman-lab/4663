/**
 * Browser fetch of GET /api/events/recent for stream initial/recovery load.
 */

import { validatePublicEventDto } from "@/lib/events/normalize";
import type { PublicEvent } from "@/lib/events/types";

export const PUBLIC_EVENTS_RECENT_PATH = "/api/events/recent" as const;
export const PUBLIC_EVENTS_RECENT_LIMIT = 50 as const;

export async function fetchRecentPublicEvents(
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<PublicEvent[]> {
  const res = await fetchFn(
    `${PUBLIC_EVENTS_RECENT_PATH}?limit=${PUBLIC_EVENTS_RECENT_LIMIT}`,
    {
      method: "GET",
      cache: "no-store",
      signal,
    },
  );
  if (!res.ok) {
    throw new Error(`events recent HTTP ${res.status}`);
  }

  const body: unknown = await res.json();
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Array.isArray((body as { events?: unknown }).events)
  ) {
    throw new Error("events recent malformed");
  }

  const events: PublicEvent[] = [];
  for (const item of (body as { events: unknown[] }).events) {
    const dto = validatePublicEventDto(item);
    if (dto) events.push(dto);
  }
  return events;
}
