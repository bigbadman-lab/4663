"use client";

/**
 * Social 7 — full-bleed pinned PONS layer (pointer-events-none wrapper).
 */

import { PinnedPonsObject } from "@/components/canvas/pinned-pons-object";
import type { CanvasSlot } from "@/lib/canvas/slots";
import type { CanvasPin } from "@/lib/social/canvas-pin";

export type PinnedLayerItem = {
  pin: CanvasPin;
  slot: CanvasSlot;
};

export type PinnedPonsLayerProps = {
  items: readonly PinnedLayerItem[];
};

export function PinnedPonsLayer({ items }: PinnedPonsLayerProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[15]"
      data-4663-pinned-layer
    >
      {items.map((item) => (
        <PinnedPonsObject
          key={item.pin.id}
          pin={item.pin}
          slot={item.slot}
        />
      ))}
    </div>
  );
}
