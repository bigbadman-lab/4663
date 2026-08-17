/**
 * Candidate B evaluation + fire RPC for POOLS Instant continuation.
 * Reuses the same source-neutral math as PONS (src/lib/pons/continuation.ts).
 * Burst / pons_buying_activity is not required for Candidate B.
 */

import {
  countContinuationBuckets,
  isContinuationRuleSatisfied,
} from "@/lib/pons/continuation";
import { workerLog } from "@/lib/worker/log";
import { normalizeAddress } from "@/lib/worker/normalize";
import { callFirePoolsBuyerContinuation } from "@/lib/worker/repositories/lifecycle";
import {
  removePoolsFromContinuationWatch,
  type PoolsWatchedLaunch,
  type PoolsWorkerMemory,
} from "@/lib/worker/pools/state";
import type { WorkerSupabase } from "@/lib/worker/supabase";
import type { ContinuationEvalResult } from "@/lib/worker/pons/continuation-eval";

function firstBuyTimestamps(
  memory: PoolsWorkerMemory,
  tokenAddress: string,
): number[] {
  const rolling = memory.rollingFirstBuyers.get(tokenAddress) ?? [];
  return rolling.map((r) => r.firstBuyBlockTimestamp);
}

export function ramPoolsContinuationEligible(
  memory: PoolsWorkerMemory,
  token: PoolsWatchedLaunch,
): boolean {
  const addr = token.tokenAddress;
  if (memory.continuationResolved.has(addr)) return false;
  const counts = countContinuationBuckets(
    firstBuyTimestamps(memory, addr),
    token.launchTimestamp,
  );
  return isContinuationRuleSatisfied(counts);
}

export async function tryFirePoolsBuyerContinuation(input: {
  supabase: WorkerSupabase;
  chainId: number;
  memory: PoolsWorkerMemory;
  token: PoolsWatchedLaunch;
  evaluationTimestampUnix: number;
  evaluationBlockNumber: number;
}): Promise<ContinuationEvalResult> {
  const {
    supabase,
    chainId,
    memory,
    token,
    evaluationTimestampUnix: T,
    evaluationBlockNumber,
  } = input;
  const addr = normalizeAddress(token.tokenAddress);

  const empty: ContinuationEvalResult = {
    attempted: false,
    fired: false,
    alreadyFired: false,
    notEligible: false,
    removedFromWatch: false,
  };

  if (memory.continuationResolved.has(addr)) return empty;
  if (!ramPoolsContinuationEligible(memory, token)) return empty;

  const evaluationTimestampIso = new Date(T * 1000).toISOString();
  const fire = await callFirePoolsBuyerContinuation(supabase, {
    chainId,
    tokenAddress: addr,
    evaluationTimestampIso,
    evaluationBlockNumber,
  });

  if (fire.status === "fired") {
    workerLog(
      `pools continuation fired token=${addr} contBuyers=${fire.newBuyers} age=${fire.tokenAgeSeconds}s block=${evaluationBlockNumber}`,
    );
    removePoolsFromContinuationWatch(memory, addr, { markResolved: true });
    memory.continuationResolved.add(addr);
    return {
      attempted: true,
      fired: true,
      alreadyFired: false,
      notEligible: false,
      removedFromWatch: true,
    };
  }

  if (fire.status === "already_fired") {
    removePoolsFromContinuationWatch(memory, addr, { markResolved: true });
    memory.continuationResolved.add(addr);
    return {
      attempted: true,
      fired: false,
      alreadyFired: true,
      notEligible: false,
      removedFromWatch: true,
    };
  }

  return {
    attempted: true,
    fired: false,
    alreadyFired: false,
    notEligible: true,
    removedFromWatch: false,
  };
}
