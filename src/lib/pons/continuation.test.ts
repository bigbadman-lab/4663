/**
 * Stage 11B — Candidate B pure helpers + continuation watch lifecycle.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buyerAgeBucket,
  buyerAgeSeconds,
  countContinuationBuckets,
  isContinuationRuleSatisfied,
  isWithinContinuationWatch,
  secondContinuationBuyUnix,
} from "@/lib/pons/continuation";
import type { ActiveTokenState, WorkerMemoryModel } from "@/lib/pons/types";
import {
  pruneContinuationWatchByAge,
  tryFireBuyerContinuation,
} from "@/lib/worker/pons/continuation-eval";
import { evaluateTokenLifecycle } from "@/lib/worker/pons/lifecycle";
import {
  addContinuationWatchLaunches,
  applyFirstBuyersToMemory,
  moveActiveToContinuationWatch,
  reconstructWorkerMemory,
  removeFromContinuationWatch,
  watchedTokensForScan,
} from "@/lib/worker/state";
import type { ActiveLaunchRow, FirstBuyerRow } from "@/lib/worker/db-types";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const T0 = 1_700_000_000;
const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MARKET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FACTORY = "0xcccccccccccccccccccccccccccccccccccccccc";
const TX = "0x1111111111111111111111111111111111111111111111111111111111111111";

describe("Candidate B age buckets", () => {
  it("179s -> pre; 180s -> continuation; 299s -> continuation; 300s -> too_late", () => {
    assert.equal(buyerAgeBucket(179), "pre");
    assert.equal(buyerAgeBucket(180), "continuation");
    assert.equal(buyerAgeBucket(299), "continuation");
    assert.equal(buyerAgeBucket(300), "too_late");
  });

  it("buyerAgeSeconds uses floor subtraction", () => {
    assert.equal(buyerAgeSeconds(T0 + 180.9, T0), 180);
  });

  it("1: no pre buyer -> not satisfied", () => {
    const c = countContinuationBuckets([T0 + 180, T0 + 200], T0);
    assert.equal(c.pre3m, 0);
    assert.equal(c.continuation, 2);
    assert.equal(isContinuationRuleSatisfied(c), false);
  });

  it("2: 1 pre + 1 continuation -> no fire", () => {
    const c = countContinuationBuckets([T0 + 10, T0 + 200], T0);
    assert.equal(isContinuationRuleSatisfied(c), false);
  });

  it("3: 1 pre + 2 continuation -> fires", () => {
    const c = countContinuationBuckets([T0 + 10, T0 + 180, T0 + 250], T0);
    assert.equal(isContinuationRuleSatisfied(c), true);
    assert.equal(secondContinuationBuyUnix([T0 + 10, T0 + 180, T0 + 250], T0), T0 + 250);
  });

  it("4: 5 pre still needs 2 continuation", () => {
    const times = [10, 20, 30, 40, 50, 200].map((o) => T0 + o);
    const c = countContinuationBuckets(times, T0);
    assert.equal(c.pre3m, 5);
    assert.equal(c.continuation, 1);
    assert.equal(isContinuationRuleSatisfied(c), false);
  });

  it("8: duplicate wallet timestamps still count once in input list (caller dedupes)", () => {
    // Pure helper counts list entries; durable path uses unique wallets.
    const c = countContinuationBuckets([T0 + 10, T0 + 180, T0 + 190], T0);
    assert.equal(c.continuation, 2);
  });

  it("watch window: age 299 ok, age 300 ends", () => {
    assert.equal(isWithinContinuationWatch(T0 + 299, T0), true);
    assert.equal(isWithinContinuationWatch(T0 + 300, T0), false);
  });
});

function tokenState(): ActiveTokenState {
  return {
    tokenAddress: TOKEN,
    marketAddress: MARKET,
    factoryAddress: FACTORY,
    factoryVersion: "v1",
    launchTxHash: TX,
    launchBlock: 100,
    launchTimestamp: T0,
  };
}

function memoryActive(offsets: number[]): WorkerMemoryModel {
  const rolling = offsets.map((off, i) => ({
    walletAddress: `0x${(i + 1).toString(16).padStart(40, "0")}`,
    firstBuyBlockTimestamp: T0 + off,
  }));
  return {
    activeTokens: new Map([[TOKEN, tokenState()]]),
    continuationWatch: new Map(),
    continuationResolved: new Set(),
    confirmedBuyers: new Map([
      [TOKEN, new Set(rolling.map((r) => r.walletAddress))],
    ]),
    rollingFirstBuyers: new Map([[TOKEN, rolling]]),
  };
}

describe("continuation watch state", () => {
  it("11: burst fire moves to continuation watch under 300s", () => {
    const memory = memoryActive([10, 20, 30, 40, 50]);
    moveActiveToContinuationWatch(memory, TOKEN, T0 + 184);
    assert.equal(memory.activeTokens.has(TOKEN), false);
    assert.equal(memory.continuationWatch.has(TOKEN), true);
    assert.equal(memory.confirmedBuyers.has(TOKEN), true);
    assert.ok(watchedTokensForScan(memory).some((t) => t.tokenAddress === TOKEN));
  });

  it("17: age >=300 removes continuation watch", () => {
    const memory = memoryActive([10, 20, 30, 40, 50]);
    moveActiveToContinuationWatch(memory, TOKEN, T0 + 184);
    const n = pruneContinuationWatchByAge(memory, T0 + 300);
    assert.equal(n, 1);
    assert.equal(memory.continuationWatch.has(TOKEN), false);
    assert.equal(memory.continuationResolved.has(TOKEN), true);
  });

  it("16: restart >300 does not add continuation watch", () => {
    const memory = reconstructWorkerMemory([], []);
    const launch: ActiveLaunchRow = {
      chainId: 4663,
      tokenAddress: TOKEN,
      marketAddress: MARKET,
      factoryAddress: FACTORY,
      factoryVersion: "v1",
      launchTxHash: TX,
      launchBlockNumber: 100,
      launchBlockTimestamp: new Date(T0 * 1000).toISOString(),
      status: "fired",
    };
    const added = addContinuationWatchLaunches(memory, [launch], T0 + 400);
    assert.equal(added, 0);
    assert.equal(memory.continuationWatch.size, 0);
  });

  it("14: restart at 3m30 reconstructs counts", () => {
    const memory = reconstructWorkerMemory([], []);
    const launch: ActiveLaunchRow = {
      chainId: 4663,
      tokenAddress: TOKEN,
      marketAddress: MARKET,
      factoryAddress: FACTORY,
      factoryVersion: "v1",
      launchTxHash: TX,
      launchBlockNumber: 100,
      launchBlockTimestamp: new Date(T0 * 1000).toISOString(),
      status: "fired",
    };
    addContinuationWatchLaunches(memory, [launch], T0 + 210);
    const buyers: FirstBuyerRow[] = [
      {
        chainId: 4663,
        tokenAddress: TOKEN,
        walletAddress: "0x0000000000000000000000000000000000000001",
        firstBuyTxHash: TX,
        firstBuyBlockNumber: 101,
        firstBuyBlockTimestamp: new Date((T0 + 10) * 1000).toISOString(),
      },
      {
        chainId: 4663,
        tokenAddress: TOKEN,
        walletAddress: "0x0000000000000000000000000000000000000002",
        firstBuyTxHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        firstBuyBlockNumber: 102,
        firstBuyBlockTimestamp: new Date((T0 + 190) * 1000).toISOString(),
      },
    ];
    applyFirstBuyersToMemory(memory, buyers);
    const counts = countContinuationBuckets(
      (memory.rollingFirstBuyers.get(TOKEN) ?? []).map(
        (r) => r.firstBuyBlockTimestamp,
      ),
      T0,
    );
    assert.equal(counts.pre3m, 1);
    assert.equal(counts.continuation, 1);
    assert.equal(isContinuationRuleSatisfied(counts), false);
  });

  it("15: restart at 4m45 with 2 continuation buyers is rule-satisfied", () => {
    const memory = reconstructWorkerMemory([], []);
    const launch: ActiveLaunchRow = {
      chainId: 4663,
      tokenAddress: TOKEN,
      marketAddress: MARKET,
      factoryAddress: FACTORY,
      factoryVersion: "v1",
      launchTxHash: TX,
      launchBlockNumber: 100,
      launchBlockTimestamp: new Date(T0 * 1000).toISOString(),
      status: "fired",
    };
    // age 285s < 300 → still watchable
    addContinuationWatchLaunches(memory, [launch], T0 + 285);
    assert.equal(memory.continuationWatch.size, 1);
    applyFirstBuyersToMemory(memory, [
      {
        chainId: 4663,
        tokenAddress: TOKEN,
        walletAddress: "0x0000000000000000000000000000000000000001",
        firstBuyTxHash: TX,
        firstBuyBlockNumber: 101,
        firstBuyBlockTimestamp: new Date((T0 + 10) * 1000).toISOString(),
      },
      {
        chainId: 4663,
        tokenAddress: TOKEN,
        walletAddress: "0x0000000000000000000000000000000000000002",
        firstBuyTxHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        firstBuyBlockNumber: 102,
        firstBuyBlockTimestamp: new Date((T0 + 180) * 1000).toISOString(),
      },
      {
        chainId: 4663,
        tokenAddress: TOKEN,
        walletAddress: "0x0000000000000000000000000000000000000003",
        firstBuyTxHash:
          "0x3333333333333333333333333333333333333333333333333333333333333333",
        firstBuyBlockNumber: 103,
        firstBuyBlockTimestamp: new Date((T0 + 250) * 1000).toISOString(),
      },
    ]);
    const counts = countContinuationBuckets(
      (memory.rollingFirstBuyers.get(TOKEN) ?? []).map(
        (r) => r.firstBuyBlockTimestamp,
      ),
      T0,
    );
    assert.equal(isContinuationRuleSatisfied(counts), true);
  });
});

describe("continuation fire independence from burst", () => {
  it("10: Candidate B can fire WITHOUT prior pons_buying_activity", async () => {
    // ACTIVE token with 1 pre + 2 continuation — never burst-fired.
    const memory = memoryActive([10, 180, 200]);
    let contCalls = 0;
    const supabase = {
      rpc: async (name: string) => {
        if (name === "fire_pons_buyer_continuation") {
          contCalls += 1;
          return {
            data: {
              status: "fired",
              event_id: "00000000-0000-0000-0000-0000000000aa",
              new_buyers: 2,
              pre_3m_buyers: 1,
              continuation_buyers: 2,
              token_age_seconds: 200,
              trigger_tx_hash: TX,
            },
            error: null,
          };
        }
        if (name === "fire_pons_buying_activity") {
          return { data: { status: "not_eligible" }, error: null };
        }
        if (name === "expire_pons_launch") {
          return { data: { status: "not_active" }, error: null };
        }
        return { data: null, error: { message: name } };
      },
    } as unknown as WorkerSupabase;

    const r = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 500,
      evaluationTimestampUnix: T0 + 200,
    });
    assert.equal(r.fired, 0); // no burst
    assert.equal(r.continuationFired, 1);
    assert.equal(contCalls, 1);
    assert.equal(memory.continuationResolved.has(TOKEN), true);
  });

  it("13: continuation fires once (already_fired)", async () => {
    const memory = memoryActive([10, 180, 200]);
    let contCalls = 0;
    const supabase = {
      rpc: async (name: string) => {
        if (name === "fire_pons_buyer_continuation") {
          contCalls += 1;
          return {
            data: {
              status: "already_fired",
              event_id: "00000000-0000-0000-0000-0000000000bb",
            },
            error: null,
          };
        }
        return { data: { status: "not_eligible" }, error: null };
      },
    } as unknown as WorkerSupabase;

    const token = memory.activeTokens.get(TOKEN)!;
    const a = await tryFireBuyerContinuation({
      supabase,
      chainId: 4663,
      memory,
      token,
      evaluationTimestampUnix: T0 + 200,
      evaluationBlockNumber: 1,
    });
    assert.equal(a.alreadyFired, true);
    const b = await tryFireBuyerContinuation({
      supabase,
      chainId: 4663,
      memory,
      token,
      evaluationTimestampUnix: T0 + 201,
      evaluationBlockNumber: 2,
    });
    assert.equal(b.attempted, false); // resolved
    assert.equal(contCalls, 1);
  });

  it("12: burst then continuation can coexist on watch path", async () => {
    const memory = memoryActive([10, 20, 30, 40, 50, 180, 200]);
    let burst = 0;
    let cont = 0;
    const supabase = {
      rpc: async (name: string) => {
        if (name === "fire_pons_buying_activity") {
          burst += 1;
          return {
            data: {
              status: "fired",
              event_id: "00000000-0000-0000-0000-0000000000cc",
              new_buyers: 5,
              token_age_seconds: 200,
            },
            error: null,
          };
        }
        if (name === "fire_pons_buyer_continuation") {
          cont += 1;
          return {
            data: {
              status: "fired",
              event_id: "00000000-0000-0000-0000-0000000000dd",
              new_buyers: 2,
              pre_3m_buyers: 5,
              continuation_buyers: 2,
              token_age_seconds: 200,
            },
            error: null,
          };
        }
        return { data: { status: "not_eligible" }, error: null };
      },
    } as unknown as WorkerSupabase;

    const r = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 500,
      evaluationTimestampUnix: T0 + 200,
    });
    assert.equal(r.fired, 1);
    assert.equal(r.continuationFired, 1);
    assert.equal(burst, 1);
    assert.equal(cont, 1);
    assert.ok(!memory.activeTokens.has(TOKEN));
    // continuation fired → removed from continuation watch
    assert.ok(!memory.continuationWatch.has(TOKEN));
    assert.ok(memory.continuationResolved.has(TOKEN));
  });
});

describe("removeFromContinuationWatch", () => {
  it("marks resolved by default", () => {
    const memory = memoryActive([10]);
    moveActiveToContinuationWatch(memory, TOKEN, T0 + 184);
    removeFromContinuationWatch(memory, TOKEN);
    assert.equal(memory.continuationWatch.has(TOKEN), false);
    assert.equal(memory.continuationResolved.has(TOKEN), true);
  });
});
