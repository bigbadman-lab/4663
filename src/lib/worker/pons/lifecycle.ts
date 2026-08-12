/**
 * Chain-time lifecycle evaluation: fire candidates (RAM screen) + durable RPC,
 * then expire past watch TTL. Never uses wall clock as semantic authority.
 *
 * Stage 11B: burst fire no longer ends all observation — tokens under age 300
 * move to continuationWatch for Candidate B (pons_buyer_continuation).
 */

import {
  EVENT_AGE_FLOOR_SECONDS,
  EVENT_NEW_BUYERS_THRESHOLD,
  EVENT_WINDOW_SECONDS,
  TOKEN_WATCH_TTL_SECONDS,
} from "@/lib/pons/constants";
import {
  defaultFireEligibility,
  isExpireEligible,
  isInsideInclusiveWindow,
  tokenAgeSeconds,
} from "@/lib/pons/eligibility";
import type { WorkerMemoryModel } from "@/lib/pons/types";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import { workerLog } from "@/lib/worker/log";
import { normalizeAddress } from "@/lib/worker/normalize";
import {
  markActivePastContinuationWindow,
  pruneContinuationWatchByAge,
  tryFireBuyerContinuation,
} from "@/lib/worker/pons/continuation-eval";
import {
  callExpirePonsLaunch,
  callFirePonsBuyingActivity,
} from "@/lib/worker/repositories/lifecycle";
import {
  moveActiveToContinuationWatch,
} from "@/lib/worker/state";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type LifecycleEvaluationResult = {
  evaluationBlockNumber: number;
  evaluationTimestampUnix: number;
  fireAttempts: number;
  fired: number;
  alreadyFired: number;
  notEligible: number;
  /** Operational fire failures; token kept ACTIVE for retry (must not expire away). */
  fireOperationalFailures: number;
  expired: number;
  expireBlocked: number;
  continuationFireAttempts: number;
  continuationFired: number;
  continuationWatchPruned: number;
};

export function removeTokenFromWatch(
  memory: WorkerMemoryModel,
  tokenAddress: string,
): void {
  const token = normalizeAddress(tokenAddress);
  memory.activeTokens.delete(token);
  memory.continuationWatch.delete(token);
  memory.confirmedBuyers.delete(token);
  memory.rollingFirstBuyers.delete(token);
}

function pruneRollingTimestamps(
  memory: WorkerMemoryModel,
  tokenAddress: string,
  evaluationUnix: number,
): number[] {
  const rolling = memory.rollingFirstBuyers.get(tokenAddress) ?? [];
  return rolling
    .filter((r) =>
      isInsideInclusiveWindow(
        r.firstBuyBlockTimestamp,
        evaluationUnix,
        EVENT_WINDOW_SECONDS,
      ),
    )
    .sort((a, b) => {
      if (a.firstBuyBlockTimestamp !== b.firstBuyBlockTimestamp) {
        return a.firstBuyBlockTimestamp - b.firstBuyBlockTimestamp;
      }
      return a.walletAddress.localeCompare(b.walletAddress);
    })
    .map((r) => r.firstBuyBlockTimestamp);
}

/**
 * Evaluate all ACTIVE tokens at chain evaluation time T.
 * RAM rolling queues are a cheap candidate screen; fire uses durable RPC recompute.
 *
 * Order per token: fire attempt (if RAM eligible) before expiry.
 * Operational fire failure blocks expiry for that token this cycle.
 *
 * After ACTIVE pass: prune continuation watch by age and attempt Candidate B
 * for remaining continuation + ACTIVE-under-300 tokens.
 */
