"use client";

/**
 * Quiet bottom-left presence strip — live count + compact location bubbles.
 * Aggregates only; never wraps; never maps geography.
 */

import { useEffect, useState } from "react";
import {
  buildPresenceLocationGroups,
  formatPresenceHereLabel,
  PRESENCE_PLACE_LIMIT_DESKTOP,
  PRESENCE_PLACE_LIMIT_NARROW,
} from "@/lib/presence/format-presence";
import type { PresenceSummaryResponse } from "@/lib/presence/summary";
import {
  fetchPresenceSummaryJson,
  startPresenceSummaryPolling,
} from "@/lib/presence/use-presence-summary";

function useNarrowPresenceLayout(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return narrow;
}

export function PresenceStatus() {
  const [summary, setSummary] = useState<PresenceSummaryResponse | null>(null);
  const narrow = useNarrowPresenceLayout();

  useEffect(() => {
    const poller = startPresenceSummaryPolling({
      fetchSummary: () => fetchPresenceSummaryJson(),
      setIntervalFn: (handler, ms) => window.setInterval(handler, ms),
      clearIntervalFn: (id) => window.clearInterval(id as number),
      onUpdate: setSummary,
    });
    return () => {
      poller.stop();
    };
  }, []);

  const maxPlaces = narrow
    ? PRESENCE_PLACE_LIMIT_NARROW
    : PRESENCE_PLACE_LIMIT_DESKTOP;
  const groups = buildPresenceLocationGroups(summary);
  const shown = groups.slice(0, maxPlaces);
  const overflow = Math.max(0, groups.length - shown.length);
  const hereLabel = formatPresenceHereLabel(
    summary ? summary.liveUsers : null,
  );

  return (
    <div
      className="flex max-w-full items-center gap-1.5 overflow-hidden whitespace-nowrap font-mono text-[10px] leading-none tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] sm:gap-2 sm:text-[11px]"
      data-4663-presence-status
      data-4663-presence-narrow={narrow ? "true" : "false"}
      aria-label={hereLabel}
    >
      <span
        className="shrink-0"
        data-4663-presence-here
      >
        {hereLabel}
      </span>
      {shown.length > 0 ? (
        <span
          className="flex min-w-0 items-center gap-1 overflow-hidden"
          data-4663-presence-bubbles
        >
          {shown.map((group) => (
            <span
              key={`${group.label}:${group.count}`}
              className="inline-flex shrink-0 items-center border border-[color:var(--canvas-muted,#a3a3a3)]/35 px-1 py-0.5 text-[9px] leading-none tracking-wide sm:text-[10px]"
              data-4663-presence-bubble={group.label.toUpperCase()}
              data-4663-presence-bubble-count={group.count}
            >
              {group.label.toUpperCase()} {group.count}
            </span>
          ))}
          {overflow > 0 ? (
            <span
              className="inline-flex shrink-0 items-center border border-[color:var(--canvas-muted,#a3a3a3)]/35 px-1 py-0.5 text-[9px] leading-none tracking-wide sm:text-[10px]"
              data-4663-presence-overflow
            >
              +{overflow}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
