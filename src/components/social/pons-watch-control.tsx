"use client";

/**
 * Minimal WATCH control for normal live PONS objects.
 * Named: toggle. Anonymous: count only.
 * IC3.6 — native capture protection so mobile taps beat PlayHTML move-start.
 */

import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import { useParticipation } from "@/lib/social/use-participation";

export type PonsWatchControlProps = {
  eventId: string;
  /**
   * @deprecated IC3.6 — protection is always applied via native capture.
   * Kept optional for call-site compatibility.
   */
  stopMoveStart?: (event: { stopPropagation(): void }) => void;
};

export function PonsWatchControl({
  eventId,
  stopMoveStart,
}: PonsWatchControlProps) {
  const { isParticipating, isWatching, toggleWatch, watchCount } =
    useParticipation();
  const count = watchCount(eventId);
  const watching = isParticipating && isWatching(eventId);
  const ref = useInteractiveControlProtection<HTMLButtonElement>();

  if (!isParticipating) {
    return (
      <p
        className="mt-1 font-mono text-[10px] tracking-wide text-neutral-400"
        data-4663-pons-watch
        data-4663-pons-watch-interactive="false"
      >
        WATCH {count}
      </p>
    );
  }

  function isolateMoveStart(event: { stopPropagation(): void }): void {
    stopPlayhtmlMoveStart(event);
    stopMoveStart?.(event);
  }

  return (
    <button
      ref={ref}
      type="button"
      className="mt-1 touch-manipulation font-mono text-[10px] tracking-wide text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      data-4663-pons-watch
      data-4663-pons-watch-interactive="true"
      data-4663-pons-watch-active={watching ? "true" : "false"}
      aria-pressed={watching}
      aria-label={watching ? "Unwatch event" : "Watch event"}
      onPointerDown={isolateMoveStart}
      onMouseDown={isolateMoveStart}
      onTouchStart={isolateMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        toggleWatch(eventId);
      }}
    >
      {watching ? `[ WATCHING ] ${count}` : `[ WATCH ] ${count}`}
    </button>
  );
}
