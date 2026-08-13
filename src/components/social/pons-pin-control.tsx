"use client";

/**
 * Minimal PIN control for normal live PONS objects.
 * Named: pin once. Anonymous: no control (may still see PINNED objects).
 */

import { useState } from "react";
import { useParticipation } from "@/lib/social/use-participation";

export type PonsPinControlProps = {
  eventId: string;
  isPinned: boolean;
  onPin: (eventId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  stopMoveStart?: (event: { stopPropagation(): void }) => void;
};

export function PonsPinControl({
  eventId,
  isPinned,
  onPin,
  stopMoveStart,
}: PonsPinControlProps) {
  const { isParticipating } = useParticipation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isParticipating) {
    return null;
  }

  if (isPinned) {
    return (
      <p
        className="mt-1 font-mono text-[10px] tracking-wide text-neutral-400"
        data-4663-pons-pin
        data-4663-pons-pin-state="pinned"
      >
        [ PINNED ]
      </p>
    );
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        disabled={busy}
        className="font-mono text-[10px] tracking-wide text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-50"
        data-4663-pons-pin
        data-4663-pons-pin-state="available"
        aria-label="Pin event"
        onPointerDown={(event) => {
          stopMoveStart?.(event);
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (busy) return;
          setBusy(true);
          setError(null);
          void onPin(eventId).then((result) => {
            if (!result.ok) {
              setError(result.error);
              setBusy(false);
            }
          });
        }}
      >
        [ PIN ]
      </button>
      {error ? (
        <p
          className="mt-0.5 font-mono text-[10px] text-rose-600"
          role="alert"
          data-4663-pons-pin-error
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
