/**
 * ERC-20 Transfer decode primitives for ACTIVE PONS tokens.
 * Ported from pons-data-lab/src/normalize/detect-pons-buy.ts decodeErc20Transfer.
 */

import {
  decodeEventLog,
  parseAbiItem,
  type Hex,
} from "viem";
import { normalizeAddress, normalizeTxHash } from "@/lib/worker/normalize";

export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export type DecodedTransferLog = {
  tokenAddress: string;
  from: string;
  to: string;
  /** Raw amount as decimal string (no floats). */
  amountRaw: string;
  amount: bigint;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
};

export function decodeErc20TransferLog(log: {
  address: string;
  topics: readonly string[];
  data: string;
  transactionHash: string | null;
  blockNumber: bigint | number | null;
  logIndex: number | null;
}): DecodedTransferLog | null {
  try {
    if (log.blockNumber === null || !log.transactionHash) return null;
    if (
      !log.topics[0] ||
      log.topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC.toLowerCase()
    ) {
      return null;
    }

    const decoded = decodeEventLog({
      abi: [TRANSFER_EVENT],
      data: log.data as Hex,
      topics: log.topics as [Hex, ...Hex[]],
    });
    if (decoded.eventName !== "Transfer") return null;

    const args = decoded.args as {
      from: string;
      to: string;
      value: bigint;
    };

    return {
      tokenAddress: normalizeAddress(log.address),
      from: normalizeAddress(args.from),
      to: normalizeAddress(args.to),
      amount: args.value,
      amountRaw: args.value.toString(),
      transactionHash: normalizeTxHash(log.transactionHash),
      blockNumber: Number(log.blockNumber),
      logIndex: Number(log.logIndex ?? 0),
    };
  } catch {
    return null;
  }
}
