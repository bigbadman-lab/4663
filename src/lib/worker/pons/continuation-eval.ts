/**
 * Candidate B evaluation + fire RPC for pons_buyer_continuation.
 */

import {
  countContinuationBuckets,
  isContinuationRuleSatisfied,
  isWithinContinuationWatch,
} from "@/lib/pons/continuation";
import type { ActiveTokenState, WorkerMemoryModel } from "@/lib/pons/types";
import { workerLog } from "@/lib/worker/log";
import { normalizeAddress } from "@/lib/worker/normalize";
import { callFirePonsBuyerContinuation } from "@/lib/worker/repositories/lifecycle";
import {
  removeFromContinuationWatch,
} from "@/lib/worker/state";
import type { WorkerSupabase } from "@/lib/worker/supabase";

export type ContinuationEvalResult = {
  attempted: boolean;
  fired: boolean;
  alreadyFired: boolean;
  notEligible: boolean;
  removedFromWatch: boolean;
};

function firstBuyTimestamps(
  memory: WorkerMemoryModel,
  tokenAddress: string,
): number[] {
  const rolling = memory.rollingFirstBuyers.get(tokenAddress) ?? [];
  return rolling.map((r) => r.firstBuyBlockTimestamp);
}

export function ramContinuationEligible(
  memory: WorkerMemoryModel,
  token: ActiveTokenState,
): boolean {
  const addr = token.tokenAddress;
  if (memory.continuationResolved.has(addr)) return false;
  const counts = countContinuationBuckets(
    firstBuyTimestamps(memory, addr),
    token.launchTimestamp,
  );
  return isContinuationRuleSatisfied(counts);
}

/**
 * Attempt durable continuation fire when RAM screen says Candidate B holds.
 * On fired/already_fired: mark resolved and drop continuation watch.
 */
export async function tryFireBuyerContinuation(input: {
  supabase: WorkerSupabase;
  chainId: number;
  memory: WorkerMemoryModel;
  token: ActiveTokenState;
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
  if (!ramContinuationEligible(memory, token)) return empty;

  const evaluationTimestampIso = new Date(T * 1000).toISOString();
  const fire = await callFirePonsBuyerContinuation(supabase, {
    chainId,
    tokenAddress: addr,
    evaluationTimestampIso,
    evaluationBlockNumber,
  });

  if (fire.status === "fired") {
    workerLog(
      `continuation fired token=${addr} contBuyers=${fire.newBuyers} age=${fire.tokenAgeSeconds}s block=${evaluationBlockNumber}`,
    );
    removeFromContinuationWatch(memory, addr, { markResolved: true });
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
    removeFromContinuationWatch(memory, addr, { markResolved: true });
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

/** Drop continuation watch when chain age reaches >= 300. */
export function pruneContinuationWatchByAge(
  memory: WorkerMemoryModel,
  evaluationUnix: number,
): number {
  let removed = 0;
  for (const [addr, token] of [...memory.continuationWatch.entries()]) {
    if (!isWithinContinuationWatch(evaluationUnix, token.launchTimestamp)) {
      removeFromContinuationWatch(memory, addr, { markResolved: true });
      removed += 1;
      workerLog(
        `continuation watch ended token=${addr} age>=${evaluationUnix - token.launchTimestamp}s`,
      );
    }
  }
  return removed;
}

/**
 * Mark ACTIVE tokens past continuation window as resolved for Candidate B
 * (stop attempting continuation) without removing burst ACTIVE watch.
 */
export function markActivePastContinuationWindow(
  memory: WorkerMemoryModel,
  evaluationUnix: number,
): void {
  for (const token of memory.activeTokens.values()) {
    if (!isWithinContinuationWatch(evaluationUnix, token.launchTimestamp)) {
      memory.continuationResolved.add(token.tokenAddress);
    }
  }
}
