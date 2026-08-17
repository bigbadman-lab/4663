/**
 * POOLS Instant domain constants (application truth, not env).
 * V1 supports only InstantLaunchStrategy v3.2.0 — no Crowd Launch.
 */

export const CURSOR_STREAM_POOLS_INSTANT = "pools_instant" as const;

/** Independent Instant activity cursor. Must not share pools_instant. */
export const CURSOR_STREAM_POOLS_SWAPS = "pools_swaps" as const;

export const EVENT_SOURCE_POOLS = "pools" as const;

export const POOLS_INSTANT_SOURCE_VERSION = "instant-v3.2.0" as const;
