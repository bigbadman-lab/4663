/**
 * On-demand RADAR token detail from stored Supabase data (no chain RPC).
 */

import {
  isProductionLaunchBlock,
  safeLaunchBlockFromPayload,
} from "@/lib/events/normalize";
import {
  CHAIN_ID,
  EVENT_SOURCE_PONS,
  EVENT_TYPE_PONS_BUYER_CONTINUATION,
} from "@/lib/pons/constants";
import {
  CONTINUATION_PRE_END_SECONDS,
  CONTINUATION_WINDOW_END_SECONDS,
} from "@/lib/pons/continuation";
import { isValidEvmAddress } from "@/lib/worker/env-address";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Max first-buyer rows returned in the investigation timeline. */
export const RADAR_TOKEN_DETAIL_BUYER_LIMIT = 40 as const;

export type RadarTimelineKind =
  | "token_launched"
  | "early_buyer"
  | "continuation_buyer"
  | "added_to_radar"
  | "later_buyer";

export type RadarTimelineEntry = {
  kind: RadarTimelineKind;
  label: string;
  at: string;
  ageSeconds: number | null;
  walletAddress: string | null;
  txHash: string | null;
  blockNumber: number | null;
};

export type RadarTokenDetail = {
  tokenAddress: string;
  marketAddress: string | null;
  factoryVersion: string | null;
  factoryAddress: string | null;
  launchTimestamp: string | null;
  launchBlockNumber: number | null;
  launchTxHash: string | null;
  eventId: string;
  continuationTimestamp: string;
  qualificationBlockNumber: number | null;
  qualificationTxHash: string | null;
  pre3mFirstBuyers: number;
  continuationFirstBuyers: number;
  totalFirstBuyers: number;
  timeline: RadarTimelineEntry[];
};

export type LoadRadarTokenDetailResult =
  | { ok: true; body: RadarTokenDetail }
  | { ok: false; error: "invalid_token" | "not_found" | "unavailable" };

function toIso(value: unknown): string | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) return null;
    return value.toISOString();
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function asBlock(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function asNonNeg(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  return null;
}

function ageSeconds(launchMs: number, atIso: string): number | null {
  const at = Date.parse(atIso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((at - launchMs) / 1000));
}

export function normalizeRadarTokenAddress(
  raw: string,
): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!isValidEvmAddress(trimmed)) return null;
  return trimmed;
}

type BuyerRow = {
  wallet: string;
  txHash: string;
  blockNumber: number | null;
  timestamp: string;
  ageSec: number;
};

/**
 * Build a bounded chronological timeline from launch + buyers + event.
 * Exported for unit tests.
 */
