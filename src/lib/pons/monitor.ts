/**
 * Public read-model: live PONS launches currently under worker watch.
 * Presentation only — does not alter Candidate B / fire RPC / worker behaviour.
 *
 * Includes:
 * - status=active (burst watch)
 * - status=fired still inside the continuation age window, without a
 *   pons_buyer_continuation event yet
 */

import {
  CHAIN_ID,
  CONTINUATION_WATCH_END_SECONDS,
  EVENT_TYPE_PONS_BUYER_CONTINUATION,
  WORKER_NAME,
} from "@/lib/pons/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Max rows returned to the monitoring terminal. */
export const PONS_MONITOR_LIMIT = 15 as const;

/** Over-fetch before merge/cap so boundary filters still fill the limit. */
export const PONS_MONITOR_FETCH_MULTIPLIER = 3 as const;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const VERSION_RE = /^(v1|v2)$/;

export type PonsMonitorItemStatus = "watching" | "activity";

export type PonsMonitorItem = {
  tokenAddress: string;
  marketAddress: string | null;
  version: "v1" | "v2" | null;
  launchBlock: number | null;
  launchTimestamp: string | null;
  firstBuyerCount: number;
  /**
   * watching = status active (burst window).
   * activity = status fired, still in continuation window (buying activity
   * already fired; continuation not yet resolved).
   */
  status: PonsMonitorItemStatus;
};

export type PonsMonitorResponse = {
  generatedAt: string;
  chainId: number;
  /** Latest chain head from worker_health when available. */
  chainHead: number | null;
  activeCount: number;
  items: PonsMonitorItem[];
};

export type LoadPonsMonitorResult =
  | { ok: true; body: PonsMonitorResponse }
  | { ok: false; error: "monitor_unavailable" };

type ProductionBoundary = {
  productionStartBlock: number;
  observationStartBlock: number | null;
};

type RawLaunchRow = {
  token_address?: unknown;
  market_address?: unknown;
  factory_version?: unknown;
  launch_block_number?: unknown;
  launch_block_timestamp?: unknown;
  status?: unknown;
};

type NormalizedLaunch = {
  tokenAddress: string;
  marketAddress: string | null;
  version: "v1" | "v2" | null;
  launchBlock: number | null;
  launchTimestamp: string | null;
  launchMs: number;
  dbStatus: "active" | "fired";
};

function asProductionStartBlock(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    if (!Number.isInteger(value)) return null;
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    const n = Number(value.trim());
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

function asNullableBlock(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return asProductionStartBlock(value);
}

function asBlockNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  return null;
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeMarketAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!ADDRESS_RE.test(normalized)) return null;
  return normalized;
}

function normalizeVersion(value: unknown): "v1" | "v2" | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!VERSION_RE.test(v)) return null;
  return v as "v1" | "v2";
}

