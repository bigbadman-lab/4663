"use client";

/**
 * PlayHTML-movable live event layer. Mount only under PlayProvider.
 */

import { MovablePonsBuyingActivityObject } from "@/components/canvas/movable-pons-buying-activity-object";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";

export type MovableLiveEventLayerProps = {
  items: readonly SlottedLiveEvent[];
};

export function MovableLiveEventLayer({ items }: MovableLiveEventLayerProps) {
  if (items.length === 0) return null;

  return (
    <div className="absolute inset-0" data-4663-live-event-layer>
      {items.map(({ event, slot }) => (
        <MovablePonsBuyingActivityObject
          key={event.id}
          event={event}
          slot={slot}
        />
      ))}
    </div>
  );
}
