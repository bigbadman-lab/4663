/**
 * PONS V2 BondingCurve CurveBuy / CurveSell decoder.
 * Uses emitted fee and tax only — never derives amounts from volume or bps.
 */

import { decodeEventLog, parseAbiItem, type Hex } from "viem";
import {
  PONS_V2_CURVE_BUY_TOPIC0,
  PONS_V2_CURVE_SELL_TOPIC0,
} from "@/lib/pons/curve-fee/constants";
import {
  addQuoteAmounts,
  uint256ToDecimalString,
} from "@/lib/pons/curve-fee/numeric";
import type {
  DecodedPonsV2CurveFee,
  PonsV2CurveFeeLogLike,
  PonsV2CurveFeeSide,
} from "@/lib/pons/curve-fee/types";
import { normalizeAddress, normalizeTxHash } from "@/lib/worker/normalize";

export const PONS_V2_CURVE_BUY_EVENT = parseAbiItem(
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
);

export const PONS_V2_CURVE_SELL_EVENT = parseAbiItem(
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
);

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const TX_HASH_RE = /^0x[0-9a-f]{64}$/;

function asAddress(value: string): string | null {
  const hex = normalizeAddress(value);
  if (!ADDRESS_RE.test(hex)) return null;
  return hex;
}

function asTxHash(value: string): string | null {
  const hex = normalizeTxHash(value);
  if (!TX_HASH_RE.test(hex)) return null;
  return hex;
}

function asNonNegativeInt(value: bigint | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "bigint") {
    if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(value);
  }
  if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}

function asUint256(value: unknown): bigint | null {
  if (typeof value !== "bigint" || value < BigInt(0)) return null;
  try {
    uint256ToDecimalString(value);
    return value;
  } catch {
    return null;
  }
}

function topic0Of(log: PonsV2CurveFeeLogLike): string | null {
  const topic0 = log.topics[0]?.trim().toLowerCase();
  if (!topic0 || !TX_HASH_RE.test(topic0)) return null;
  return topic0;
}

function finish(
  side: PonsV2CurveFeeSide,
  log: PonsV2CurveFeeLogLike,
  fee: bigint,
  tax: bigint,
): DecodedPonsV2CurveFee | null {
  const curveAddress = asAddress(log.address);
  const txHash =
    log.transactionHash === null ? null : asTxHash(log.transactionHash);
  const blockNumber = asNonNegativeInt(log.blockNumber);
  const logIndex = asNonNegativeInt(log.logIndex);
  if (!curveAddress || !txHash || blockNumber === null || logIndex === null) {
    return null;
  }

  const totalFee = addQuoteAmounts(fee, tax);
  return {
    side,
    curveAddress,
    txHash,
    logIndex,
    blockNumber,
    fee,
    tax,
    totalFee,
    feeRaw: uint256ToDecimalString(fee),
    taxRaw: uint256ToDecimalString(tax),
    totalFeeRaw: uint256ToDecimalString(totalFee),
  };
}

/**
 * Decode one CurveBuy or CurveSell log.
 * Returns null for wrong topic0, missing fields, or malformed ABI data.
 */
export function decodePonsV2CurveFeeLog(
  log: PonsV2CurveFeeLogLike,
): DecodedPonsV2CurveFee | null {
  const topic0 = topic0Of(log);
  if (topic0 === PONS_V2_CURVE_BUY_TOPIC0) {
    let decoded: ReturnType<typeof decodeEventLog>;
    try {
      decoded = decodeEventLog({
        abi: [PONS_V2_CURVE_BUY_EVENT],
        data: log.data as Hex,
        topics: [...log.topics] as [Hex, ...Hex[]],
      });
    } catch {
      return null;
    }
    if (decoded.eventName !== "CurveBuy") return null;
    const args = decoded.args as {
      fee?: unknown;
      tax?: unknown;
    };
    const fee = asUint256(args.fee);
    const tax = asUint256(args.tax);
    if (fee === null || tax === null) return null;
    return finish("buy", log, fee, tax);
  }

  if (topic0 === PONS_V2_CURVE_SELL_TOPIC0) {
    let decoded: ReturnType<typeof decodeEventLog>;
    try {
      decoded = decodeEventLog({
        abi: [PONS_V2_CURVE_SELL_EVENT],
        data: log.data as Hex,
        topics: [...log.topics] as [Hex, ...Hex[]],
      });
    } catch {
      return null;
    }
    if (decoded.eventName !== "CurveSell") return null;
    const args = decoded.args as {
      fee?: unknown;
      tax?: unknown;
    };
    const fee = asUint256(args.fee);
    const tax = asUint256(args.tax);
    if (fee === null || tax === null) return null;
    return finish("sell", log, fee, tax);
  }

  return null;
}
