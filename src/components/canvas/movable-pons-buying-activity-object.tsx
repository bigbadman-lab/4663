"use client";

/**
 * PlayHTML-movable wrapper for live PONS objects.
 * Import only under PlayProvider (never from the SSR/fallback shell).
 */

import { CanMoveElement } from "@playhtml/react";
import { PonsBuyingActivityObject } from "@/components/canvas/pons-buying-activity-object";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import type { CanvasSlot } from "@/lib/canvas/slots";
import type { PublicEvent } from "@/lib/events/types";

export type MovablePonsBuyingActivityObjectProps = {
  event: PublicEvent;
  slot: CanvasSlot;
};

export function MovablePonsBuyingActivityObject({
  event,
  slot,
}: MovablePonsBuyingActivityObjectProps) {
  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <PonsBuyingActivityObject
        event={event}
        slot={slot}
        isolateAddressPointer
        movableChrome
      />
    </CanMoveElement>
  );
}
