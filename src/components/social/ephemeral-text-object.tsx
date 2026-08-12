"use client";

/**
 * Published ephemeral TEXT — PlayHTML-movable for owner.
 * CanMoveElement requires a direct DOM host child.
 * Body is plain React text (no HTML).
 */

import { CanMoveElement } from "@playhtml/react";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import { colourFromSessionId } from "@/lib/social/colour";
import {
  playhtmlTextElementId,
  type EphemeralTextObject,
} from "@/lib/social/ephemeral-text";

export type EphemeralTextObjectViewProps = {
  text: EphemeralTextObject;
  isOwner: boolean;
  onDelete: (textId: string) => void;
};

export function EphemeralTextObjectView({
  text,
  isOwner,
  onDelete,
}: EphemeralTextObjectViewProps) {
  const colour = colourFromSessionId(text.ownerSessionId);
  const hostClassName = isOwner
    ? "pointer-events-auto absolute z-[16] max-w-[min(14rem,70vw)] cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "pointer-events-none absolute z-[16] max-w-[min(14rem,70vw)] select-none";

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlTextElementId(text.textId)}
        className={hostClassName}
        style={{ left: `${text.leftPct}%`, top: `${text.topPct}%` }}
        data-4663-ephemeral-text={text.textId}
        data-4663-ephemeral-text-owner={isOwner ? "true" : "false"}
      >
        <div className="group -translate-x-1/2 -translate-y-1/2">
          <p
            className="whitespace-pre-wrap break-words font-mono text-[12px] leading-snug tracking-wide sm:text-[13px]"
            style={{ color: colour }}
            data-4663-ephemeral-text-body
          >
            {text.body}
          </p>
          {isOwner ? (
            <button
              type="button"
              className="mt-0.5 font-mono text-[10px] tracking-wide text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 group-hover:opacity-100"
              data-4663-ephemeral-text-delete
              aria-label="Delete text"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(text.textId);
              }}
            >
              [ × ]
            </button>
          ) : null}
        </div>
      </div>
    </CanMoveElement>
  );
}