export async function evaluateTokenLifecycle(input: {
  supabase: WorkerSupabase;
  chainId: number;
  memory: WorkerMemoryModel;
  evaluationBlockNumber: number;
  evaluationTimestampUnix: number;
}): Promise<LifecycleEvaluationResult> {
  const {
    supabase,
    chainId,
    memory,
    evaluationBlockNumber,
    evaluationTimestampUnix: T,
  } = input;

  const evaluationTimestampIso = new Date(T * 1000).toISOString();
  const result: LifecycleEvaluationResult = {
    evaluationBlockNumber,
    evaluationTimestampUnix: T,
    fireAttempts: 0,
    fired: 0,
    alreadyFired: 0,
    notEligible: 0,
    fireOperationalFailures: 0,
    expired: 0,
    expireBlocked: 0,
    continuationFireAttempts: 0,
    continuationFired: 0,
    continuationWatchPruned: 0,
  };

  const tokens = [...memory.activeTokens.values()];

  for (const token of tokens) {
    const addr = token.tokenAddress;
    const prunedTimestamps = pruneRollingTimestamps(memory, addr, T);
    const age = tokenAgeSeconds(T, token.launchTimestamp);

    let fireOperationalFail = false;
    let leftActive = false;

    const ramEligible = defaultFireEligibility(
      token.launchTimestamp,
      T,
      prunedTimestamps,
    );

    if (ramEligible) {
      result.fireAttempts += 1;
      try {
        const fire = await callFirePonsBuyingActivity(supabase, {
          chainId,
          tokenAddress: addr,
          evaluationTimestampIso,
          evaluationBlockNumber,
          windowSeconds: EVENT_WINDOW_SECONDS,
          ageFloorSeconds: EVENT_AGE_FLOOR_SECONDS,
          watchTtlSeconds: TOKEN_WATCH_TTL_SECONDS,
          threshold: EVENT_NEW_BUYERS_THRESHOLD,
        });

        if (fire.status === "fired") {
          result.fired += 1;
          workerLog(
            `event fired token=${addr} buyers=${fire.newBuyers} age=${fire.tokenAgeSeconds}s block=${evaluationBlockNumber}`,
          );
          moveActiveToContinuationWatch(memory, addr, T);
          leftActive = true;
        } else if (fire.status === "already_fired") {
          result.alreadyFired += 1;
          moveActiveToContinuationWatch(memory, addr, T);
          leftActive = true;
        } else if (fire.status === "already_expired") {
          removeTokenFromWatch(memory, addr);
          leftActive = true;
        } else {
          result.notEligible += 1;
        }
      } catch (err) {
        fireOperationalFail = true;
        result.fireOperationalFailures += 1;
        const msg = err instanceof Error ? err.message : String(err);
        workerLog(`FIRE OPERATIONAL FAIL token=${addr}: ${msg}`);
      }
    }

    if (leftActive) continue;

    if (fireOperationalFail) {
      // Keep ACTIVE for retry — never expire a potentially genuine event.
      continue;
    }

    // Past inclusive 60m boundary: expire if still active.
    if (isExpireEligible(T, token.launchTimestamp)) {
      try {
        const exp = await callExpirePonsLaunch(supabase, {
          chainId,
          tokenAddress: addr,
          evaluationTimestampIso,
        });
        if (exp.status === "expired") {
          result.expired += 1;
          workerLog(
            `token expired ${addr} age=${age}s block=${evaluationBlockNumber}`,
          );
          removeTokenFromWatch(memory, addr);
        } else if (exp.status === "already_fired") {
          result.alreadyFired += 1;
          moveActiveToContinuationWatch(memory, addr, T);
        } else if (exp.status === "already_expired") {
          removeTokenFromWatch(memory, addr);
        } else {
          result.expireBlocked += 1;
        }
      } catch (err) {
        result.expireBlocked += 1;
        const msg = err instanceof Error ? err.message : String(err);
        workerLog(`EXPIRE OPERATIONAL FAIL token=${addr}: ${msg}`);
      }
    }
  }

  // Continuation watch age prune + Candidate B for ACTIVE ∪ continuationWatch.
  result.continuationWatchPruned = pruneContinuationWatchByAge(memory, T);
  markActivePastContinuationWindow(memory, T);

  const continuationCandidates = [
    ...memory.activeTokens.values(),
    ...memory.continuationWatch.values(),
  ];
  const seen = new Set<string>();
  for (const token of continuationCandidates) {
    const addr = token.tokenAddress;
    if (seen.has(addr)) continue;
    seen.add(addr);
    if (memory.continuationResolved.has(addr)) continue;

    try {
      const cont = await tryFireBuyerContinuation({
        supabase,
        chainId,
        memory,
        token,
        evaluationTimestampUnix: T,
        evaluationBlockNumber,
      });
      if (cont.attempted) result.continuationFireAttempts += 1;
      if (cont.fired) result.continuationFired += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      workerLog(`CONTINUATION FIRE OPERATIONAL FAIL token=${addr}: ${msg}`);
    }
  }

  return result;
}

/**
 * Resolve evaluation chain time from a safely processed block number,
 * then run lifecycle evaluation.
 */
export async function evaluateLifecycleAtProcessedBlock(input: {
  rpc: ChainRpc;
  supabase: WorkerSupabase;
  chainId: number;
  memory: WorkerMemoryModel;
  evaluationBlockNumber: number;
}): Promise<LifecycleEvaluationResult> {
  const block = await input.rpc.getBlock(input.evaluationBlockNumber);
  return evaluateTokenLifecycle({
    supabase: input.supabase,
    chainId: input.chainId,
    memory: input.memory,
    evaluationBlockNumber: block.number,
    evaluationTimestampUnix: block.timestamp,
  });
}
