"use client";

/**
 * Finished ephemeral DRAW — PlayHTML-movable for owner.
 * CanMoveElement requires a direct DOM host child.
 * IC3.6 — delete control uses shared capture protection.
 */

import { CanMoveElement } from "@playhtml/react";
import { ObjectResizeHandle } from "@/components/canvas/object-resize-handle";
import { PlayhtmlMoveHitFill } from "@/components/canvas/playhtml-move-hit-fill";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import { DrawingStrokesSvg } from "@/components/social/drawing-strokes-svg";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import { drawingHostWorldSizeFromAspect } from "@/lib/social/drawing-ink-bounds";
import {
  drawingDisplaySize,
  drawingObjectScaleLimits,
  playhtmlDrawingElementId,
  type EphemeralDrawingObject,
} from "@/lib/social/ephemeral-drawing";

export type EphemeralDrawingObjectViewProps = {
  drawing: EphemeralDrawingObject;
  isOwner: boolean;
  onDelete: (drawingId: string) => void;
  onResize: (drawingId: string, scale: number) => void;
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
      className="absolute -top-1 -right-1 z-[1] w-max whitespace-nowrap touch-manipulation font-mono text-[10px] tracking-wide text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 group-hover:opacity-100"
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
  onResize,
}: EphemeralDrawingObjectViewProps) {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  const display = drawingDisplaySize(drawing);
  const scaleLimits = drawingObjectScaleLimits(drawing);
  const hostSize = drawingHostWorldSizeFromAspect(
    display.widthPct,
    drawing.aspectRatio,
  );
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
          width: `${display.widthPct}%`,
          aspectRatio: String(drawing.aspectRatio),
        }}
        data-4663-ephemeral-drawing={drawing.drawingId}
        data-4663-ephemeral-drawing-owner={isOwner ? "true" : "false"}
        onPointerDown={isOwner ? move.onPointerDown : undefined}
        onPointerUp={isOwner ? move.onPointerUp : undefined}
        onPointerCancel={isOwner ? move.onPointerCancel : undefined}
      >
        <div className="group relative h-full w-full">
          {isOwner ? <PlayhtmlMoveHitFill /> : null}
          <DrawingStrokesSvg
            strokes={drawing.strokes}
            widthWorldPx={hostSize.width}
            heightWorldPx={hostSize.height}
            strokeScale={display.scale}
            className={isOwner ? "pointer-events-none relative z-[1]" : undefined}
          />
          {isOwner ? (
            <DrawingDeleteButton
              drawingId={drawing.drawingId}
              onDelete={onDelete}
            />
          ) : null}
          {isOwner ? (
            <ObjectResizeHandle
              hostSelector="[data-4663-ephemeral-drawing]"
              scale={display.scale}
              minScale={scaleLimits.min}
              maxScale={scaleLimits.max}
              onResize={(nextScale) => onResize(drawing.drawingId, nextScale)}
              ariaLabel="Resize drawing"
              dataAttr="data-4663-ephemeral-drawing-resize"
            />
          ) : null}
        </div>
      </div>
    </CanMoveElement>
  );
}
