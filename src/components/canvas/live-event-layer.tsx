"use client";

/**
 * Static slotted live PONS objects. Safe for pre-PlayHTML fallback shell.
 */

import { PonsBuyingActivityObject } from "@/components/canvas/pons-buying-activity-object";
import type { SlottedLiveEvent } from "@/lib/canvas/slots";

export type LiveEventLayerProps = {
  items: readonly SlottedLiveEvent[];
};

export function LiveEventLayer({ items }: LiveEventLayerProps) {
  if (items.length === 0) return null;

  return (
    <div className="absolute inset-0" data-4663-live-event-layer>
      {items.map(({ event, slot }) => (
        <PonsBuyingActivityObject key={event.id} event={event} slot={slot} />
      ))}
    </div>
  );
}
