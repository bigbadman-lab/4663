"use client";

/**
 * Temporary summoned/recalled PONS layer. Does not own the event stream.
 */

import { SummonedPonsObject } from "@/components/canvas/summoned-pons-object";
import type { CanvasSlot } from "@/lib/canvas/slots";
import type { PublicEvent } from "@/lib/events/types";

export type SummonLayerItem = {
  event: PublicEvent;
  slot: CanvasSlot;
};

export type SummonLayerProps = {
  summonId: string;
  items: readonly SummonLayerItem[];
};

export function SummonLayer({ summonId, items }: SummonLayerProps) {
  if (items.length === 0) return null;

  return (
    <div className="absolute inset-0" data-4663-summon-layer>
      {items.map(({ event, slot }) => (
        <SummonedPonsObject
          key={`${summonId}:${event.id}`}
          event={event}
          slot={slot}
          summonId={summonId}
        />
      ))}
    </div>
  );
}
