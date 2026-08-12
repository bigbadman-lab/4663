"use client";

/**
 * PlayHTML-movable wrapper for live PONS objects.
 * Import only under PlayProvider (never from the SSR/fallback shell).
 *
 * CanMoveElement requires a direct DOM host child — do not pass a React
 * component as the sole child (PlayHTML walks props.children, not render output).
 */

import { CanMoveElement } from "@playhtml/react";
import {
  PonsBuyingActivityContent,
  ponsBuyingActivityHostClassName,
} from "@/components/canvas/pons-buying-activity-object";
import {
  PLAYHTML_CANVAS_BOUNDS_ID,
  playhtmlEventElementId,
} from "@/lib/canvas/hero";
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
      <div
        id={playhtmlEventElementId(event.id)}
        className={ponsBuyingActivityHostClassName(true)}
        style={{ left: `${slot.leftPct}%`, top: `${slot.topPct}%` }}
        data-4663-live-event={event.id}
        data-4663-slot={slot.id}
      >
        <PonsBuyingActivityContent event={event} isolateAddressPointer />
      </div>
    </CanMoveElement>
  );
}
