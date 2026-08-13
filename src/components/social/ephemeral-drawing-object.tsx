"use client";

/**
 * Finished ephemeral DRAW — PlayHTML-movable for owner.
 * CanMoveElement requires a direct DOM host child.
 */

import { CanMoveElement } from "@playhtml/react";
import { DrawingStrokesSvg } from "@/components/social/drawing-strokes-svg";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import {
  playhtmlDrawingElementId,
  type EphemeralDrawingObject,
} from "@/lib/social/ephemeral-drawing";

export type EphemeralDrawingObjectViewProps = {
  drawing: EphemeralDrawingObject;
  isOwner: boolean;
  onDelete: (drawingId: string) => void;
};

export function EphemeralDrawingObjectView({
  drawing,
  isOwner,
  onDelete,
}: EphemeralDrawingObjectViewProps) {
  const hostClassName = isOwner
    ? "pointer-events-auto absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "pointer-events-none absolute z-[16] select-none";

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlDrawingElementId(drawing.drawingId)}
        className={hostClassName}
        style={{
          left: `${drawing.leftPct}%`,
          top: `${drawing.topPct}%`,
          width: `${drawing.widthPct}%`,
          aspectRatio: String(drawing.aspectRatio),
        }}
        data-4663-ephemeral-drawing={drawing.drawingId}
        data-4663-ephemeral-drawing-owner={isOwner ? "true" : "false"}
      >
        <div className="group relative h-full w-full">
          <DrawingStrokesSvg strokes={drawing.strokes} />
          {isOwner ? (
            <button
              type="button"
              className="absolute -top-1 -right-1 font-mono text-[10px] tracking-wide text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 group-hover:opacity-100"
              data-4663-ephemeral-drawing-delete
              aria-label="Delete drawing"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(drawing.drawingId);
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
