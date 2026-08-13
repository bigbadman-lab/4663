"use client";

/**
 * PlayHTML-movable live event layer. Mount only under PlayProvider.
 */

import { MovablePonsBuyingActivityObject } from "@/components/canvas/movable-pons-buying-activity-object";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";

export type MovableLiveEventLayerProps = {
  items: readonly SlottedLiveEvent[];
  isPinned?: (eventId: string) => boolean;
  onPin?: (
    eventId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function MovableLiveEventLayer({
  items,
  isPinned,
  onPin,
}: MovableLiveEventLayerProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-4663-live-event-layer
    >
      {items.map(({ event, slot }) => (
        <MovablePonsBuyingActivityObject
          key={event.id}
          event={event}
          slot={slot}
          pinEnabled={!!onPin}
          isPinned={isPinned?.(event.id) ?? false}
          onPin={onPin}
        />
      ))}
    </div>
  );
}
