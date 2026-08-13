"use client";

/**
 * Social 7 — movable PINNED PONS representation (durable until event+24h).
 * CanMoveElement requires a direct DOM host child.
 */

import { CanMoveElement } from "@playhtml/react";
import { useState } from "react";
import { PonsActivityCopy } from "@/components/canvas/pons-activity-copy";
import { PonsAddressCopyControl } from "@/components/canvas/pons-address-copy-control";
import { PonsWatchControl } from "@/components/social/pons-watch-control";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import type { CanvasSlot } from "@/lib/canvas/slots";
import {
  playhtmlPinnedElementId,
  type CanvasPin,
} from "@/lib/social/canvas-pin";

export type PinnedPonsObjectProps = {
  pin: CanvasPin;
  slot: CanvasSlot;
};

function stopMoveStart(event: { stopPropagation(): void }): void {
  event.stopPropagation();
}

export function PinnedPonsObject({ pin, slot }: PinnedPonsObjectProps) {
  const [copied, setCopied] = useState(false);
  const event = pin.event;

  async function onCopy(): Promise<void> {
    const ok = await copyTextQuiet(event.tokenAddress);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlPinnedElementId(pin.id)}
        className="pointer-events-auto absolute z-[15] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={{ left: `${slot.leftPct}%`, top: `${slot.topPct}%` }}
        data-4663-pinned-event={event.id}
        data-4663-pin-id={pin.id}
        data-4663-slot={slot.id}
      >
        <article className="-translate-x-1/2 -translate-y-1/2 max-w-[11.5rem] border border-neutral-400 bg-white px-2.5 py-2 font-mono leading-snug sm:max-w-[13rem]">
          <p
            className="mb-1 font-mono text-[10px] tracking-wide text-neutral-400"
            data-4663-pinned-label
          >
            [ PINNED ]
          </p>
          <PonsActivityCopy newBuyers={event.newBuyers} />
          <PonsAddressCopyControl
            tokenAddress={event.tokenAddress}
            onCopy={() => {
              void onCopy();
            }}
            stopMoveStart={stopMoveStart}
          />
          <PonsWatchControl eventId={event.id} stopMoveStart={stopMoveStart} />
          {copied ? (
            <p className="mt-1 text-[10px] tracking-wide text-neutral-400">
              copied
            </p>
          ) : null}
        </article>
      </div>
    </CanMoveElement>
  );
}
