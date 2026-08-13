"use client";

/**
 * Minimal WATCH control for normal live PONS objects.
 * Named: toggle. Anonymous: count only.
 */

import { useParticipation } from "@/lib/social/use-participation";

export type PonsWatchControlProps = {
  eventId: string;
  /** Isolate from PlayHTML drag start on movable hosts. */
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

  return (
    <button
      type="button"
      className="mt-1 font-mono text-[10px] tracking-wide text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      data-4663-pons-watch
      data-4663-pons-watch-interactive="true"
      data-4663-pons-watch-active={watching ? "true" : "false"}
      aria-pressed={watching}
      aria-label={watching ? "Unwatch event" : "Watch event"}
      onPointerDown={(event) => {
        stopMoveStart?.(event);
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        toggleWatch(eventId);
      }}
    >
      {watching ? `[ WATCHING ] ${count}` : `[ WATCH ] ${count}`}
    </button>
  );
}
