"use client";

/**
 * Movable recalled/historical PONS object for SUMMON.
 * Separate PlayHTML identity from live `4663-event-*` objects.
 */

import { CanMoveElement, usePlayContext } from "@playhtml/react";
import { useState } from "react";
import { PonsActivityCopy } from "@/components/canvas/pons-activity-copy";
import { PonsAddressCopyControl } from "@/components/canvas/pons-address-copy-control";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
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
  const { isLoading, isProviderMissing } = usePlayContext();
  const [copied, setCopied] = useState(false);
  const movable = !isLoading && !isProviderMissing;

  async function onCopy(): Promise<void> {
    const ok = await copyTextQuiet(event.tokenAddress);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const node = (
    <div
      id={playhtmlSummonedElementId(summonId, event.id)}
      className={
        movable
          ? "absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
          : "absolute z-[16] select-none"
      }
      style={{ left: `${slot.leftPct}%`, top: `${slot.topPct}%` }}
      data-4663-summoned-event={event.id}
      data-4663-summon-id={summonId}
      data-4663-slot={slot.id}
    >
      <article className="-translate-x-1/2 -translate-y-1/2 max-w-[11.5rem] border border-neutral-300 bg-white px-2.5 py-2 font-mono leading-snug transition-opacity duration-200 sm:max-w-[13rem]">
        <PonsActivityCopy newBuyers={event.newBuyers} earlierLabel />
        <PonsAddressCopyControl
          tokenAddress={event.tokenAddress}
          onCopy={() => {
            void onCopy();
          }}
          stopMoveStart={movable ? stopMoveStart : undefined}
        />
        {copied ? (
          <p className="mt-1 text-[10px] tracking-wide text-neutral-400">
            copied
          </p>
        ) : null}
      </article>
    </div>
  );

  if (!movable) return node;

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>{node}</CanMoveElement>
  );
}
