"use client";

/**
 * Movable recalled/historical PONS object for SUMMON.
 * Separate PlayHTML identity from live `4663-event-*` objects.
 */

import { CanMoveElement } from "@playhtml/react";
import { useState } from "react";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { formatShortAddress } from "@/lib/canvas/format-address";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import type { CanvasSlot } from "@/lib/canvas/slots";
import { playhtmlSummonedElementId } from "@/lib/canvas/summon";
import type { PublicEvent } from "@/lib/events/types";

export type SummonedPonsObjectProps = {
  event: PublicEvent;
  slot: CanvasSlot;
  summonId: string;
};

function stopMoveStart(event: { stopPropagation(): void }): void {
  event.stopPropagation();
}

export function SummonedPonsObject({
  event,
  slot,
  summonId,
}: SummonedPonsObjectProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    const ok = await copyTextQuiet(event.tokenAddress);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlSummonedElementId(summonId, event.id)}
        className="absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
        style={{ left: `${slot.leftPct}%`, top: `${slot.topPct}%` }}
        data-4663-summoned-event={event.id}
        data-4663-summon-id={summonId}
        data-4663-slot={slot.id}
      >
        <article className="-translate-x-1/2 -translate-y-1/2 max-w-[11.5rem] border border-neutral-300 bg-white px-2.5 py-2 font-mono text-[11px] leading-snug text-neutral-700 transition-opacity duration-200 sm:max-w-[13rem]">
          <p className="mb-1 text-[10px] tracking-wide text-neutral-400">
            earlier
          </p>
          <p className="text-neutral-800">
            {event.newBuyers} new wallets bought this token
          </p>
          <button
            type="button"
            onClick={() => {
              void onCopy();
            }}
            onPointerDown={stopMoveStart}
            onMouseDown={stopMoveStart}
            onTouchStart={stopMoveStart}
            className="mt-1.5 block w-full cursor-pointer touch-manipulation text-left text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
            aria-label={`Copy token address ${event.tokenAddress}`}
            data-4663-event-address
          >
            {formatShortAddress(event.tokenAddress)}
          </button>
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
