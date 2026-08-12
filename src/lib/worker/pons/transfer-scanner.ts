/**
 * ACTIVE-token Transfer scanner + first-buyer pipeline (Stage 5).
 * No event evaluation / fire / expiry.
 */

import {
  detectPonsBuyV0,
  isMarketToWalletCandidate,
} from "@/lib/pons/buy-validation";
import {
  decodeErc20TransferLog,
  ERC20_TRANSFER_TOPIC,
  type DecodedTransferLog,
} from "@/lib/pons/transfer/decode";
import type { WorkerMemoryModel } from "@/lib/pons/types";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import {
  TRANSFER_ADDRESS_BATCH_SIZE,
  TRANSFER_SCAN_INITIAL_CHUNK_BLOCKS,
  TRANSFER_SCAN_MAX_CHUNK_BLOCKS,
  TRANSFER_SCAN_MIN_CHUNK_BLOCKS,
  TRANSFER_SCAN_RATE_LIMIT_RETRIES,
  TRANSFER_SCAN_REQUEST_DELAY_MS,
} from "@/lib/worker/constants";
import { workerLog } from "@/lib/worker/log";
import { normalizeAddress } from "@/lib/worker/normalize";
import { tryFireBuyerContinuation } from "@/lib/worker/pons/continuation-eval";
import {
  insertFirstBuyerIdempotent,
} from "@/lib/worker/repositories/first-buyers";
import {
  addFirstBuyerToMemory,
  getWatchedToken,
  watchedTokensForScan,
} from "@/lib/worker/state";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type TransferScanMetrics = {
  fromBlock: number;
  toBlock: number;
  activeTokensEligible: number;
  transferLogs: number;
  marketToWalletCandidates: number;
  txValidations: number;
  newFirstBuyers: number;
  alreadyKnownBuyers: number;
  notBuys: number;
  fullyProcessed: boolean;
  failures: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("too many requests") ||
    m.includes("rate limit") ||
    m.includes("compute units")
  );
}

function isRangeError(message: string): boolean {
  if (isRateLimitError(message)) return false;
  const m = message.toLowerCase();
  return (
    m.includes("block range") ||
    m.includes("block request") ||
    m.includes("free tier") ||
    m.includes("10 block") ||
    m.includes("response size") ||
    m.includes("too many results") ||
    m.includes("query returned more than") ||
    m.includes("-32005") ||
    m.includes("-32600") ||
    m.includes("-32602")
  );
}

