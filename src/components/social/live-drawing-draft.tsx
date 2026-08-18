"use client";

/**
 * Remote live DRAW draft projection — non-movable, non-interactive.
 */

import { DrawingStrokesSvg } from "@/components/social/drawing-strokes-svg";
import { drawingHostWorldSizeFromAspect } from "@/lib/social/drawing-ink-bounds";
import type { DrawingDraft } from "@/lib/social/drawing-draft";

export type LiveDrawingDraftViewProps = {
  draft: DrawingDraft;
};

export function LiveDrawingDraftView({ draft }: LiveDrawingDraftViewProps) {
  const hostSize = drawingHostWorldSizeFromAspect(
    draft.widthPct,
    draft.aspectRatio,
  );
  return (
    <div
      className="pointer-events-none absolute z-[18]"
      style={{
        left: `${draft.leftPct}%`,
        top: `${draft.topPct}%`,
        width: `${draft.widthPct}%`,
        aspectRatio: String(draft.aspectRatio),
      }}
      data-4663-live-drawing-draft={draft.draftDrawingId}
      data-4663-live-drawing-owner={draft.ownerSessionId}
    >
      <div className="h-full w-full">
        <DrawingStrokesSvg
          strokes={draft.strokes}
          opacity={0.72}
          widthWorldPx={hostSize.width}
          heightWorldPx={hostSize.height}
        />
      </div>
    </div>
  );
}
