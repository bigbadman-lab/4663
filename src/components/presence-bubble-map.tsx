"use client";

/**
 * Bottom-left live presence bubble map — aggregate countries only.
 * Visualization centroids; no individual sessions / coords / IPs.
 */

import { useEffect, useRef, useState } from "react";
import {
  buildPresenceBubbles,
  countActiveCountries,
  formatCountryCountLabel,
  formatPeopleHereLabel,
} from "@/lib/presence/bubble-map";
import {
  BUBBLE_MAP_VIEW_HEIGHT,
  BUBBLE_MAP_VIEW_WIDTH,
} from "@/lib/presence/country-centroids";
import type { PresenceSummaryResponse } from "@/lib/presence/summary";
import {
  fetchPresenceSummaryJson,
  startPresenceSummaryPolling,
} from "@/lib/presence/use-presence-summary";

/** Simplified equirectangular land silhouettes (visualization only). */
const WORLD_LAND_PATHS = [
  // North America
  "M38 48 L72 42 L95 52 L108 68 L95 88 L70 95 L48 82 L32 62 Z",
  // South America
  "M95 100 L112 108 L118 145 L105 158 L92 140 L88 115 Z",
  // Europe
  "M175 42 L198 38 L210 48 L205 62 L188 68 L172 58 Z",
  // Africa
  "M178 72 L208 70 L218 105 L205 140 L185 145 L170 115 L168 85 Z",
  // Asia
  "M215 40 L280 35 L310 55 L305 85 L270 95 L230 88 L215 70 Z",
  // Australia
  "M290 120 L320 118 L325 140 L300 148 L285 135 Z",
] as const;

export function PresenceBubbleMap() {
  const [summary, setSummary] = useState<PresenceSummaryResponse | null>(null);
  const [pulse, setPulse] = useState(false);
  const prevLiveRef = useRef<number | null>(null);

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

  useEffect(() => {
    const next = summary?.liveUsers ?? null;
    const prev = prevLiveRef.current;
    prevLiveRef.current = next;
    if (prev === null || next === null) return;
    if (next <= prev) return;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 700);
    return () => window.clearTimeout(id);
  }, [summary?.liveUsers]);

  const liveUsers = summary?.liveUsers ?? null;
  const byCountry = summary?.byCountry ?? {};
  const bubbles = buildPresenceBubbles(byCountry);
  const countryCount = countActiveCountries(byCountry);
  const peopleLabel = formatPeopleHereLabel(liveUsers);
  const countryLabel = formatCountryCountLabel(countryCount);

  return (
    <div
      className="flex w-[min(11.5rem,100%)] flex-col gap-1 sm:w-[12.5rem]"
      data-4663-presence-status
      data-4663-presence-bubble-map
      aria-label={peopleLabel}
    >
      <p
        className="font-mono text-[10px] leading-none tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] sm:text-[11px]"
        data-4663-presence-people
      >
        {peopleLabel}
      </p>

      <svg
        viewBox={`0 0 ${BUBBLE_MAP_VIEW_WIDTH} ${BUBBLE_MAP_VIEW_HEIGHT}`}
        className={`h-auto w-full transition-opacity duration-700 ${
          pulse ? "opacity-100" : "opacity-90"
        }`}
        role="img"
        aria-hidden
        data-4663-presence-map
      >
        <rect
          x={0}
          y={0}
          width={BUBBLE_MAP_VIEW_WIDTH}
          height={BUBBLE_MAP_VIEW_HEIGHT}
          fill="transparent"
        />
        {WORLD_LAND_PATHS.map((d) => (
          <path
            key={d}
            d={d}
            fill="currentColor"
            className="text-[color:var(--canvas-muted,#a3a3a3)] opacity-[0.14]"
          />
        ))}
        {bubbles.map((bubble) => (
          <circle
            key={bubble.code}
            cx={bubble.x}
            cy={bubble.y}
            r={bubble.radius}
            fill="currentColor"
            className="text-[color:var(--canvas-fg,#171717)] opacity-35"
            data-4663-presence-bubble={bubble.code}
            data-4663-presence-bubble-count={bubble.count}
          />
        ))}
      </svg>

      <p
        className="font-mono text-[9px] leading-none tracking-wide text-[color:var(--canvas-muted,#a3a3a3)] sm:text-[10px]"
        data-4663-presence-countries
      >
        {countryLabel}
      </p>
    </div>
  );
}
