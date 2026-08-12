"use client";

/**
 * Invisible client island: mounts the public events Realtime stream.
 * Does not render event objects (Stage 10).
 */

import { usePublicEvents } from "@/lib/events/use-public-events";

export function PublicEventsStream() {
  usePublicEvents();
  return null;
}
