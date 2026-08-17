"use client";

import { launchpadDisplayLabel, type Launchpad } from "@/lib/radar/launchpad";

/** Compact launchpad chip for RADAR rows and floating alerts. */
export function RadarLaunchpadLabel({
  launchpad,
  className = "",
}: {
  launchpad: Launchpad;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[9px] leading-none tracking-[0.14em] text-neutral-400 ${className}`.trim()}
      data-4663-radar-launchpad={launchpad}
    >
      {launchpadDisplayLabel(launchpad)}
    </span>
  );
}
