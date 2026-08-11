/**
 * Strict PonsBuy v0 — high precision, no fuzzy scoring.
 * Ported from pons-data-lab/src/normalize/detect-pons-buy.ts.
 *
 * Requires:
 * - receipt.status === success
 * - ≥1 ERC-20 Transfer on launched token: from==market, to==tx.from, amount>0
 *
 * Does NOT use tx.to, selector, routers, or unknown events as detection conditions.
 */

import {
  getAddress,
  isAddressEqual,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import {
  decodeErc20TransferLog,
  ERC20_TRANSFER_TOPIC,
} from "@/lib/pons/transfer/decode";
import type { FactoryVersion } from "@/lib/pons/types";
import { normalizeAddress, normalizeTxHash } from "@/lib/worker/normalize";

export type BuyRejectionReason =
  | "failed_transaction"
  | "token_not_from_known_market"
  | "token_recipient_not_tx_from"
  | "malformed_transfer"
  | "zero_amount"
  | "zero_buyer"
  | "other";

export type DetectPonsBuyInput = {
  version: FactoryVersion;
  tokenAddress: string;
  marketAddress: string;
  tx: Pick<Transaction, "from" | "hash" | "value">;
  receipt: Pick<TransactionReceipt, "status" | "blockNumber" | "logs">;
};

export type ConfirmedPonsBuy = {
  version: FactoryVersion;
  tokenAddress: string;
  marketAddress: string;
  buyerAddress: string;
  txHash: string;
  blockNumber: number;
  /** Sum of qualifying market→buyer token transfer amounts (decimal string). */
  tokenAmountRaw: string;
  qualifyingTransferCount: number;
};

export type DetectPonsBuyResult =
  | { ok: true; buy: ConfirmedPonsBuy }
  | { ok: false; reason: BuyRejectionReason; kind: "not_buy" }
  | { ok: false; reason: "unable_to_validate"; kind: "operational"; detail: string };

function decodeReceiptTransfer(log: TransactionReceipt["logs"][number]) {
  return decodeErc20TransferLog({
    address: log.address,
    topics: log.topics as string[],
    data: log.data,
    transactionHash: "0x" + "0".repeat(64), // unused for detection
    blockNumber: 0,
    logIndex: log.logIndex === null || log.logIndex === undefined ? 0 : Number(log.logIndex),
  });
}

/**
 * Strict detector matching research PonsBuy v0.
 * Operational inability (missing tx fields) is returned as operational.
 */
export function detectPonsBuyV0(input: DetectPonsBuyInput): DetectPonsBuyResult {
  const { tx, receipt } = input;

  if (receipt.status !== "success") {
    return { ok: false, kind: "not_buy", reason: "failed_transaction" };
  }

  if (!tx.from) {
    return {
      ok: false,
      kind: "operational",
      reason: "unable_to_validate",
      detail: "transaction missing from",
    };
  }

  if (isAddressEqual(tx.from as Address, zeroAddress)) {
    return { ok: false, kind: "not_buy", reason: "zero_buyer" };
  }

  const buyer = normalizeAddress(getAddress(tx.from));
  const token = normalizeAddress(input.tokenAddress);
  const market = normalizeAddress(input.marketAddress);

  let sawTokenLog = false;
  let sawFromMarket = false;
  let sawToBuyer = false;
  let malformed = false;

  type Qual = { amount: bigint; logIndex: number };
  const qualifying: Qual[] = [];

  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== token) continue;
    if (
      !log.topics[0] ||
      log.topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC.toLowerCase()
    ) {
      continue;
    }
    sawTokenLog = true;
    const decoded = decodeReceiptTransfer(log);
    if (!decoded) {
      malformed = true;
      continue;
    }
    if (decoded.from === market) sawFromMarket = true;
    if (decoded.to === buyer) sawToBuyer = true;

    if (
      decoded.from === market &&
      decoded.to === buyer &&
      decoded.amount > BigInt(0)
    ) {
      qualifying.push({
        amount: decoded.amount,
        logIndex: decoded.logIndex,
      });
    }
  }

  if (malformed && qualifying.length === 0) {
    return { ok: false, kind: "not_buy", reason: "malformed_transfer" };
  }

  if (qualifying.length === 0) {
    if (sawTokenLog && !sawFromMarket) {
      return { ok: false, kind: "not_buy", reason: "token_not_from_known_market" };
    }
    if (sawTokenLog && sawFromMarket && !sawToBuyer) {
      return { ok: false, kind: "not_buy", reason: "token_recipient_not_tx_from" };
    }
    if (sawTokenLog) {
      return { ok: false, kind: "not_buy", reason: "zero_amount" };
    }
    return { ok: false, kind: "not_buy", reason: "token_not_from_known_market" };
  }

  let tokenSum = BigInt(0);
  for (const q of qualifying) tokenSum += q.amount;

  return {
    ok: true,
    buy: {
      version: input.version,
      tokenAddress: token,
      marketAddress: market,
      buyerAddress: buyer,
      txHash: normalizeTxHash(tx.hash as Hash),
      blockNumber: Number(receipt.blockNumber),
      tokenAmountRaw: tokenSum.toString(),
      qualifyingTransferCount: qualifying.length,
    },
  };
}

/** Pre-tx candidate filter (getLogs path): market→wallet, amount>0. */
export function isMarketToWalletCandidate(input: {
  transferFrom: string;
  transferTo: string;
  amount: bigint;
  marketAddress: string;
}): boolean {
  if (input.amount <= BigInt(0)) return false;
  return (
    normalizeAddress(input.transferFrom) ===
      normalizeAddress(input.marketAddress) &&
    Boolean(input.transferTo)
  );
}

export type { Hex };
