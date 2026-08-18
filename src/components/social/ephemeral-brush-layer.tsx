"use client";

/**
 * Completed BRUSH strokes — world layer, pointer-events none (not movable).
 * Each document is positioned to its ink AABB so the paint box matches the
 * drawing (no full-world empty rectangle).
 */

import { BrushStrokesSvg } from "@/components/social/brush-strokes-svg";
import { fitBrushInkBounds } from "@/lib/social/drawing-ink-bounds";
import type { EphemeralBrushDocument } from "@/lib/social/ephemeral-brush";

export type EphemeralBrushLayerProps = {
  documents: readonly EphemeralBrushDocument[];
};

export function EphemeralBrushLayer({ documents }: EphemeralBrushLayerProps) {
  if (documents.length === 0) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[14]"
      data-4663-ephemeral-brush-layer
    >
      {documents.map((doc) => {
        const bounds = fitBrushInkBounds(doc.strokes);
        if (!bounds) return null;
        return (
          <div
            key={doc.documentId}
            className="pointer-events-none absolute"
            style={{
              left: `${bounds.leftPct}%`,
              top: `${bounds.topPct}%`,
              width: `${bounds.widthPct}%`,
              height: `${bounds.heightPct}%`,
            }}
            data-4663-ephemeral-brush-document={doc.documentId}
            data-4663-ephemeral-brush-owner={doc.ownerSessionId}
          >
            <BrushStrokesSvg strokes={doc.strokes} bounds={bounds} />
          </div>
        );
      })}
    </div>
  );
}
