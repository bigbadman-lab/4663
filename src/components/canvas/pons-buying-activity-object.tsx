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
import { PonsPinControl } from "@/components/social/pons-pin-control";
import { PonsWatchControl } from "@/components/social/pons-watch-control";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { playhtmlEventElementId } from "@/lib/canvas/hero";
import type { CanvasSlot } from "@/lib/canvas/slots";
import type { PublicEvent } from "@/lib/events/types";

export type PonsBuyingActivityObjectProps = {
  event: PublicEvent;
  slot: CanvasSlot;
  /**
   * When true, isolate nested interactive controls from parent move-start
   * (PlayHTML CanMoveElement on an ancestor). IC3.6 controls self-protect;
   * this flag remains for call-site/tests compatibility.
   */
  isolateAddressPointer?: boolean;
  movableChrome?: boolean;
  /** Social 7 — PIN affordance for named participants on live objects. */
  pinEnabled?: boolean;
  isPinned?: boolean;
  onPin?: (
    eventId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/** Inner card content only — no positioned host. */
export function PonsBuyingActivityContent({
  event,
  isolateAddressPointer: _isolateAddressPointer = false,
  pinEnabled = false,
  isPinned = false,
  onPin,
}: {
  event: PublicEvent;
  isolateAddressPointer?: boolean;
  pinEnabled?: boolean;
  isPinned?: boolean;
  onPin?: (
    eventId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
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
      />
      <PonsWatchControl eventId={event.id} />
      {pinEnabled && onPin ? (
        <PonsPinControl
          eventId={event.id}
          isPinned={isPinned}
          onPin={onPin}
        />
      ) : null}
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
  pinEnabled = false,
  isPinned = false,
  onPin,
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
        pinEnabled={pinEnabled}
        isPinned={isPinned}
        onPin={onPin}
      />
    </div>
  );
}
