"use client";

/**
 * Completed BRUSH strokes — world layer, pointer-events none (not movable).
 */

import { BrushStrokesSvg } from "@/components/social/brush-strokes-svg";
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
      {documents.map((doc) => (
        <div
          key={doc.documentId}
          className="pointer-events-none absolute inset-0"
          data-4663-ephemeral-brush-document={doc.documentId}
          data-4663-ephemeral-brush-owner={doc.ownerSessionId}
        >
          <BrushStrokesSvg strokes={doc.strokes} />
        </div>
      ))}
    </div>
  );
}