export function normalizePonsMonitorLaunchRow(
  row: unknown,
): NormalizedLaunch | null {
  if (row === null || row === undefined) return null;
  if (typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as RawLaunchRow;
  if (r.status !== "active" && r.status !== "fired") return null;
  if (typeof r.token_address !== "string") return null;
  const tokenAddress = r.token_address.trim().toLowerCase();
  if (!ADDRESS_RE.test(tokenAddress)) return null;
  const launchTimestamp = toIso(r.launch_block_timestamp);
  if (launchTimestamp === null) return null;
  const launchMs = Date.parse(launchTimestamp);
  if (Number.isNaN(launchMs)) return null;
  return {
    tokenAddress,
    marketAddress: normalizeMarketAddress(r.market_address),
    version: normalizeVersion(r.factory_version),
    launchBlock: asBlockNumber(r.launch_block_number),
    launchTimestamp,
    launchMs,
    dbStatus: r.status,
  };
}

export function comparePonsMonitorLaunches(
  a: Pick<NormalizedLaunch, "launchMs" | "tokenAddress">,
  b: Pick<NormalizedLaunch, "launchMs" | "tokenAddress">,
): number {
  if (a.launchMs !== b.launchMs) return b.launchMs - a.launchMs;
  return a.tokenAddress < b.tokenAddress
    ? -1
    : a.tokenAddress > b.tokenAddress
      ? 1
      : 0;
}

export function mapLaunchToMonitorItem(
  launch: NormalizedLaunch,
  firstBuyerCount: number,
): PonsMonitorItem {
  return {
    tokenAddress: launch.tokenAddress,
    marketAddress: launch.marketAddress,
    version: launch.version,
    launchBlock: launch.launchBlock,
    launchTimestamp: launch.launchTimestamp,
    firstBuyerCount: Math.max(0, Math.trunc(firstBuyerCount)),
    status: launch.dbStatus === "fired" ? "activity" : "watching",
  };
}

/** Wall-clock cutoff matching CONTINUATION_WATCH_END_SECONDS presentation approx. */
export function continuationWatchCutoffIso(nowMs: number): string {
  return new Date(
    nowMs - CONTINUATION_WATCH_END_SECONDS * 1000,
  ).toISOString();
}

async function loadBoundary(
  supabase: SupabaseClient,
): Promise<ProductionBoundary | null> {
  const { data, error } = await supabase
    .from("production_state")
    .select("production_start_block, observation_start_block")
    .eq("chain_id", CHAIN_ID)
    .maybeSingle();

  if (error || !data) return null;
  const productionStartBlock = asProductionStartBlock(
    (data as { production_start_block?: unknown }).production_start_block,
  );
  if (productionStartBlock === null) return null;
  return {
    productionStartBlock,
    observationStartBlock: asNullableBlock(
      (data as { observation_start_block?: unknown }).observation_start_block,
    ),
  };
}

async function loadChainHead(
  supabase: SupabaseClient,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("worker_health")
    .select("latest_chain_block")
    .eq("worker_name", WORKER_NAME)
    .maybeSingle();
  if (error || !data) return null;
  return asBlockNumber(
    (data as { latest_chain_block?: unknown }).latest_chain_block,
  );
}

async function loadContinuationResolvedTokens(
  supabase: SupabaseClient,
  tokenAddresses: string[],
): Promise<Set<string>> {
  const resolved = new Set<string>();
  if (tokenAddresses.length === 0) return resolved;

  const { data, error } = await supabase
    .from("events")
    .select("token_address")
    .eq("chain_id", CHAIN_ID)
    .eq("event_type", EVENT_TYPE_PONS_BUYER_CONTINUATION)
    .in("token_address", tokenAddresses);

  if (error) return resolved;
  for (const row of data ?? []) {
    if (!row || typeof row !== "object") continue;
    const addr = (row as { token_address?: unknown }).token_address;
    if (typeof addr !== "string") continue;
    const normalized = addr.trim().toLowerCase();
    if (ADDRESS_RE.test(normalized)) resolved.add(normalized);
  }
  return resolved;
}

async function loadFirstBuyerCounts(
  supabase: SupabaseClient,
  tokenAddresses: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (tokenAddresses.length === 0) return counts;

  const { data, error } = await supabase
    .from("pons_first_buyers")
    .select("token_address")
    .eq("chain_id", CHAIN_ID)
    .in("token_address", tokenAddresses);

  if (error) return counts;
  for (const row of data ?? []) {
    if (!row || typeof row !== "object") continue;
    const addr = (row as { token_address?: unknown }).token_address;
    if (typeof addr !== "string") continue;
    const normalized = addr.trim().toLowerCase();
    if (!ADDRESS_RE.test(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return counts;
}

const LAUNCH_SELECT =
  "token_address, market_address, factory_version, launch_block_number, launch_block_timestamp, status" as const;

type LaunchListResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

async function queryLaunches(
  supabase: SupabaseClient,
  opts: {
    status: "active" | "fired";
    boundary: ProductionBoundary;
    fetchLimit: number;
    launchTimestampAfterIso?: string;
  },
): Promise<LaunchListResult> {
  let query = supabase
    .from("pons_launches")
    .select(LAUNCH_SELECT)
    .eq("chain_id", CHAIN_ID)
    .eq("status", opts.status)
    .order("launch_block_timestamp", { ascending: false })
    .limit(opts.fetchLimit);

  if (opts.launchTimestampAfterIso) {
    query = query.gt("launch_block_timestamp", opts.launchTimestampAfterIso);
  }

  if (opts.boundary.observationStartBlock !== null) {
    query = query.gte(
      "launch_block_number",
      opts.boundary.observationStartBlock,
    );
  } else {
    query = query.gt(
      "launch_block_number",
      opts.boundary.productionStartBlock,
    );
  }

  const { data, error } = await query;
  return { data: (data as unknown[] | null) ?? null, error };
}

export async function loadPonsMonitor(
  supabase: SupabaseClient,
  nowMs: number = Date.now(),
  limit: number = PONS_MONITOR_LIMIT,
): Promise<LoadPonsMonitorResult> {
  const safeLimit = Math.min(PONS_MONITOR_LIMIT, Math.max(0, Math.trunc(limit)));
  const generatedAt = new Date(nowMs).toISOString();
  const fetchLimit = Math.max(safeLimit * PONS_MONITOR_FETCH_MULTIPLIER, 1);

  const boundary = await loadBoundary(supabase);
  if (!boundary) {
    return { ok: false, error: "monitor_unavailable" };
  }

  const cutoffIso = continuationWatchCutoffIso(nowMs);

  const [activeRes, firedRes, chainHead] = await Promise.all([
    queryLaunches(supabase, {
      status: "active",
      boundary,
      fetchLimit,
    }),
    queryLaunches(supabase, {
      status: "fired",
      boundary,
      fetchLimit,
      launchTimestampAfterIso: cutoffIso,
    }),
    loadChainHead(supabase),
  ]);

  if (activeRes.error || firedRes.error) {
    return { ok: false, error: "monitor_unavailable" };
  }

  const active: NormalizedLaunch[] = [];
  for (const row of activeRes.data ?? []) {
    const normalized = normalizePonsMonitorLaunchRow(row);
    if (normalized) active.push(normalized);
  }

  const firedRaw: NormalizedLaunch[] = [];
  for (const row of firedRes.data ?? []) {
    const normalized = normalizePonsMonitorLaunchRow(row);
    if (normalized) firedRaw.push(normalized);
  }

  const resolved = await loadContinuationResolvedTokens(
    supabase,
    firedRaw.map((row) => row.tokenAddress),
  );

  const firedStillWatching = firedRaw.filter(
    (row) => !resolved.has(row.tokenAddress),
  );

  const byToken = new Map<string, NormalizedLaunch>();
  for (const row of [...active, ...firedStillWatching]) {
    const existing = byToken.get(row.tokenAddress);
    if (!existing || comparePonsMonitorLaunches(row, existing) < 0) {
      byToken.set(row.tokenAddress, row);
    }
  }

  const merged = [...byToken.values()].sort(comparePonsMonitorLaunches);
  const top = merged.slice(0, safeLimit);
  const buyerCounts = await loadFirstBuyerCounts(
    supabase,
    top.map((row) => row.tokenAddress),
  );

  const items = top.map((row) =>
    mapLaunchToMonitorItem(row, buyerCounts.get(row.tokenAddress) ?? 0),
  );

  return {
    ok: true,
    body: {
      generatedAt,
      chainId: CHAIN_ID,
      chainHead,
      activeCount: merged.length,
      items,
    },
  };
}
