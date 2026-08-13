"use client";

/**
 * Prunes local WATCH ids that are no longer on the live canvas.
 */

import { useEffect } from "react";
import { useParticipation } from "@/lib/social/use-participation";

export function WatchLiveEventPruner({
  eventIds,
}: {
  eventIds: readonly string[];
}) {
  const { isParticipating, pruneWatchedEvents } = useParticipation();

  useEffect(() => {
    if (!isParticipating) return;
    pruneWatchedEvents(eventIds);
  }, [eventIds, isParticipating, pruneWatchedEvents]);

  return null;
}
