"use client";

/**
 * Placed TOKEN object — PlayHTML-movable for owner; copy/OPEN stay interactive.
 * Snapshot fields only; no metadata refetch; no explorer URL construction.
 */

import { CanMoveElement } from "@playhtml/react";
import { PlayhtmlMoveHitFill } from "@/components/canvas/playhtml-move-hit-fill";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import { CanvasTokenCard } from "@/components/social/canvas-token-card";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  playhtmlTokenElementId,
  type CanvasTokenObject,
} from "@/lib/social/canvas-token";

export type CanvasTokenObjectViewProps = {
  token: CanvasTokenObject;
  isOwner: boolean;
  onDelete: (tokenId: string) => void;
};

function TokenDeleteButton({
  tokenId,
  onDelete,
}: {
  tokenId: string;
  onDelete: (tokenId: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="absolute -top-1 -right-1 z-[1] touch-manipulation font-mono text-[10px] tracking-wide text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 group-hover:opacity-100"
      data-4663-canvas-token-delete
      aria-label="Delete token"
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onDelete(tokenId);
      }}
    >
      [ × ]
    </button>
  );
}

export function CanvasTokenObjectView({
  token,
  isOwner,
  onDelete,
}: CanvasTokenObjectViewProps) {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  const hostClassName = isOwner
    ? "pointer-events-auto absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "pointer-events-none absolute z-[16] select-none";

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlTokenElementId(token.tokenId)}
        className={hostClassName}
        style={{ left: `${token.leftPct}%`, top: `${token.topPct}%` }}
        data-4663-canvas-token={token.tokenId}
        data-4663-canvas-token-owner={isOwner ? "true" : "false"}
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
            <CanvasTokenCard token={token} interactive />
          </div>
          {isOwner ? (
            <TokenDeleteButton tokenId={token.tokenId} onDelete={onDelete} />
          ) : null}
        </div>
      </div>
    </CanMoveElement>
  );
}