function parseSuggestedMaxBlocks(message: string): number | null {
  const m =
    message.match(/up to a (\d+)\s*block/i) ??
    message.match(/maximum (?:of )?(\d+) blocks?/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getLogsChunkWithRetry(
  rpc: ChainRpc,
  addresses: string[],
  fromBlock: number,
  toBlock: number,
): Promise<Awaited<ReturnType<ChainRpc["getLogs"]>>> {
  let attempt = 0;
  for (;;) {
    try {
      if (TRANSFER_SCAN_REQUEST_DELAY_MS > 0) {
        await sleep(TRANSFER_SCAN_REQUEST_DELAY_MS);
      }
      return await rpc.getLogs({
        address: addresses,
        fromBlock,
        toBlock,
        topic0: ERC20_TRANSFER_TOPIC,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRateLimitError(msg) || attempt >= TRANSFER_SCAN_RATE_LIMIT_RETRIES) {
        throw err;
      }
      await sleep(Math.min(30_000, 500 * 2 ** attempt));
      attempt += 1;
    }
  }
}

async function fetchTransferLogsAdaptive(
  rpc: ChainRpc,
  addresses: string[],
  fromBlock: number,
  toBlock: number,
): Promise<Awaited<ReturnType<ChainRpc["getLogs"]>>> {
  if (addresses.length === 0) return [];

  const out: Awaited<ReturnType<ChainRpc["getLogs"]>> = [];
  let cursor = fromBlock;
  let chunkSize: number = TRANSFER_SCAN_INITIAL_CHUNK_BLOCKS;
  let hardMax: number | null = null;

  while (cursor <= toBlock) {
    if (hardMax !== null && chunkSize > hardMax) chunkSize = hardMax;
    const end = Math.min(cursor + chunkSize - 1, toBlock);
    try {
      const logs = await getLogsChunkWithRetry(rpc, addresses, cursor, end);
      out.push(...logs);
      cursor = end + 1;
      if (chunkSize < TRANSFER_SCAN_MAX_CHUNK_BLOCKS) {
        const cap = hardMax ?? TRANSFER_SCAN_MAX_CHUNK_BLOCKS;
        chunkSize = Math.min(chunkSize * 2, cap);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRateLimitError(msg) || !isRangeError(msg) || chunkSize <= TRANSFER_SCAN_MIN_CHUNK_BLOCKS) {
        throw err;
      }
      const suggested = parseSuggestedMaxBlocks(msg);
      if (suggested !== null) hardMax = suggested;
      chunkSize =
        suggested !== null && suggested < chunkSize
          ? suggested
          : Math.max(TRANSFER_SCAN_MIN_CHUNK_BLOCKS, Math.floor(chunkSize / 2));
    }
  }
  return out;
}

function chunkAddresses(addresses: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < addresses.length; i += size) {
    out.push(addresses.slice(i, i + size));
  }
  return out;
}

/**
 * Scan Transfer logs for ACTIVE tokens in [fromBlock, toBlock].
 * Does not advance cursors — caller enforces factory-order + commits cursor.
 */
export async function scanTransferRange(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  memory: WorkerMemoryModel;
  fromBlock: number;
  toBlock: number;
}): Promise<TransferScanMetrics> {
  const { rpc, supabase, chainId, memory, fromBlock, toBlock } = input;
  if (fromBlock > toBlock) {
    throw new Error(`invalid transfer range ${fromBlock}-${toBlock}`);
  }

  const failures: string[] = [];
  let transferLogs = 0;
  let marketToWalletCandidates = 0;
  let txValidations = 0;
  let newFirstBuyers = 0;
  let alreadyKnownBuyers = 0;
  let notBuys = 0;

  // ACTIVE ∪ continuation-watch tokens that exist by the end of this range.
  const eligible = watchedTokensForScan(memory).filter(
    (t) => t.launchBlock <= toBlock,
  );
  const eligibleMap = new Map(
    eligible.map((t) => [normalizeAddress(t.tokenAddress), t]),
  );

  if (eligible.length === 0) {
    return {
      fromBlock,
      toBlock,
      activeTokensEligible: 0,
      transferLogs: 0,
      marketToWalletCandidates: 0,
      txValidations: 0,
      newFirstBuyers: 0,
      alreadyKnownBuyers: 0,
      notBuys: 0,
      fullyProcessed: true,
      failures: [],
    };
  }

  const addresses = eligible.map((t) => t.tokenAddress);
  const batches = chunkAddresses(addresses, TRANSFER_ADDRESS_BATCH_SIZE);
  const rawLogs: Awaited<ReturnType<ChainRpc["getLogs"]>> = [];

  for (const batch of batches) {
    const part = await fetchTransferLogsAdaptive(
      rpc,
      batch,
      fromBlock,
      toBlock,
    );
    rawLogs.push(...part);
  }

  const decoded: DecodedTransferLog[] = [];
  for (const log of rawLogs) {
    const d = decodeErc20TransferLog(log);
    if (!d) continue;
    const token = eligibleMap.get(d.tokenAddress);
    if (!token) continue;
    // Launch-block safety: ignore pre-launch logs if provider returned them.
    if (d.blockNumber < token.launchBlock) continue;
    if (d.blockNumber < fromBlock || d.blockNumber > toBlock) continue;
    decoded.push(d);
  }

  transferLogs = decoded.length;
  decoded.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    if (a.transactionHash !== b.transactionHash) {
      return a.transactionHash.localeCompare(b.transactionHash);
    }
    return a.logIndex - b.logIndex;
  });

  const blockTsCache = new Map<number, number>();
  const getBlockTs = async (blockNumber: number) => {
    const hit = blockTsCache.get(blockNumber);
    if (hit !== undefined) return hit;
    const b = await rpc.getBlock(blockNumber);
    blockTsCache.set(blockNumber, b.timestamp);
    return b.timestamp;
  };

  // Per-range wallet state for unseen wallets:
  // confirmed (success) | still-unconfirmed-failed-at-least-once (may retry other txs)
  // Pending in-flight tx validation keyed by token+wallet to avoid redundant parallel validation
  // of same wallet while first attempt runs — sequential loop avoids true parallelism.

  /** Wallets confirmed this range (also synced to memory). */
  const confirmedThisRange = new Set<string>();
  /** token:wallet already attempted for a given tx hash */
  const attemptedTx = new Set<string>();

  for (const d of decoded) {
    const token = eligibleMap.get(d.tokenAddress);
    if (!token) continue;

    if (
      !isMarketToWalletCandidate({
        transferFrom: d.from,
        transferTo: d.to,
        amount: d.amount,
        marketAddress: token.marketAddress,
      })
    ) {
      continue;
    }

    marketToWalletCandidates += 1;
    const wallet = normalizeAddress(d.to);
    const pairKey = `${d.tokenAddress}:${wallet}`;

    const confirmed =
      memory.confirmedBuyers.get(d.tokenAddress)?.has(wallet) ||
      confirmedThisRange.has(pairKey);
    if (confirmed) {
      // First-wallet optimisation: no eth_getTransaction*
      continue;
    }

    const attemptKey = `${pairKey}:${d.transactionHash}`;
    if (attemptedTx.has(attemptKey)) continue;
    attemptedTx.add(attemptKey);

    // If we already confirmed this wallet earlier in the range, skip (handled above).
    // Failed earlier on different txs: still allow this candidate.

    try {
      txValidations += 1;
      const [tx, receipt] = await Promise.all([
        rpc.getTransaction(d.transactionHash),
        rpc.getTransactionReceipt(d.transactionHash),
      ]);

      const result = detectPonsBuyV0({
        version: token.factoryVersion,
        tokenAddress: token.tokenAddress,
        marketAddress: token.marketAddress,
        tx: {
          from: tx.from as `0x${string}`,
          hash: tx.hash as `0x${string}`,
          value: tx.value,
        },
        receipt,
      });

      if (!result.ok) {
        if (result.kind === "operational") {
          failures.push(
            `tx ${d.transactionHash}: operational ${result.detail}`,
          );
          break;
        }
        notBuys += 1;
        continue;
      }

      const buy = result.buy;
      // Prefer candidate transfer block time; receipt block should match.
      const tsUnix = await getBlockTs(buy.blockNumber);
      const insert = await insertFirstBuyerIdempotent(supabase, {
        chainId,
        tokenAddress: buy.tokenAddress,
        walletAddress: buy.buyerAddress,
        firstBuyTxHash: buy.txHash,
        firstBuyBlockNumber: buy.blockNumber,
        firstBuyBlockTimestampIso: new Date(tsUnix * 1000).toISOString(),
      });

      if (insert.outcome === "inserted") {
        newFirstBuyers += 1;
        workerLog(
          `first buyer ${buy.tokenAddress.slice(0, 10)}… wallet=${buy.buyerAddress} block=${buy.blockNumber}`,
        );
      } else {
        alreadyKnownBuyers += 1;
      }

      // Reconstruct earliest time for RAM rolling list from durable row when known.
      const existingTs =
        insert.outcome === "already_exists"
          ? Math.floor(
              new Date(insert.row.firstBuyBlockTimestamp).getTime() / 1000,
            )
          : tsUnix;

      addFirstBuyerToMemory(memory, {
        tokenAddress: buy.tokenAddress,
        walletAddress: buy.buyerAddress,
        firstBuyBlockTimestampUnix: existingTs,
      });
      confirmedThisRange.add(pairKey);

      // Candidate B: fire immediately when the second continuation buyer lands.
      if (insert.outcome === "inserted") {
        const watched = getWatchedToken(memory, buy.tokenAddress);
        if (watched) {
          try {
            await tryFireBuyerContinuation({
              supabase,
              chainId,
              memory,
              token: watched,
              evaluationTimestampUnix: existingTs,
              evaluationBlockNumber: buy.blockNumber,
            });
          } catch (contErr) {
            const cmsg =
              contErr instanceof Error ? contErr.message : String(contErr);
            workerLog(
              `CONTINUATION FIRE OPERATIONAL FAIL token=${buy.tokenAddress}: ${cmsg}`,
            );
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`tx ${d.transactionHash}: ${msg}`);
      // Operational failure — stop range processing; do not advance cursor.
      break;
    }
  }

  return {
    fromBlock,
    toBlock,
    activeTokensEligible: eligible.length,
    transferLogs,
    marketToWalletCandidates,
    txValidations,
    newFirstBuyers,
    alreadyKnownBuyers,
    notBuys,
    fullyProcessed: failures.length === 0,
    failures,
  };
}
