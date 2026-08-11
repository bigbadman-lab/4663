/**
 * V1 market multi-evidence resolution from launch receipt.
 * Ported from pons-data-lab/src/probes/build-launch-registry.ts resolveV1Market.
 */

import {
  decodeEventLog,
  getAddress,
  isAddressEqual,
  parseAbiItem,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  ERC20_TRANSFER_TOPIC,
  PONS_V1_FACTORY,
  RHC_WETH,
  V1_FACTORY_TOPIC0_A,
  V1_FACTORY_TOPIC0_B,
  V1_HELPER_MARKET_DATA_TOPIC0,
  V1_LAUNCH_HELPER,
} from "@/lib/pons/addresses";
import {
  bytecodeSize,
  extractDataWordAt,
  extractDataWords,
  isAddressShaped,
  topicToAddress,
} from "@/lib/pons/launch-discovery/topic-utils";
import type {
  CodeLookup,
  TransactionReceiptLike,
} from "@/lib/pons/launch-discovery/types";
import { normalizeAddress } from "@/lib/worker/normalize";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export type V1MarketResolution = {
  market: string | null;
  evidence: string[];
  candidates: { address: string; score: number; flags: string[] }[];
};

export async function resolveV1Market(
  receipt: TransactionReceiptLike,
  token: string,
  getCode: CodeLookup,
): Promise<V1MarketResolution> {
  const tokenNorm = normalizeAddress(token);
  type Cand = { address: string; flags: Set<string> };
  const cands = new Map<string, Cand>();

  const touch = (addr: string, flag: string) => {
    const n = normalizeAddress(addr);
    if (isAddressEqual(getAddress(n), zeroAddress)) return;
    if (n === tokenNorm) return;
    if (n === PONS_V1_FACTORY) return;
    if (n === RHC_WETH) return;
    if (n === V1_LAUNCH_HELPER) return;
    let c = cands.get(n);
    if (!c) {
      c = { address: n, flags: new Set() };
      cands.set(n, c);
    }
    c.flags.add(flag);
  };

  for (const log of receipt.logs) {
    touch(log.address, "receipt_log_emitter");

    for (let i = 1; i < log.topics.length; i++) {
      const t = log.topics[i];
      if (t && isAddressShaped(t)) touch(topicToAddress(t), `topic[${i}]`);
    }

    if (
      normalizeAddress(log.address) === V1_LAUNCH_HELPER &&
      log.topics[0]?.toLowerCase() === V1_HELPER_MARKET_DATA_TOPIC0.toLowerCase()
    ) {
      const w = extractDataWordAt(log.data, 1);
      if (w) touch(w, "helper_data_word_1_pattern");
    }

    if (normalizeAddress(log.address) === PONS_V1_FACTORY) {
      const t0 = log.topics[0]?.toLowerCase();
      if (
        t0 === V1_FACTORY_TOPIC0_B.toLowerCase() ||
        t0 === V1_FACTORY_TOPIC0_A.toLowerCase()
      ) {
        for (const a of extractDataWords(log.data)) {
          touch(a, "factory_event_data_word");
        }
      }
    }
  }

  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== tokenNorm) continue;
    if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC.toLowerCase()) {
      continue;
    }
    try {
      const decoded = decodeEventLog({
        abi: [TRANSFER_EVENT],
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "Transfer") continue;
      const args = decoded.args as { from: Address; to: Address };
      touch(getAddress(args.from), "token_transfer_from");
      touch(getAddress(args.to), "token_transfer_to");
    } catch {
      // ignore malformed transfer log
    }
  }

  const scored: { address: string; score: number; flags: string[] }[] = [];

  for (const c of cands.values()) {
    const code = await getCode(c.address);
    const size = bytecodeSize(code);
    if (size > 0) c.flags.add("has_bytecode");

    const flags = [...c.flags];
    let score = 0;
    if (c.flags.has("has_bytecode")) score += 2;
    if (c.flags.has("receipt_log_emitter")) score += 2;
    if (
      c.flags.has("token_transfer_from") ||
      c.flags.has("token_transfer_to")
    ) {
      score += 2;
    }
    if (c.flags.has("helper_data_word_1_pattern")) score += 3;
    if (c.flags.has("factory_event_data_word")) score += 2;

    scored.push({ address: c.address, score, flags });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.address.localeCompare(b.address),
  );

  const qualified = scored.filter((s) => {
    const f = new Set(s.flags);
    const structural =
      f.has("helper_data_word_1_pattern") || f.has("factory_event_data_word");
    return (
      f.has("has_bytecode") &&
      f.has("receipt_log_emitter") &&
      (f.has("token_transfer_from") || f.has("token_transfer_to")) &&
      structural
    );
  });

  if (qualified.length === 0) {
    return {
      market: null,
      evidence: [
        "no V1 candidate met multi-evidence threshold (bytecode+emitter+tokenTransfer+structural landmark)",
      ],
      candidates: scored.slice(0, 8),
    };
  }

  const top = qualified[0]!;
  const ties = qualified.filter((q) => q.score === top.score);
  if (ties.length > 1) {
    const withHelper = ties.filter((t) =>
      t.flags.includes("helper_data_word_1_pattern"),
    );
    if (withHelper.length === 1) {
      return {
        market: withHelper[0]!.address,
        evidence: [
          `selected among ${ties.length} top-score candidates via helper_data_word_1_pattern`,
          ...withHelper[0]!.flags,
        ],
        candidates: scored.slice(0, 8),
      };
    }
    return {
      market: null,
      evidence: [
        `ambiguous: ${ties.length} qualified candidates at score ${top.score}`,
      ],
      candidates: scored.slice(0, 8),
    };
  }

  return {
    market: top.address,
    evidence: [`score=${top.score}`, ...top.flags],
    candidates: scored.slice(0, 8),
  };
}