export function buildRadarTimeline(input: {
  launchTimestamp: string | null;
  launchTxHash: string | null;
  launchBlockNumber: number | null;
  buyers: readonly BuyerRow[];
  continuationTimestamp: string;
  qualificationTxHash: string | null;
  qualificationBlockNumber: number | null;
  buyerLimit?: number;
}): RadarTimelineEntry[] {
  const limit = input.buyerLimit ?? RADAR_TOKEN_DETAIL_BUYER_LIMIT;
  const launchMs = input.launchTimestamp
    ? Date.parse(input.launchTimestamp)
    : Number.NaN;
  const hasLaunch = Number.isFinite(launchMs);

  const timeline: RadarTimelineEntry[] = [];

  if (input.launchTimestamp) {
    timeline.push({
      kind: "token_launched",
      label: "TOKEN LAUNCHED",
      at: input.launchTimestamp,
      ageSeconds: 0,
      walletAddress: null,
      txHash: input.launchTxHash,
      blockNumber: input.launchBlockNumber,
    });
  }

  let earlyIndex = 0;
  let continuationIndex = 0;
  const sortedBuyers = [...input.buyers].sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return Date.parse(a.timestamp) - Date.parse(b.timestamp);
    }
    return a.txHash < b.txHash ? -1 : a.txHash > b.txHash ? 1 : 0;
  });

  let buyerShown = 0;
  for (const buyer of sortedBuyers) {
    if (buyerShown >= limit) break;
    const age = hasLaunch
      ? ageSeconds(launchMs, buyer.timestamp)
      : buyer.ageSec;
    if (age === null) continue;

    if (age < CONTINUATION_PRE_END_SECONDS) {
      earlyIndex += 1;
      timeline.push({
        kind: "early_buyer",
        label: earlyIndex === 1 ? "EARLY BUYER" : `EARLY BUYER #${earlyIndex}`,
        at: buyer.timestamp,
        ageSeconds: age,
        walletAddress: buyer.wallet,
        txHash: buyer.txHash,
        blockNumber: buyer.blockNumber,
      });
      buyerShown += 1;
    } else if (age < CONTINUATION_WINDOW_END_SECONDS) {
      continuationIndex += 1;
      timeline.push({
        kind: "continuation_buyer",
        label: `CONTINUATION BUYER #${continuationIndex}`,
        at: buyer.timestamp,
        ageSeconds: age,
        walletAddress: buyer.wallet,
        txHash: buyer.txHash,
        blockNumber: buyer.blockNumber,
      });
      buyerShown += 1;
    } else {
      timeline.push({
        kind: "later_buyer",
        label: "LATER FIRST BUYER",
        at: buyer.timestamp,
        ageSeconds: age,
        walletAddress: buyer.wallet,
        txHash: buyer.txHash,
        blockNumber: buyer.blockNumber,
      });
      buyerShown += 1;
    }
  }

  timeline.push({
    kind: "added_to_radar",
    label: "ADDED TO RADAR",
    at: input.continuationTimestamp,
    ageSeconds: hasLaunch
      ? ageSeconds(launchMs, input.continuationTimestamp)
      : null,
    walletAddress: null,
    txHash: input.qualificationTxHash,
    blockNumber: input.qualificationBlockNumber,
  });

  timeline.sort((a, b) => {
    const ta = Date.parse(a.at);
    const tb = Date.parse(b.at);
    if (ta !== tb) return ta - tb;
    if (a.kind === "token_launched") return -1;
    if (b.kind === "token_launched") return 1;
    if (a.kind === "added_to_radar") return 1;
    if (b.kind === "added_to_radar") return -1;
    return 0;
  });

  return timeline;
}

