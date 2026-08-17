/**
 * Uniswap v4 PoolManager Swap decoder for POOLS Instant activity.
 * Buyer identity is not in this log — Swap.sender is often a router.
 */

import { decodeEventLog, parseAbiItem, type Hex } from "viem";
import {
  POOLS_V4_SWAP_TOPIC0,
  RHC_UNISWAP_V4_POOL_MANAGER,
} from "@/lib/pools/addresses";
import { normalizeAddress, normalizeTxHash } from "@/lib/worker/normalize";

export const POOLS_V4_SWAP_EVENT = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);

const BYTES32_RE = /^0x[0-9a-f]{64}$/;
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

export type PoolsSwapLogLike = {
  address: string;
  blockNumber: bigint | number | null;
  transactionHash: string | null;
  logIndex: number | null;
  topics: readonly string[];
  data: string;
};

export type DecodedPoolsV4Swap = {
  poolId: string;
  /** Intermediary / router — never used as buyer. */
  sender: string;
  amount0: bigint;
  amount1: bigint;
  txHash: string;
  blockNumber: number;
  logIndex: number;
};

function normalizeBytes32(value: string): string | null {
  const hex = value.trim().toLowerCase();
  if (!BYTES32_RE.test(hex)) return null;
  return hex;
}

function asAddress(value: string): string | null {
  const hex = normalizeAddress(value);
  if (!ADDRESS_RE.test(hex)) return null;
  return hex;
}

/**
 * Decode one PoolManager Swap log.
 * Returns null for wrong emitter, wrong topic0, or malformed payload.
 */
export function decodePoolsV4Swap(
  log: PoolsSwapLogLike,
  expectedPoolManager: string = RHC_UNISWAP_V4_POOL_MANAGER,
): DecodedPoolsV4Swap | null {
  if (log.blockNumber === null || log.transactionHash === null) return null;
  if (log.logIndex === null) return null;

  const emitter = asAddress(log.address);
  if (!emitter || emitter !== normalizeAddress(expectedPoolManager)) return null;

  const topic0 = log.topics[0]?.trim().toLowerCase();
  if (topic0 !== POOLS_V4_SWAP_TOPIC0) return null;

  const poolIdFromTopic = log.topics[1]
    ? normalizeBytes32(log.topics[1])
    : null;
  if (!poolIdFromTopic) return null;

  let decoded: ReturnType<typeof decodeEventLog>;
  try {
    decoded = decodeEventLog({
      abi: [POOLS_V4_SWAP_EVENT],
      data: log.data as Hex,
      topics: [...log.topics] as [Hex, ...Hex[]],
    });
  } catch {
    return null;
  }

  if (decoded.eventName !== "Swap") return null;
  const args = decoded.args as {
    id?: unknown;
    sender?: unknown;
    amount0?: unknown;
    amount1?: unknown;
  };

  if (typeof args.amount0 !== "bigint" || typeof args.amount1 !== "bigint") {
    return null;
  }

  const sender =
    typeof args.sender === "string" ? asAddress(args.sender) : null;
  if (!sender) return null;

  return {
    poolId: poolIdFromTopic,
    sender,
    amount0: args.amount0,
    amount1: args.amount1,
    txHash: normalizeTxHash(log.transactionHash),
    blockNumber: Number(log.blockNumber),
    logIndex: log.logIndex,
  };
}

export function extractPoolsV4SwapsFromLogs(
  logs: readonly PoolsSwapLogLike[],
  expectedPoolManager: string = RHC_UNISWAP_V4_POOL_MANAGER,
): { decoded: DecodedPoolsV4Swap[]; malformed: number } {
  const decoded: DecodedPoolsV4Swap[] = [];
  let malformed = 0;
  for (const log of logs) {
    const emitter = asAddress(log.address);
    const topic0 = log.topics[0]?.trim().toLowerCase();
    const looksLikeTargetSwap =
      !!emitter &&
      emitter === normalizeAddress(expectedPoolManager) &&
      topic0 === POOLS_V4_SWAP_TOPIC0;
    const row = decodePoolsV4Swap(log, expectedPoolManager);
    if (row) {
      decoded.push(row);
      continue;
    }
    if (looksLikeTargetSwap) malformed += 1;
  }
  return { decoded, malformed };
}
