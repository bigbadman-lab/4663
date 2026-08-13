"use client";

/**
 * Social 6 — fixed durable MARK view (non-movable, no edit/delete).
 */

import type { CanvasMark } from "@/lib/social/canvas-mark";

export type CanvasMarkObjectProps = {
  mark: CanvasMark;
};

export function CanvasMarkObject({ mark }: CanvasMarkObjectProps) {
  return (
    <div
      className="pointer-events-none absolute z-[15] max-w-[min(14rem,70vw)] select-none"
      style={{ left: `${mark.leftPct}%`, top: `${mark.topPct}%` }}
      data-4663-canvas-mark={mark.id}
      data-4663-canvas-mark-session={mark.ownerSessionId}
    >
      <div className="-translate-x-1/2 -translate-y-1/2">
        <p
          className="font-mono text-[10px] tracking-wide text-neutral-400"
          data-4663-canvas-mark-label
        >
          <span style={{ color: mark.ownerColour }}>
            {mark.ownerDisplayName.toUpperCase()}
          </span>{" "}
          MARKED:
        </p>
        <p
          className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[12px] leading-snug tracking-wide text-neutral-800 sm:text-[13px]"
          data-4663-canvas-mark-body
        >
          {mark.body}
        </p>
      </div>
    </div>
  );
}
