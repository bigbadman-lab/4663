/**
 * MVP PONS worker domain constants.
 * Pure application truth — not runtime env config.
 * Chain-time semantics only; see docs/stage2-worker-lifecycle.md
 */

export const CHAIN_ID = 4663 as const;

/** Token age floor before fire evaluation is allowed (seconds, chain time). */
export const EVENT_AGE_FLOOR_SECONDS = 180 as const;

/** Inclusive rolling window for distinct first-time strict buyers (seconds). */
export const EVENT_WINDOW_SECONDS = 180 as const;

/** Minimum distinct first buyers inside the rolling window to fire. */
export const EVENT_NEW_BUYERS_THRESHOLD = 5 as const;

/** Strict watch lifetime from launch (seconds, chain time). Tunable later via code constant only. */
export const TOKEN_WATCH_TTL_SECONDS = 3600 as const;

/** Blocks rewound from last_processed_block on every process start. */
export const STARTUP_REWIND_BLOCKS = 5 as const;

export const WORKER_NAME = "4663-pons-worker" as const;

export const CURSOR_STREAM_PONS_FACTORIES = "pons_factories" as const;
export const CURSOR_STREAM_PONS_TRANSFERS = "pons_transfers" as const;

export const EVENT_TYPE_PONS_BUYING_ACTIVITY = "pons_buying_activity" as const;
export const EVENT_SOURCE_PONS = "pons" as const;

/** Normalised lowercase factory addresses (DB / worker write form). */
export const PONS_FACTORY_V1 =
  "0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb" as const;
export const PONS_FACTORY_V2 =
  "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" as const;

export const LAUNCH_STATUSES = ["active", "fired", "expired"] as const;
export const FACTORY_VERSIONS = ["v1", "v2"] as const;
