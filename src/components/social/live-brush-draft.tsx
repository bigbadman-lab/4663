"use client";

/**
 * Remote live BRUSH draft — world-space, non-interactive.
 */

import { BrushStrokesSvg } from "@/components/social/brush-strokes-svg";
import type { BrushDraft } from "@/lib/social/brush-draft";

export type LiveBrushDraftViewProps = {
  draft: BrushDraft;
};

export function LiveBrushDraftView({ draft }: LiveBrushDraftViewProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[18]"
      data-4663-live-brush-draft={draft.draftBrushId}
      data-4663-live-brush-owner={draft.ownerSessionId}
    >
      <BrushStrokesSvg strokes={draft.strokes} opacity={0.72} />
    </div>
  );
}
