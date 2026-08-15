"use client";

/**
 * Placed SNAPSHOT image — PlayHTML-movable host, shared hit-fill / capture.
 * Image is visually dominant; owner delete uses IC3.6 control protection.
 */

import { CanMoveElement } from "@playhtml/react";
import { PlayhtmlMoveHitFill } from "@/components/canvas/playhtml-move-hit-fill";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  playhtmlSnapshotElementId,
  type CanvasSnapshotObject,
} from "@/lib/social/canvas-snapshot";

export type CanvasSnapshotObjectViewProps = {
  snapshot: CanvasSnapshotObject;
  isOwner: boolean;
  onDelete: (snapshotId: string) => void;
};

function SnapshotDeleteButton({
  snapshotId,
  onDelete,
}: {
  snapshotId: string;
  onDelete: (snapshotId: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="absolute -top-1 -right-1 z-[1] touch-manipulation font-mono text-[10px] tracking-wide text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 group-hover:opacity-100"
      data-4663-snapshot-delete
      aria-label="Delete snapshot"
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onDelete(snapshotId);
      }}
    >
      [ × ]
    </button>
  );
}

export function CanvasSnapshotObjectView({
  snapshot,
  isOwner,
  onDelete,
}: CanvasSnapshotObjectViewProps) {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  const hostClassName = isOwner
    ? "pointer-events-auto absolute z-[16] cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "pointer-events-none absolute z-[16] select-none";

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlSnapshotElementId(snapshot.snapshotId)}
        className={hostClassName}
        style={{
          left: `${snapshot.leftPct}%`,
          top: `${snapshot.topPct}%`,
          width: `${snapshot.widthPct}%`,
          aspectRatio: String(snapshot.aspectRatio),
        }}
        data-4663-canvas-snapshot={snapshot.snapshotId}
        data-4663-canvas-snapshot-owner={isOwner ? "true" : "false"}
        onPointerDown={move.onPointerDown}
        onPointerUp={move.onPointerUp}
        onPointerCancel={move.onPointerCancel}
      >
        <div className="group relative h-full w-full -translate-x-1/2 -translate-y-1/2 border border-neutral-300 bg-white">
          <PlayhtmlMoveHitFill />
          {/* eslint-disable-next-line @next/next/no-img-element -- durable Storage URL; CORS anonymous for later captures */}
          <img
            src={snapshot.imageUrl}
            alt=""
            draggable={false}
            crossOrigin="anonymous"
            className="relative h-full w-full object-contain"
            data-4663-snapshot-image
          />
          {isOwner ? (
            <SnapshotDeleteButton
              snapshotId={snapshot.snapshotId}
              onDelete={onDelete}
            />
          ) : null}
        </div>
      </div>
    </CanMoveElement>
  );
}
