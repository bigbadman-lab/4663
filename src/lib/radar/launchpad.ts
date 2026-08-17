/**
 * Shared launchpad identity for RADAR (product surface).
 * Source-specific adapters stay in pons/ and pools/; this is the seam
 * a future RADAR module should consume.
 */

export const LAUNCHPADS = ["pons", "pools"] as const;

export type Launchpad = (typeof LAUNCHPADS)[number];

export const LAUNCHPAD_PONS = "pons" as const;
export const LAUNCHPAD_POOLS = "pools" as const;

export function isLaunchpad(value: unknown): value is Launchpad {
  return value === "pons" || value === "pools";
}

/** Parse a stored events.source / launchpad column. Null if missing or unknown. */
export function parseLaunchpad(value: unknown): Launchpad | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isLaunchpad(normalized) ? normalized : null;
}

/** Display label for watchlist / alert chrome. */
export function launchpadDisplayLabel(launchpad: Launchpad): "PONS" | "POOLS" {
  return launchpad === "pools" ? "POOLS" : "PONS";
}

/**
 * Detail subtitle. Launchpad is separate from PONS factory version.
 * POOLS does not surface Instant strategy jargon on the main RADAR UI.
 */
export function launchpadDetailLabel(input: {
  launchpad: Launchpad;
  factoryVersion?: string | null;
}): string {
  if (input.launchpad === "pools") return "POOLS";
  const version = input.factoryVersion?.trim().toUpperCase();
  if (version === "V1" || version === "V2") return `PONS · ${version}`;
  return "PONS";
}
