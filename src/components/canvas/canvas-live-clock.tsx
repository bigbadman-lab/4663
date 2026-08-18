"use client";

/**
 * Fixed bottom-right live local clock for canvas chrome.
 * Client-only clock to avoid SSR/client time mismatch.
 * X profile link lives in the top-right identity cluster.
 */

import { useEffect, useState } from "react";
import { formatLocalClock } from "@/lib/canvas/format-local-clock";

export function CanvasLiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  return (
    <div
      className="inline-flex items-center justify-end"
      data-4663-live-clock-module
    >
      <time
        className="font-mono text-[10px] leading-none tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] tabular-nums desktop-chrome:text-[11px]"
        dateTime={now?.toISOString()}
        aria-live="off"
        data-4663-live-clock
      >
        {now ? formatLocalClock(now) : "\u00a0"}
      </time>
    </div>
  );
}
