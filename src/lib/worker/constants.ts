/**
 * Worker operational constants (wall-clock / process only).
 * Product time remains chain authority (Stage 2).
 */

/** Heartbeat interval for worker_health upserts. */
export const HEARTBEAT_INTERVAL_MS = 30_000 as const;

/** Continuous factory poll cadence after catch-up (Stage 4). */
export const FACTORY_POLL_INTERVAL_MS = 3_000 as const;

/**
 * Initial eth_getLogs window for dual-factory scans.
 * Matches pons-data-lab Alchemy Free tier behaviour (typically 10 blocks).
 * Adaptive growth/reduction is applied by the scanner.
 */
export const FACTORY_SCAN_INITIAL_CHUNK_BLOCKS = 10 as const;

/** Soft upper bound after successful growth (research max soft cap). */
export const FACTORY_SCAN_MAX_CHUNK_BLOCKS = 2_000 as const;

/** Floor chunk size before failing a rejected range. */
export const FACTORY_SCAN_MIN_CHUNK_BLOCKS = 1 as const;

/** Delay between getLogs calls to ease rate limits (research default). */
export const FACTORY_SCAN_REQUEST_DELAY_MS = 80 as const;

/** Bounded rate-limit retries per chunk. */
export const FACTORY_SCAN_RATE_LIMIT_RETRIES = 10 as const;
