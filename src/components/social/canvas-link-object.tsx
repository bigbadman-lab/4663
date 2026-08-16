"use client";

/**
 * Placed LINK object — PlayHTML-movable for owner; OPEN stays interactive.
 * Snapshot fields only; no metadata refetch.
 */

import { CanMoveElement } from "@playhtml/react";
import { PlayhtmlMoveHitFill } from "@/components/canvas/playhtml-move-hit-fill";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import { CanvasLinkCard } from "@/components/social/canvas-link-card";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  playhtmlLinkElementId,
  type CanvasLinkObject,
} from "@/lib/social/canvas-link";

export type CanvasLinkObjectViewProps = {
  link: CanvasLinkObject;
  isOwner: boolean;
  onDelete: (linkId: string) => void;
};

function LinkDeleteButton({
  linkId,
  onDelete,
}: {
  linkId: string;
  onDelete: (linkId: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="absolute -top-1 -right-1 z-[1] touch-manipulation font-mono text-[10px] tracking-wide text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 group-hover:opacity-100"
      data-4663-canvas-link-delete
      aria-label="Delete link"
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onDelete(linkId);
      }}
    >
      [ × ]
    </button>
  );
}

export function CanvasLinkObjectView({
  link,
  isOwner,
  onDelete,
}: CanvasLinkObjectViewProps) {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  const hostClassName = isOwner
    ? "pointer-events-auto absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "pointer-events-none absolute z-[16] select-none";

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlLinkElementId(link.linkId)}
        className={hostClassName}
        style={{ left: `${link.leftPct}%`, top: `${link.topPct}%` }}
        data-4663-canvas-link={link.linkId}
        data-4663-canvas-link-owner={isOwner ? "true" : "false"}
        onPointerDown={move.onPointerDown}
        onPointerUp={move.onPointerUp}
        onPointerCancel={move.onPointerCancel}
      >
        <div className="group relative -translate-x-1/2 -translate-y-1/2">
          {isOwner ? <PlayhtmlMoveHitFill /> : null}
          <div
            className={
              isOwner ? "relative z-[1]" : "pointer-events-none relative z-[1]"
            }
          >
            <CanvasLinkCard preview={link} interactive />
          </div>
          {isOwner ? (
            <LinkDeleteButton linkId={link.linkId} onDelete={onDelete} />
          ) : null}
        </div>
      </div>
    </CanMoveElement>
  );
}
