/**
 * Stage 6 event-engine: pure eligibility + RAM lifecycle with mocked durable RPCs.
 * Deterministic; no network, no wall clock as semantic authority.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultFireEligibility,
  isExpireEligible,
  isFireEligible,
  isInsideInclusiveWindow,
  isWithinWatchLifetime,
  pruneRollingQueue,
  tokenAgeSeconds,
} from "@/lib/pons/eligibility";
import type { ActiveTokenState, WorkerMemoryModel } from "@/lib/pons/types";
import {
  evaluateTokenLifecycle,
  removeTokenFromWatch,
} from "@/lib/worker/pons/lifecycle";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const T0 = 1_700_000_000;
const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MARKET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FACTORY = "0xcccccccccccccccccccccccccccccccccccccccc";

function activeToken(launchTs: number = T0): ActiveTokenState {
  return {
    tokenAddress: TOKEN,
    marketAddress: MARKET,
    factoryAddress: FACTORY,
    factoryVersion: "v1",
    launchTxHash:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    launchBlock: 100,
    launchTimestamp: launchTs,
  };
}

function memoryWithBuyers(
  firstBuyOffsets: number[],
  launchTs: number = T0,
): WorkerMemoryModel {
  const token = activeToken(launchTs);
  const rolling = firstBuyOffsets.map((off, i) => ({
    walletAddress: `0x${(i + 1).toString(16).padStart(40, "0")}`,
    firstBuyBlockTimestamp: launchTs + off,
  }));
  const confirmed = new Set(rolling.map((r) => r.walletAddress));
  return {
    activeTokens: new Map([[TOKEN, token]]),
    continuationWatch: new Map(),
    continuationResolved: new Set(),
    confirmedBuyers: new Map([[TOKEN, confirmed]]),
    rollingFirstBuyers: new Map([[TOKEN, rolling]]),
  };
}

type FireReturn = {
  status: string;
  event_id?: string;
  new_buyers?: number;
  token_age_seconds?: number;
  trigger_tx_hash?: string | null;
  reason?: string;
};

function mockSupabase(opts: {
  fire?: () => FireReturn | Promise<FireReturn>;
  expire?: () => { status: string } | Promise<{ status: string }>;
  fireCalls?: FireReturn[];
  expireCalls?: { status: string }[];
}): {
  supabase: WorkerSupabase;
  fireArgs: unknown[];
  expireArgs: unknown[];
} {
  const fireArgs: unknown[] = [];
  const expireArgs: unknown[] = [];
  let fireI = 0;
  let expI = 0;

  const supabase = {
    rpc: async (name: string, args: unknown) => {
      if (name === "fire_pons_buying_activity") {
        fireArgs.push(args);
        if (opts.fire) {
          return { data: await opts.fire(), error: null };
        }
        if (opts.fireCalls) {
          const row = opts.fireCalls[fireI++] ?? { status: "not_eligible" };
          return { data: row, error: null };
        }
        return {
          data: {
            status: "fired",
            event_id: "00000000-0000-0000-0000-000000000001",
            new_buyers: 5,
            token_age_seconds: 180,
            trigger_tx_hash: null,
          },
          error: null,
        };
      }
      if (name === "fire_pons_buyer_continuation") {
        return { data: { status: "not_eligible", reason: "below_threshold" }, error: null };
      }
      if (name === "expire_pons_launch") {
        expireArgs.push(args);
        if (opts.expire) {
          return { data: await opts.expire(), error: null };
        }
        if (opts.expireCalls) {
          const row = opts.expireCalls[expI++] ?? { status: "expired" };
          return { data: row, error: null };
        }
        return { data: { status: "expired" }, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${name}` } };
    },
  } as unknown as WorkerSupabase;

  return { supabase, fireArgs, expireArgs };
}

describe("Stage 6 pure eligibility / inclusive bounds", () => {
  it("A: 5 buyers by age 170 → eligible only at age floor 180", () => {
    const buyers = [20, 40, 80, 120, 170].map((o) => T0 + o);
    assert.equal(
      defaultFireEligibility(T0, T0 + 170, buyers),
      false,
      "below age floor",
    );
    assert.equal(
      defaultFireEligibility(T0, T0 + 180, buyers),
      true,
      "age floor crossing with all 5 in window",
    );
    // Exactly 180s old buyers still in window at T0+180
    assert.equal(isInsideInclusiveWindow(T0, T0 + 180, 180), true);
    assert.equal(tokenAgeSeconds(T0 + 180, T0), 180);
  });

  it("B: early buyers fall outside later rolling window", () => {
    const buyers = [1, 2, 3, 4, 5].map((o) => T0 + o);
    assert.equal(defaultFireEligibility(T0, T0 + 180, buyers), true);
    // Later evaluation: early burst pruned out
    const pruned = pruneRollingQueue(buyers, T0 + 400, 180);
    assert.equal(pruned.length, 0);
    assert.equal(defaultFireEligibility(T0, T0 + 400, buyers), false);
  });

  it("C: 4 unique + activity → no fire", () => {
    const buyers = [20, 40, 80, 120].map((o) => T0 + o);
    assert.equal(defaultFireEligibility(T0, T0 + 180, buyers), false);
  });

  it("D: fifth buyer at age 184 → fire once at T", () => {
    const buyers = [20, 40, 80, 120, 184].map((o) => T0 + o);
    assert.equal(defaultFireEligibility(T0, T0 + 184, buyers), true);
    assert.equal(defaultFireEligibility(T0, T0 + 183, buyers.slice(0, 4)), false);
  });

  it("G: fifth buyer exactly at age 3600 → valid fire age", () => {
    // All five must lie in [3600−180, 3600] = [3420, 3600]
    const buyers = [3420, 3450, 3500, 3550, 3600].map((o) => T0 + o);
    assert.equal(isWithinWatchLifetime(T0 + 3600, T0), true);
    assert.equal(defaultFireEligibility(T0, T0 + 3600, buyers), true);
    assert.equal(isExpireEligible(T0 + 3600, T0), false);
  });

  it("H: age 3601 → not fire-eligible; expire-eligible", () => {
    // Fifth first-buy at age 3601 is past TTL even if count≥5 in raw list
    const buyers = [3421, 3451, 3501, 3551, 3601].map((o) => T0 + o);
    assert.equal(defaultFireEligibility(T0, T0 + 3601, buyers), false);
    assert.equal(isExpireEligible(T0 + 3601, T0), true);
    // Buyer at 3601 is outside inclusive window at eval T0+3601? window is [T−180, T]
    // so T0+3601 is still at upper bound — but age fails fire.
    assert.equal(isInsideInclusiveWindow(T0 + 3601, T0 + 3601, 180), true);
  });

  it("inclusive upper bound: future first-buy timestamps do not count", () => {
    assert.equal(isInsideInclusiveWindow(T0 + 200, T0 + 180, 180), false);
  });

  it("isFireEligible rejects age < floor and age > TTL", () => {
    const buyers = [10, 20, 30, 40, 50].map((o) => T0 + o);
    assert.equal(
      isFireEligible({
        launchTimestamp: T0,
        chainTimestamp: T0 + 179,
        rollingFirstBuyerTimestamps: buyers,
        ageFloorSeconds: 180,
        windowSeconds: 180,
        threshold: 5,
        watchTtlSeconds: 3600,
      }),
      false,
    );
    assert.equal(
      isFireEligible({
        launchTimestamp: T0,
        chainTimestamp: T0 + 3601,
        rollingFirstBuyerTimestamps: buyers,
        ageFloorSeconds: 180,
        windowSeconds: 180,
        threshold: 5,
        watchTtlSeconds: 3600,
      }),
      false,
    );
  });
});

describe("Stage 6 lifecycle evaluateTokenLifecycle (mocked durable layer)", () => {
  it("A/D: RAM eligible → fire RPC → remove from watch", async () => {
    const memory = memoryWithBuyers([20, 40, 80, 120, 170]);
    const { supabase, fireArgs } = mockSupabase({});
    const result = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 280,
      evaluationTimestampUnix: T0 + 180,
    });
    assert.equal(result.fired, 1);
    assert.equal(result.fireAttempts, 1);
    assert.equal(memory.activeTokens.has(TOKEN), false);
    // Stage 11B: burst fire retains observation on continuation watch when age < 300.
    assert.equal(memory.continuationWatch.has(TOKEN), true);
    assert.equal(memory.rollingFirstBuyers.has(TOKEN), true);
    assert.equal(memory.confirmedBuyers.has(TOKEN), true);
    assert.equal(fireArgs.length, 1);
  });

  it("E crash recovery: reconstruct buyers then fire at age floor", async () => {
    // Simulate restart: RAM rebuilt with 5 durable buyers, eval at 180.
    const memory = memoryWithBuyers([20, 40, 80, 120, 170]);
    const { supabase } = mockSupabase({});
    const result = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 300,
      evaluationTimestampUnix: T0 + 180,
    });
    assert.equal(result.fired, 1);
    assert.ok(!memory.activeTokens.has(TOKEN));
    assert.ok(memory.continuationWatch.has(TOKEN));
  });

  it("F: already_fired from RPC removes token without second event path", async () => {
    const memory = memoryWithBuyers([20, 40, 80, 120, 170]);
    const { supabase, fireArgs } = mockSupabase({
      fire: () => ({
        status: "already_fired",
        event_id: "00000000-0000-0000-0000-000000000099",
      }),
    });
    const result = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 300,
      evaluationTimestampUnix: T0 + 180,
    });
    assert.equal(result.alreadyFired, 1);
    assert.equal(result.fired, 0);
    assert.equal(fireArgs.length, 1);
    assert.ok(!memory.activeTokens.has(TOKEN));
    assert.ok(memory.continuationWatch.has(TOKEN));
  });

  it("I: fire vs expiry — fire first; expiry skipped when terminal", async () => {
    // Age > TTL and RAM would never fire; ensure expire path.
    const memory = memoryWithBuyers([20, 40, 80, 120, 170]);
    const { supabase, fireArgs, expireArgs } = mockSupabase({});
    // At age 4000 with pruned window empty: not fire, expire yes.
    const r = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 5000,
      evaluationTimestampUnix: T0 + 4000,
    });
    assert.equal(r.fireAttempts, 0);
    assert.equal(r.expired, 1);
    assert.equal(fireArgs.length, 0);
    assert.equal(expireArgs.length, 1);
    assert.ok(!memory.activeTokens.has(TOKEN));
  });

  it("I2: at age 3600 with 5 buyers — fire before expire (not expire eligible yet)", async () => {
    const memory = memoryWithBuyers([3420, 3450, 3500, 3550, 3600]);
    const { supabase, expireArgs } = mockSupabase({});
    const r = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 999,
      evaluationTimestampUnix: T0 + 3600,
    });
    assert.equal(r.fired, 1);
    assert.equal(r.expired, 0);
    assert.equal(expireArgs.length, 0);
  });

  it("J: runtime token removed after fired", async () => {
    const memory = memoryWithBuyers([20, 40, 80, 120, 180]);
    removeTokenFromWatch(memory, TOKEN);
    assert.equal(memory.activeTokens.size, 0);
    // After full lifecycle path:
    const memory2 = memoryWithBuyers([20, 40, 80, 120, 180]);
    const { supabase } = mockSupabase({});
    await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory: memory2,
      evaluationBlockNumber: 1,
      evaluationTimestampUnix: T0 + 180,
    });
    assert.equal(memory2.activeTokens.size, 0);
  });

  it("K: runtime token removed after expired", async () => {
    const memory = memoryWithBuyers([10, 20]); // never eligible
    const { supabase } = mockSupabase({});
    await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 1,
      evaluationTimestampUnix: T0 + 3601,
    });
    assert.equal(memory.activeTokens.size, 0);
    assert.equal(memory.rollingFirstBuyers.size, 0);
  });

  it("L: durable verification refuses RAM false positive", async () => {
    // RAM has 5 timestamps → attempt fire; durable says below_threshold
    const memory = memoryWithBuyers([20, 40, 80, 120, 170]);
    const { supabase } = mockSupabase({
      fire: () => ({
        status: "not_eligible",
        reason: "below_threshold",
        new_buyers: 4,
        token_age_seconds: 180,
      }),
    });
    const r = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 1,
      evaluationTimestampUnix: T0 + 180,
    });
    assert.equal(r.notEligible, 1);
    assert.equal(r.fired, 0);
    // Remain ACTIVE until real durable fire or expiry
    assert.equal(memory.activeTokens.has(TOKEN), true);
  });

  it("operational fire failure blocks expiry (event-retry semantics)", async () => {
    const supabase = {
      rpc: async () => ({
        data: null,
        error: { message: "connection reset" },
      }),
    } as unknown as WorkerSupabase;

    // Age-floor + 5 buyers → fire attempted then operational fail; token stays ACTIVE.
    const mem2 = memoryWithBuyers([20, 40, 80, 120, 170]);
    const r = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory: mem2,
      evaluationBlockNumber: 1,
      evaluationTimestampUnix: T0 + 180,
    });
    assert.equal(r.fireOperationalFailures, 1);
    assert.equal(mem2.activeTokens.has(TOKEN), true);
    assert.equal(r.fired, 0);
    assert.equal(r.expired, 0);
  });

  it("B burst screen uses pruned window copy; durable RAM timestamps retained", async () => {
    // Early buyers fall outside the rolling 180s screen at T0+400 → no fire attempt,
    // but Stage 11B keeps full first-buy timestamps for Candidate B.
    const memory = memoryWithBuyers([1, 2, 3, 4, 5]);
    const { supabase, fireArgs } = mockSupabase({});
    const r = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 1,
      evaluationTimestampUnix: T0 + 400,
    });
    assert.equal(r.fireAttempts, 0);
    assert.equal(fireArgs.length, 0);
    const q = memory.rollingFirstBuyers.get(TOKEN) ?? [];
    assert.equal(q.length, 5);
    assert.equal(memory.activeTokens.has(TOKEN), true);
  });

  it("C lifecycle: 4 buyers never call fire", async () => {
    const memory = memoryWithBuyers([20, 40, 80, 120]);
    const { supabase, fireArgs } = mockSupabase({});
    await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 1,
      evaluationTimestampUnix: T0 + 200,
    });
    assert.equal(fireArgs.length, 0);
    assert.equal(memory.activeTokens.has(TOKEN), true);
  });

  it("H lifecycle: age 3601 expires without fire", async () => {
    // Even with five late first buyers, age > TTL means fire must not run
    const memory = memoryWithBuyers([3421, 3451, 3501, 3551, 3601]);
    const { supabase, fireArgs, expireArgs } = mockSupabase({});
    const r = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 1,
      evaluationTimestampUnix: T0 + 3601,
    });
    assert.equal(r.fired, 0);
    assert.equal(fireArgs.length, 0);
    assert.equal(r.expired, 1);
    assert.equal(expireArgs.length, 1);
  });

  it("already_fired heal on expire path", async () => {
    const memory = memoryWithBuyers([10]);
    const { supabase } = mockSupabase({
      expire: () => ({ status: "already_fired" }),
    });
    const r = await evaluateTokenLifecycle({
      supabase,
      chainId: 4663,
      memory,
      evaluationBlockNumber: 1,
      evaluationTimestampUnix: T0 + 4000,
    });
    assert.equal(r.alreadyFired, 1);
    assert.ok(!memory.activeTokens.has(TOKEN));
  });
});
