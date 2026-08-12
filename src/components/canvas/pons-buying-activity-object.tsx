"use client";

/**
 * Compact live PONS buying-activity object on the canvas.
 */

import { useState } from "react";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { formatShortAddress } from "@/lib/canvas/format-address";
import type { CanvasSlot } from "@/lib/canvas/slots";
import type { PublicEvent } from "@/lib/events/types";

export type PonsBuyingActivityObjectProps = {
  event: PublicEvent;
  slot: CanvasSlot;
};

export function PonsBuyingActivityObject({
  event,
  slot,
}: PonsBuyingActivityObjectProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    const ok = await copyTextQuiet(event.tokenAddress);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article
      className="absolute max-w-[11.5rem] -translate-x-1/2 -translate-y-1/2 border border-neutral-300 bg-white px-2.5 py-2 font-mono text-[11px] leading-snug text-neutral-700 transition-opacity duration-200 sm:max-w-[13rem]"
      style={{ left: `${slot.leftPct}%`, top: `${slot.topPct}%` }}
      data-4663-live-event={event.id}
      data-4663-slot={slot.id}
    >
      <p className="text-neutral-800">
        {event.newBuyers} new wallets bought this token
      </p>
      <button
        type="button"
        onClick={() => {
          void onCopy();
        }}
        className="mt-1.5 block w-full cursor-pointer touch-manipulation text-left text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
        aria-label={`Copy token address ${event.tokenAddress}`}
      >
        {formatShortAddress(event.tokenAddress)}
      </button>
      {copied ? (
        <p className="mt-1 text-[10px] tracking-wide text-neutral-400">copied</p>
      ) : null}
    </article>
  );
}
