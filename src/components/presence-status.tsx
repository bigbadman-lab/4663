"use client";

/**
 * Quiet single-line presence status for canvas chrome.
 * Aggregated coarsened locations; never wraps or stacks vertically.
 */

import { useEffect, useState } from "react";
import {
  formatPresenceLine,
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

  const line = formatPresenceLine(summary, {
    maxPlaces: narrow
      ? PRESENCE_PLACE_LIMIT_NARROW
      : PRESENCE_PLACE_LIMIT_DESKTOP,
  });

  return (
    <p
      className="max-w-full truncate whitespace-nowrap font-mono text-[10px] leading-relaxed tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] sm:text-[11px]"
      data-4663-presence-status
      data-4663-presence-narrow={narrow ? "true" : "false"}
      title={line}
    >
      {line}
    </p>
  );
}
