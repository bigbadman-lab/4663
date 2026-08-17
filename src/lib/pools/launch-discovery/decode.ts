/**
 * Pure TokenLaunched decoder for InstantLaunchStrategy v3.2.0.
 * Token is topics[2] (not PONS topics[1]). PoolId is preserved as bytes32 hex.
 */

import {
  decodeEventLog,
  parseAbiItem,
  type Hex,
} from "viem";
import {
  POOLS_INSTANT_STRATEGY_V3_2_0,
  POOLS_TOKEN_LAUNCHED_TOPIC0,
} from "@/lib/pools/addresses";
import { POOLS_INSTANT_SOURCE_VERSION } from "@/lib/pools/constants";
import type {
  ExtractedPoolsInstantLaunch,
  LaunchedTokenCurrencyIndex,
} from "@/lib/pools/launch-discovery/types";
import { normalizeAddress, normalizeTxHash } from "@/lib/worker/normalize";

export const POOLS_TOKEN_LAUNCHED_EVENT = parseAbiItem(
  "event TokenLaunched(bytes32 indexed poolId, address indexed token, address indexed finalPositionRecipient, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key)",
);

const BYTES32_RE = /^0x[0-9a-f]{64}$/;
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

export type PoolsLogLike = {
  address: string;
  blockNumber: bigint | number | null;
  transactionHash: string | null;
  logIndex: number | null;
  topics: readonly string[];
  data: string;
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
 * Decode one Instant TokenLaunched log.
 * Returns null for wrong contract, wrong topic0, or malformed payload.
 */
export function decodePoolsInstantTokenLaunched(
  log: PoolsLogLike,
  expectedStrategy: string = POOLS_INSTANT_STRATEGY_V3_2_0,
): ExtractedPoolsInstantLaunch | null {
  if (log.blockNumber === null || log.transactionHash === null) return null;
  const emitter = asAddress(log.address);
  if (!emitter || emitter !== normalizeAddress(expectedStrategy)) return null;

  const topic0 = log.topics[0]?.trim().toLowerCase();
  if (topic0 !== POOLS_TOKEN_LAUNCHED_TOPIC0) return null;

  const poolIdFromTopic = log.topics[1] ? normalizeBytes32(log.topics[1]) : null;
  if (!poolIdFromTopic) return null;

  let decoded: ReturnType<typeof decodeEventLog>;
  try {
    decoded = decodeEventLog({
      abi: [POOLS_TOKEN_LAUNCHED_EVENT],
      data: log.data as Hex,
      topics: [...log.topics] as [Hex, ...Hex[]],
    });
  } catch {
    return null;
  }

  if (decoded.eventName !== "TokenLaunched") return null;
  const args = decoded.args as {
    poolId?: unknown;
    token?: unknown;
    finalPositionRecipient?: unknown;
    key?: {
      currency0?: unknown;
      currency1?: unknown;
      fee?: unknown;
      tickSpacing?: unknown;
      hooks?: unknown;
    };
  };
  const token = asAddress(String(args.token));
  const recipient = asAddress(String(args.finalPositionRecipient));
  const poolId = normalizeBytes32(String(args.poolId));
  if (!token || !recipient || !poolId) return null;
  if (poolId !== poolIdFromTopic) return null;

  const key = args.key;
  if (!key || typeof key !== "object") return null;
  const currency0 = asAddress(String(key.currency0));
  const currency1 = asAddress(String(key.currency1));
  const hooks = asAddress(String(key.hooks));
  if (!currency0 || !currency1 || !hooks) return null;

  const fee = Number(key.fee);
  const tickSpacing = Number(key.tickSpacing);
  if (!Number.isInteger(fee) || fee < 0 || fee > 16_777_215) return null;
  if (!Number.isInteger(tickSpacing)) return null;

  let launchedTokenCurrencyIndex: LaunchedTokenCurrencyIndex;
  if (token === currency0) launchedTokenCurrencyIndex = 0;
  else if (token === currency1) launchedTokenCurrencyIndex = 1;
  else return null;

  return {
    launchpad: "pools",
    sourceContract: emitter,
    sourceVersion: POOLS_INSTANT_SOURCE_VERSION,
    poolId,
    tokenAddress: token,
    finalPositionRecipient: recipient,
    poolKey: {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
    },
    launchedTokenCurrencyIndex,
    launchTxHash: normalizeTxHash(log.transactionHash),
    launchBlockNumber: Number(log.blockNumber),
    logIndex: Number(log.logIndex ?? 0),
  };
}

export function extractPoolsInstantLaunchesFromLogs(
  logs: readonly PoolsLogLike[],
  expectedStrategy: string = POOLS_INSTANT_STRATEGY_V3_2_0,
): ExtractedPoolsInstantLaunch[] {
  const byTxToken = new Map<string, ExtractedPoolsInstantLaunch>();
  for (const log of logs) {
    const extracted = decodePoolsInstantTokenLaunched(log, expectedStrategy);
    if (!extracted) continue;
    const key = `${extracted.launchTxHash}:${extracted.tokenAddress}`;
    if (!byTxToken.has(key)) byTxToken.set(key, extracted);
  }
  return [...byTxToken.values()].sort((a, b) => {
    if (a.launchBlockNumber !== b.launchBlockNumber) {
      return a.launchBlockNumber - b.launchBlockNumber;
    }
    if (a.launchTxHash !== b.launchTxHash) {
      return a.launchTxHash.localeCompare(b.launchTxHash);
    }
    return a.logIndex - b.logIndex;
  });
}
