"use client";

/**
 * Remote live-typing projection (Social 2B).
 * Not movable — no CanMoveElement. Plain text only.
 */

import { colourFromSessionId } from "@/lib/social/colour";
import type { TextDraft } from "@/lib/social/text-draft";

export type LiveTextDraftViewProps = {
  draft: TextDraft;
};

export function LiveTextDraftView({ draft }: LiveTextDraftViewProps) {
  const colour = colourFromSessionId(draft.ownerSessionId);

  return (
    <div
      className="pointer-events-none absolute z-[16] max-w-[min(14rem,70vw)] select-none"
      style={{ left: `${draft.leftPct}%`, top: `${draft.topPct}%` }}
      data-4663-live-text-draft={draft.draftId}
      data-4663-live-text-draft-owner={draft.ownerSessionId}
    >
      <p
        className="-translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap break-words font-mono text-[12px] leading-snug tracking-wide opacity-55 sm:text-[13px]"
        style={{ color: colour }}
        data-4663-live-text-draft-body
      >
        {draft.body}
        <span className="opacity-80" aria-hidden>
          ▌
        </span>
      </p>
    </div>
  );
}
