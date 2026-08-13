"use client";

/**
 * Finished ephemeral DRAW — PlayHTML-movable for owner.
 * CanMoveElement requires a direct DOM host child.
 * IC3.6 — delete control uses shared capture protection.
 */

import { CanMoveElement } from "@playhtml/react";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { DrawingStrokesSvg } from "@/components/social/drawing-strokes-svg";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  playhtmlDrawingElementId,
  type EphemeralDrawingObject,
} from "@/lib/social/ephemeral-drawing";

export type EphemeralDrawingObjectViewProps = {
  drawing: EphemeralDrawingObject;
  isOwner: boolean;
  onDelete: (drawingId: string) => void;
};

function DrawingDeleteButton({
  drawingId,
  onDelete,
}: {
  drawingId: string;
  onDelete: (drawingId: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="absolute -top-1 -right-1 touch-manipulation font-mono text-[10px] tracking-wide text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 group-hover:opacity-100"
      data-4663-ephemeral-drawing-delete
      aria-label="Delete drawing"
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onDelete(drawingId);
      }}
    >
      [ × ]
    </button>
  );
}

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
            <DrawingDeleteButton
              drawingId={drawing.drawingId}
              onDelete={onDelete}
            />
          ) : null}
        </div>
      </div>
    </CanMoveElement>
  );
}
