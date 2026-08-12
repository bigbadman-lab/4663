"use client";

/**
 * Compact live PONS buying-activity object (presentational).
 * Slot % is CSS origin; optical centering lives on the inner article.
 *
 * Outer host owns position / z-index / PlayHTML id.
 * Inner content is shared with MovablePonsBuyingActivityObject so CanMoveElement
 * can wrap a direct DOM host without a duplicate wrapper.
 */

import { useState } from "react";
import { PonsActivityCopy } from "@/components/canvas/pons-activity-copy";
import { PonsAddressCopyControl } from "@/components/canvas/pons-address-copy-control";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
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

/** Inner card content only — no positioned host. */
export function PonsBuyingActivityContent({
  event,
  isolateAddressPointer = false,
}: {
  event: PublicEvent;
  isolateAddressPointer?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    const ok = await copyTextQuiet(event.tokenAddress);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article className="-translate-x-1/2 -translate-y-1/2 max-w-[11.5rem] border border-neutral-300 bg-white px-2.5 py-2 font-mono leading-snug transition-opacity duration-200 sm:max-w-[13rem]">
      <PonsActivityCopy newBuyers={event.newBuyers} />
      <PonsAddressCopyControl
        tokenAddress={event.tokenAddress}
        onCopy={() => {
          void onCopy();
        }}
        stopMoveStart={isolateAddressPointer ? stopMoveStart : undefined}
      />
      {copied ? (
        <p className="mt-1 text-[10px] tracking-wide text-neutral-400">
          copied
        </p>
      ) : null}
    </article>
  );
}

/** Positioned host class for static (non-PlayHTML) and movable shells. */
export function ponsBuyingActivityHostClassName(movableChrome: boolean): string {
  return movableChrome
    ? "pointer-events-auto absolute z-[15] cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "absolute z-[15] select-none";
}

export function PonsBuyingActivityObject({
  event,
  slot,
  isolateAddressPointer = false,
  movableChrome = false,
}: PonsBuyingActivityObjectProps) {
  return (
    <div
      id={playhtmlEventElementId(event.id)}
      className={ponsBuyingActivityHostClassName(movableChrome)}
      style={{ left: `${slot.leftPct}%`, top: `${slot.topPct}%` }}
      data-4663-live-event={event.id}
      data-4663-slot={slot.id}
    >
      <PonsBuyingActivityContent
        event={event}
        isolateAddressPointer={isolateAddressPointer}
      />
    </div>
  );
}
