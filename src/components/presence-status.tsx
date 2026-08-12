"use client";

"use client";

/**
 * Quiet presence lines for canvas chrome (edge factual text).
 */

import { useEffect, useState } from "react";
import {
  formatPresenceCount,
  formatPresencePlaces,
} from "@/lib/presence/format-presence";
import type { PresenceSummaryResponse } from "@/lib/presence/summary";
import {
  fetchPresenceSummaryJson,
  startPresenceSummaryPolling,
} from "@/lib/presence/use-presence-summary";

export function PresenceStatus() {
  const [summary, setSummary] = useState<PresenceSummaryResponse | null>(null);

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

  const countLine = formatPresenceCount(summary ? summary.liveUsers : null);
  const placeLine = formatPresencePlaces(summary);

  return (
    <div
      className="flex max-w-sm flex-col items-end gap-0.5 text-right font-mono text-[11px] leading-relaxed tracking-wide text-neutral-400"
      data-4663-presence-status
    >
      <p>{countLine}</p>
      {placeLine ? (
        <p className="break-words text-neutral-400/90">{placeLine}</p>
      ) : null}
    </div>
  );
}
