/**
 * POOLS Instant Swap scanner: known-pool BUY → tx.from first buyer.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, pad, parseAbiParameters } from "viem";
import {
  POOLS_V4_SWAP_TOPIC0,
  RHC_UNISWAP_V4_POOL_MANAGER,
} from "@/lib/pools/addresses";
import type { ChainRpc } from "@/lib/worker/chain/rpc";
import {
  addPoolsLaunchToWatch,
  createPoolsWorkerMemory,
} from "@/lib/worker/pools/state";
import { scanPoolsSwapRange } from "@/lib/worker/pools/swap-scanner";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const TOKEN = "0x87380657b18eb20b57b66d9759de4262d2531fa2";
const POOL_ID =
  "0xf880faadd73dd6eca13ee7d1e3958e6aef3e65a114b4123fb4007f6069406444";
const STRATEGY = "0x23f8209572b4a1c2ad88a42749e830791fb027f1";
const INTERMEDIARY = "0x2222222222222222222222222222222222222222";
const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BUY_TX =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const SELL_TX =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const BUY2_TX =
  "0x3333333333333333333333333333333333333333333333333333333333333333";

const BUY_AMOUNT0 = BigInt("-40873308865915953");
const BUY_AMOUNT1 = BigInt("16000000000000000000000000");
const SELL_AMOUNT0 = BigInt("40687478284752095");
const SELL_AMOUNT1 = BigInt("-16000000000000000000000000");

const LAUNCH_TS = 1_700_000_000;
const BUY_TS = LAUNCH_TS + 10;

function encodeSwap(
  amount0: bigint,
  amount1: bigint,
  poolId = POOL_ID,
) {
  return {
    topics: [
      POOLS_V4_SWAP_TOPIC0,
      poolId as `0x${string}`,
      pad(INTERMEDIARY as `0x${string}`),
    ],
    data: encodeAbiParameters(
      parseAbiParameters(
        "int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee",
      ),
      [amount0, amount1, BigInt(2) ** BigInt(96), BigInt(1), 0, 2500],
    ),
  };
}

function swapLog(opts: {
  amount0: bigint;
  amount1: bigint;
  tx: string;
  logIndex: number;
  poolId?: string;
  address?: string;
  data?: string;
}) {
  const encoded = encodeSwap(opts.amount0, opts.amount1, opts.poolId);
  return {
    address: opts.address ?? RHC_UNISWAP_V4_POOL_MANAGER,
    blockNumber: BigInt(35_000_200),
    transactionHash: opts.tx,
    logIndex: opts.logIndex,
    topics: encoded.topics,
    data: opts.data ?? encoded.data,
  };
}

function seedWatch() {
  const memory = createPoolsWorkerMemory();
  addPoolsLaunchToWatch(memory, {
    tokenAddress: TOKEN,
    poolId: POOL_ID,
    launchedTokenCurrencyIndex: 1,
    sourceContract: STRATEGY,
    launchTxHash:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    launchBlock: 35_000_100,
    launchTimestamp: LAUNCH_TS,
  });
  return memory;
}

function createRpc(logs: ReturnType<typeof swapLog>[], txFrom: Record<string, string>) {
  const getLogsCalls: Array<Record<string, unknown>> = [];
  const getTxCalls: string[] = [];
  const rpc = {
    async getLogs(input: {
      address?: string | string[];
      fromBlock: number;
      toBlock: number;
      topic0?: string;
    }) {
      getLogsCalls.push({ ...input });
      return logs;
    },
    async getBlock(blockNumber: number) {
      return { number: blockNumber, timestamp: BUY_TS };
    },
    async getTransaction(txHash: string) {
      getTxCalls.push(txHash);
      const from = txFrom[txHash];
      if (!from) throw new Error(`missing tx ${txHash}`);
      return { hash: txHash, from, to: INTERMEDIARY, value: BigInt(0) };
    },
  } as unknown as ChainRpc;
  return { rpc, getLogsCalls, getTxCalls };
}

function createSupabase(opts?: { uniqueOnInsert?: boolean }) {
  const inserts: Array<Record<string, unknown>> = [];
  const poolLookups: string[] = [];
  const fires: unknown[] = [];
  const existing = new Set<string>();

  const supabase = {
    from(table: string) {
      if (table === "pools_instant_launches") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq(_col: string, poolId: string) {
                    poolLookups.push(poolId);
                    return {
                      maybeSingle: async () => ({ data: null, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "pools_first_buyers") {
        return {
          insert(payload: Record<string, unknown>) {
            const key = `${payload.token_address}:${payload.wallet_address}`;
            if (existing.has(key) || opts?.uniqueOnInsert) {
              return {
                select() {
                  return {
                    maybeSingle: async () => ({
                      data: null,
                      error: { code: "23505", message: "duplicate" },
                    }),
                  };
                },
              };
            }
            inserts.push(payload);
            existing.add(key);
            return {
              select() {
                return {
                  maybeSingle: async () => ({ data: payload, error: null }),
                };
              },
            };
          },
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          maybeSingle: async () => ({
                            data: inserts[0] ?? null,
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    async rpc(name: string, args: unknown) {
      fires.push({ name, args });
      return { data: { status: "not_eligible" }, error: null };
    },
  } as unknown as WorkerSupabase;

  return { supabase, inserts, poolLookups, fires };
}

describe("scanPoolsSwapRange", () => {
  it("BUY specimen persists tx.from, not Swap.sender", async () => {
    const memory = seedWatch();
    const { rpc, getLogsCalls, getTxCalls } = createRpc(
      [
        swapLog({
          amount0: BUY_AMOUNT0,
          amount1: BUY_AMOUNT1,
          tx: BUY_TX,
          logIndex: 1,
        }),
      ],
      { [BUY_TX]: WALLET_A },
    );
    const { supabase, inserts } = createSupabase();

    const result = await scanPoolsSwapRange({
      rpc,
      supabase,
      chainId: 4663,
      memory,
      fromBlock: 35_000_200,
      toBlock: 35_000_200,
    });

    assert.equal(result.fullyProcessed, true);
    assert.equal(result.newFirstBuyers, 1);
    assert.equal(result.sells, 0);
    assert.equal(getLogsCalls[0]!.address, RHC_UNISWAP_V4_POOL_MANAGER);
    assert.equal(getLogsCalls[0]!.topic0, POOLS_V4_SWAP_TOPIC0);
    assert.deepEqual(getTxCalls, [BUY_TX]);
    assert.equal(inserts[0]!.wallet_address, WALLET_A);
    assert.equal(inserts[0]!.token_address, TOKEN);
    assert.notEqual(inserts[0]!.wallet_address, INTERMEDIARY);
    assert.ok(memory.confirmedBuyers.get(TOKEN)?.has(WALLET_A));
  });

  it("SELL specimen is not a buy", async () => {
    const memory = seedWatch();
    const { rpc, getTxCalls } = createRpc(
      [
        swapLog({
          amount0: SELL_AMOUNT0,
          amount1: SELL_AMOUNT1,
          tx: SELL_TX,
          logIndex: 2,
        }),
      ],
      { [SELL_TX]: WALLET_A },
    );
    const { supabase, inserts } = createSupabase();
    const result = await scanPoolsSwapRange({
      rpc,
      supabase,
      chainId: 4663,
      memory,
      fromBlock: 35_000_200,
      toBlock: 35_000_200,
    });
    assert.equal(result.fullyProcessed, true);
    assert.equal(result.newFirstBuyers, 0);
    assert.equal(result.sells, 1);
    assert.equal(inserts.length, 0);
    assert.equal(getTxCalls.length, 0);
  });

  it("unknown pool IDs are ignored without tx lookup", async () => {
    const memory = createPoolsWorkerMemory();
    const unknownPool =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const { rpc, getTxCalls } = createRpc(
      [
        swapLog({
          amount0: BUY_AMOUNT0,
          amount1: BUY_AMOUNT1,
          tx: BUY_TX,
          logIndex: 1,
          poolId: unknownPool,
        }),
      ],
      { [BUY_TX]: WALLET_A },
    );
    const { supabase, inserts, poolLookups } = createSupabase();
    const result = await scanPoolsSwapRange({
      rpc,
      supabase,
      chainId: 4663,
      memory,
      fromBlock: 35_000_200,
      toBlock: 35_000_200,
    });
    assert.equal(result.unknownPools, 1);
    assert.equal(result.newFirstBuyers, 0);
    assert.equal(inserts.length, 0);
    assert.equal(getTxCalls.length, 0);
    assert.equal(poolLookups[0], unknownPool);
  });

  it("wrong PoolManager logs are ignored", async () => {
    const memory = seedWatch();
    const { rpc, getTxCalls } = createRpc(
      [
        swapLog({
          amount0: BUY_AMOUNT0,
          amount1: BUY_AMOUNT1,
          tx: BUY_TX,
          logIndex: 1,
          address: "0x0000000000000000000000000000000000000001",
        }),
      ],
      { [BUY_TX]: WALLET_A },
    );
    const { supabase, inserts } = createSupabase();
    const result = await scanPoolsSwapRange({
      rpc,
      supabase,
      chainId: 4663,
      memory,
      fromBlock: 35_000_200,
      toBlock: 35_000_200,
    });
    assert.equal(result.decodedSwaps, 0);
    assert.equal(result.newFirstBuyers, 0);
    assert.equal(inserts.length, 0);
    assert.equal(getTxCalls.length, 0);
  });

  it("malformed amounts block cursor advancement", async () => {
    const memory = seedWatch();
    const good = swapLog({
      amount0: BUY_AMOUNT0,
      amount1: BUY_AMOUNT1,
      tx: BUY_TX,
      logIndex: 1,
    });
    const { rpc } = createRpc(
      [{ ...good, data: "0x" }],
      { [BUY_TX]: WALLET_A },
    );
    const { supabase } = createSupabase();
    const result = await scanPoolsSwapRange({
      rpc,
      supabase,
      chainId: 4663,
      memory,
      fromBlock: 35_000_200,
      toBlock: 35_000_200,
    });
    assert.equal(result.fullyProcessed, false);
    assert.match(result.failures[0]!, /malformed/);
  });

  it("duplicate buyer and repeat buys insert once", async () => {
    const memory = seedWatch();
    const { rpc } = createRpc(
      [
        swapLog({
          amount0: BUY_AMOUNT0,
          amount1: BUY_AMOUNT1,
          tx: BUY_TX,
          logIndex: 1,
        }),
        swapLog({
          amount0: BUY_AMOUNT0,
          amount1: BUY_AMOUNT1,
          tx: BUY2_TX,
          logIndex: 2,
        }),
      ],
      { [BUY_TX]: WALLET_A, [BUY2_TX]: WALLET_A },
    );
    const { supabase, inserts } = createSupabase();
    const result = await scanPoolsSwapRange({
      rpc,
      supabase,
      chainId: 4663,
      memory,
      fromBlock: 35_000_200,
      toBlock: 35_000_200,
    });
    assert.equal(result.newFirstBuyers, 1);
    assert.equal(result.alreadyKnownBuyers, 1);
    assert.equal(inserts.length, 1);
    assert.equal(memory.confirmedBuyers.get(TOKEN)?.size, 1);
  });

  it("two different buyers both persist", async () => {
    const memory = seedWatch();
    const { rpc } = createRpc(
      [
        swapLog({
          amount0: BUY_AMOUNT0,
          amount1: BUY_AMOUNT1,
          tx: BUY_TX,
          logIndex: 1,
        }),
        swapLog({
          amount0: BUY_AMOUNT0,
          amount1: BUY_AMOUNT1,
          tx: BUY2_TX,
          logIndex: 2,
        }),
      ],
      { [BUY_TX]: WALLET_A, [BUY2_TX]: WALLET_B },
    );
    const { supabase, inserts } = createSupabase();
    const result = await scanPoolsSwapRange({
      rpc,
      supabase,
      chainId: 4663,
      memory,
      fromBlock: 35_000_200,
      toBlock: 35_000_200,
    });
    assert.equal(result.newFirstBuyers, 2);
    assert.equal(inserts.length, 2);
    assert.equal(memory.confirmedBuyers.get(TOKEN)?.size, 2);
    assert.ok(memory.confirmedBuyers.get(TOKEN)?.has(WALLET_A));
    assert.ok(memory.confirmedBuyers.get(TOKEN)?.has(WALLET_B));
  });

  it("restart rewind of the same BUY is duplicate-safe", async () => {
    const memory = seedWatch();
    memory.confirmedBuyers.set(TOKEN, new Set([WALLET_A]));
    memory.rollingFirstBuyers.set(TOKEN, [
      { walletAddress: WALLET_A, firstBuyBlockTimestamp: BUY_TS },
    ]);
    const { rpc } = createRpc(
      [
        swapLog({
          amount0: BUY_AMOUNT0,
          amount1: BUY_AMOUNT1,
          tx: BUY_TX,
          logIndex: 1,
        }),
      ],
      { [BUY_TX]: WALLET_A },
    );
    const { supabase, inserts } = createSupabase();
    const result = await scanPoolsSwapRange({
      rpc,
      supabase,
      chainId: 4663,
      memory,
      fromBlock: 35_000_200,
      toBlock: 35_000_200,
    });
    assert.equal(result.alreadyKnownBuyers, 1);
    assert.equal(result.newFirstBuyers, 0);
    assert.equal(inserts.length, 0);
  });
});