export async function loadRadarTokenDetail(
  supabase: SupabaseClient,
  tokenAddressRaw: string,
): Promise<LoadRadarTokenDetailResult> {
  const tokenAddress = normalizeRadarTokenAddress(tokenAddressRaw);
  if (!tokenAddress) {
    return { ok: false, error: "invalid_token" };
  }

  const { data: stateRow, error: stateError } = await supabase
    .from("production_state")
    .select("production_start_block")
    .eq("chain_id", CHAIN_ID)
    .maybeSingle();

  if (stateError) return { ok: false, error: "unavailable" };
  const productionStartBlock = (() => {
    const v = stateRow?.production_start_block;
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return BigInt(v);
    if (typeof v === "string" && /^[0-9]+$/.test(v.trim())) {
      try {
        return BigInt(v.trim());
      } catch {
        return null;
      }
    }
    return null;
  })();
  if (productionStartBlock === null) return { ok: false, error: "unavailable" };

  const [eventRes, launchRes, buyersRes] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, event_type, token_address, market_address, occurred_at, new_buyers, trigger_tx_hash, trigger_block_number, payload",
      )
      .eq("chain_id", CHAIN_ID)
      .eq("event_type", EVENT_TYPE_PONS_BUYER_CONTINUATION)
      .eq("source", EVENT_SOURCE_PONS)
      .eq("token_address", tokenAddress)
      .maybeSingle(),
    supabase
      .from("pons_launches")
      .select(
        "token_address, market_address, factory_version, factory_address, launch_block_number, launch_block_timestamp, launch_tx_hash",
      )
      .eq("chain_id", CHAIN_ID)
      .eq("token_address", tokenAddress)
      .maybeSingle(),
    supabase
      .from("pons_first_buyers")
      .select(
        "wallet_address, first_buy_tx_hash, first_buy_block_number, first_buy_block_timestamp",
      )
      .eq("chain_id", CHAIN_ID)
      .eq("token_address", tokenAddress)
      .order("first_buy_block_timestamp", { ascending: true })
      .order("first_buy_tx_hash", { ascending: true })
      .limit(RADAR_TOKEN_DETAIL_BUYER_LIMIT),
  ]);

  if (eventRes.error || launchRes.error || buyersRes.error) {
    return { ok: false, error: "unavailable" };
  }

  const event = eventRes.data;
  if (!event || typeof event !== "object") {
    return { ok: false, error: "not_found" };
  }

  const eventRecord = event as Record<string, unknown>;
  if (
    !isProductionLaunchBlock(eventRecord.payload, productionStartBlock) ||
    safeLaunchBlockFromPayload(eventRecord.payload) === null
  ) {
    return { ok: false, error: "not_found" };
  }

  const eventId =
    typeof eventRecord.id === "string" ? eventRecord.id.trim().toLowerCase() : "";
  const continuationTimestamp = toIso(eventRecord.occurred_at);
  if (!eventId || !continuationTimestamp) {
    return { ok: false, error: "unavailable" };
  }

  const payload =
    eventRecord.payload &&
    typeof eventRecord.payload === "object" &&
    !Array.isArray(eventRecord.payload)
      ? (eventRecord.payload as Record<string, unknown>)
      : {};

  const launch = launchRes.data as Record<string, unknown> | null;
  const launchTimestamp = launch ? toIso(launch.launch_block_timestamp) : null;
  const launchMs = launchTimestamp ? Date.parse(launchTimestamp) : Number.NaN;

  const buyers: BuyerRow[] = [];
  let pre3m = 0;
  let continuation = 0;

  for (const row of buyersRes.data ?? []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.wallet_address !== "string") continue;
    if (typeof r.first_buy_tx_hash !== "string") continue;
    const ts = toIso(r.first_buy_block_timestamp);
    if (!ts) continue;
    const wallet = r.wallet_address.trim().toLowerCase();
    const txHash = r.first_buy_tx_hash.trim().toLowerCase();
    if (!isValidEvmAddress(wallet)) continue;
    const ageSec = Number.isFinite(launchMs)
      ? Math.max(0, Math.floor((Date.parse(ts) - launchMs) / 1000))
      : 0;
    if (ageSec < CONTINUATION_PRE_END_SECONDS) pre3m += 1;
    else if (ageSec < CONTINUATION_WINDOW_END_SECONDS) continuation += 1;
    buyers.push({
      wallet,
      txHash,
      blockNumber: asBlock(r.first_buy_block_number),
      timestamp: ts,
      ageSec,
    });
  }

  const payloadPre = asNonNeg(payload.pre_3m_buyers);
  const payloadCont = asNonNeg(payload.continuation_buyers);
  const newBuyers = asNonNeg(eventRecord.new_buyers);

  const marketFromEvent =
    typeof eventRecord.market_address === "string" &&
    isValidEvmAddress(eventRecord.market_address)
      ? eventRecord.market_address.trim().toLowerCase()
      : null;
  const marketFromLaunch =
    launch &&
    typeof launch.market_address === "string" &&
    isValidEvmAddress(launch.market_address)
      ? launch.market_address.trim().toLowerCase()
      : null;

  const body: RadarTokenDetail = {
    tokenAddress,
    marketAddress: marketFromEvent ?? marketFromLaunch,
    factoryVersion:
      launch && typeof launch.factory_version === "string"
        ? launch.factory_version
        : typeof payload.factory_version === "string"
          ? payload.factory_version
          : null,
    factoryAddress:
      launch &&
      typeof launch.factory_address === "string" &&
      isValidEvmAddress(launch.factory_address)
        ? launch.factory_address.trim().toLowerCase()
        : null,
    launchTimestamp,
    launchBlockNumber: launch ? asBlock(launch.launch_block_number) : null,
    launchTxHash:
      launch && typeof launch.launch_tx_hash === "string"
        ? launch.launch_tx_hash.trim().toLowerCase()
        : null,
    eventId,
    continuationTimestamp,
    qualificationBlockNumber: asBlock(eventRecord.trigger_block_number),
    qualificationTxHash:
      typeof eventRecord.trigger_tx_hash === "string"
        ? eventRecord.trigger_tx_hash.trim().toLowerCase()
        : null,
    pre3mFirstBuyers: payloadPre ?? pre3m,
    continuationFirstBuyers: payloadCont ?? newBuyers ?? continuation,
    totalFirstBuyers: buyers.length,
    timeline: buildRadarTimeline({
      launchTimestamp,
      launchTxHash:
        launch && typeof launch.launch_tx_hash === "string"
          ? launch.launch_tx_hash.trim().toLowerCase()
          : null,
      launchBlockNumber: launch ? asBlock(launch.launch_block_number) : null,
      buyers,
      continuationTimestamp,
      qualificationTxHash:
        typeof eventRecord.trigger_tx_hash === "string"
          ? eventRecord.trigger_tx_hash.trim().toLowerCase()
          : null,
      qualificationBlockNumber: asBlock(eventRecord.trigger_block_number),
    }),
  };

  return { ok: true, body };
}
