"use client";

/**
 * Social 7 — movable PINNED PONS representation (durable until event+24h).
 * Social 7.1 — owner-only [ UNPIN ].
 * CanMoveElement requires a direct DOM host child.
 * IC3.6 — nested interactive controls use shared capture protection.
 */

import { CanMoveElement } from "@playhtml/react";
import { useState } from "react";
import { PonsActivityCopy } from "@/components/canvas/pons-activity-copy";
import { PonsAddressCopyControl } from "@/components/canvas/pons-address-copy-control";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { PonsWatchControl } from "@/components/social/pons-watch-control";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import type { CanvasSlot } from "@/lib/canvas/slots";
import {
  isPinOwner,
  playhtmlPinnedElementId,
  type CanvasPin,
} from "@/lib/social/canvas-pin";
import { useParticipation } from "@/lib/social/use-participation";

export type PinnedPonsObjectProps = {
  pin: CanvasPin;
  slot: CanvasSlot;
  onUnpin?: (
    pinId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function PinnedUnpinButton({
  pinId,
  onUnpin,
}: {
  pinId: string;
  onUnpin: (
    pinId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-1">
      <button
        ref={ref}
        type="button"
        disabled={busy}
        className="touch-manipulation font-mono text-[10px] tracking-wide text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-50"
        data-4663-pons-unpin
        aria-label="Unpin event"
        onPointerDown={stopPlayhtmlMoveStart}
        onMouseDown={stopPlayhtmlMoveStart}
        onTouchStart={stopPlayhtmlMoveStart}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          if (busy) return;
          setBusy(true);
          setError(null);
          void onUnpin(pinId).then((result) => {
            if (!result.ok) {
              setError(result.error);
              setBusy(false);
            }
          });
        }}
      >
        [ UNPIN ]
      </button>
      {error ? (
        <p
          className="mt-0.5 font-mono text-[10px] text-rose-600"
          role="alert"
          data-4663-pons-unpin-error
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PinnedPonsObject({
  pin,
  slot,
  onUnpin,
}: PinnedPonsObjectProps) {
  const { self } = useParticipation();
  const [copied, setCopied] = useState(false);
  const event = pin.event;
  const canUnpin = !!self && isPinOwner(pin, self.sessionId) && !!onUnpin;

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
          />
          <PonsWatchControl eventId={event.id} />
          {canUnpin && onUnpin ? (
            <PinnedUnpinButton pinId={pin.id} onUnpin={onUnpin} />
          ) : null}
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
