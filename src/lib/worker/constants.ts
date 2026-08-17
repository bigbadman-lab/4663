/**
 * Worker operational constants (wall-clock / process only).
 * Product time remains chain authority (Stage 2).
 */

/** Heartbeat interval for worker_health upserts. */
export const HEARTBEAT_INTERVAL_MS = 30_000 as const;

/** Continuous factory/transfer poll cadence after catch-up. */
export const FACTORY_POLL_INTERVAL_MS = 3_000 as const;

/**
 * Max Instant / swap outer ranges per worker cycle (startup + poll).
 * Historical POOLS backlog must not delay PONS; catch up one range at a time.
 */
export const POOLS_CATCH_UP_MAX_RANGES_PER_CYCLE = 1 as const;

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

/**
 * Max ACTIVE token addresses per Transfer eth_getLogs request.
 * Research conservative recommendation was 225; use 100 for headroom.
 * Source: pons-data-lab transfer-log-benchmark.json
 */
export const TRANSFER_ADDRESS_BATCH_SIZE = 100 as const;

/**
 * Initial Transfer getLogs block chunk (adaptive, same free-tier start as factories).
 * Outer progression may be larger; inner adaptive grows up to MAX.
 */
export const TRANSFER_SCAN_INITIAL_CHUNK_BLOCKS = 10 as const;

/**
 * Soft upper bound for Transfer outer catch-up range (research 5k worked at 225 addrs;
 * use 2k for result-volume margin under free/pay tiers).
 */
export const TRANSFER_SCAN_MAX_CHUNK_BLOCKS = 2_000 as const;

export const TRANSFER_SCAN_MIN_CHUNK_BLOCKS = 1 as const;
export const TRANSFER_SCAN_REQUEST_DELAY_MS = 80 as const;
export const TRANSFER_SCAN_RATE_LIMIT_RETRIES = 10 as const;
