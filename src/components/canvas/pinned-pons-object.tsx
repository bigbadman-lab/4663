"use client";

/**
 * Social 7 — movable PINNED PONS representation (durable until event+24h).
 * Social 7.1 — owner-only [ UNPIN ].
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

function stopMoveStart(event: { stopPropagation(): void }): void {
  event.stopPropagation();
}

export function PinnedPonsObject({
  pin,
  slot,
  onUnpin,
}: PinnedPonsObjectProps) {
  const { self } = useParticipation();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            stopMoveStart={stopMoveStart}
          />
          <PonsWatchControl eventId={event.id} stopMoveStart={stopMoveStart} />
          {canUnpin ? (
            <div className="mt-1">
              <button
                type="button"
                disabled={busy}
                className="font-mono text-[10px] tracking-wide text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-50"
                data-4663-pons-unpin
                aria-label="Unpin event"
                onPointerDown={stopMoveStart}
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  if (busy || !onUnpin) return;
                  setBusy(true);
                  setError(null);
                  void onUnpin(pin.id).then((result) => {
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
