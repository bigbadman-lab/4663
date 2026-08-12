"use client";

/**
 * Compact live PONS buying-activity object (presentational).
 * Slot % is CSS origin; optical centering lives on the inner article.
 */

import { useState } from "react";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { formatShortAddress } from "@/lib/canvas/format-address";
import { playhtmlEventElementId } from "@/lib/canvas/hero";
import type { CanvasSlot } from "@/lib/canvas/slots";
import type { PublicEvent } from "@/lib/events/types";

export type PonsBuyingActivityObjectProps = {
  event: PublicEvent;
  slot: CanvasSlot;
  /**
   * When true, isolate the address control from parent move-start handlers
   * (PlayHTML CanMoveElement on an ancestor).
   */
  isolateAddressPointer?: boolean;
  movableChrome?: boolean;
};

function stopMoveStart(event: { stopPropagation(): void }): void {
  event.stopPropagation();
}

export function PonsBuyingActivityObject({
  event,
  slot,
  isolateAddressPointer = false,
  movableChrome = false,
}: PonsBuyingActivityObjectProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    const ok = await copyTextQuiet(event.tokenAddress);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div
      id={playhtmlEventElementId(event.id)}
      className={
        movableChrome
          ? "absolute z-[15] cursor-grab touch-manipulation select-none active:cursor-grabbing"
          : "absolute z-[15] select-none"
      }
      style={{ left: `${slot.leftPct}%`, top: `${slot.topPct}%` }}
      data-4663-live-event={event.id}
      data-4663-slot={slot.id}
    >
      <article className="-translate-x-1/2 -translate-y-1/2 max-w-[11.5rem] border border-neutral-300 bg-white px-2.5 py-2 font-mono text-[11px] leading-snug text-neutral-700 transition-opacity duration-200 sm:max-w-[13rem]">
        <p className="text-neutral-800">
          {event.newBuyers} new wallets bought this token
        </p>
        <button
          type="button"
          onClick={() => {
            void onCopy();
          }}
          onPointerDown={isolateAddressPointer ? stopMoveStart : undefined}
          onMouseDown={isolateAddressPointer ? stopMoveStart : undefined}
          onTouchStart={isolateAddressPointer ? stopMoveStart : undefined}
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
  );
}
