/**
 * Observation 1B — forward-watch eligibility integration tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  filterForwardWatchEligibleLaunches,
  isForwardWatchEligibleLaunchBlock,
  isObservationEligibleLaunchBlock,
  isProductionEligibleLaunchBlock,
} from "@/lib/pons/production-boundary";
import {
  addActiveLaunchToMemory,
  reconstructWorkerMemory,
  watchedTokensForScan,
} from "@/lib/worker/state";
import {
  loadActiveLaunches,
  loadFiredLaunchesForContinuationWatch,
} from "@/lib/worker/repositories/launches";
import type { ActiveLaunchRow } from "@/lib/worker/db-types";
import type { WorkerMemoryModel } from "@/lib/pons/types";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function launchRow(
  block: number,
  status: "active" | "fired" = "active",
): ActiveLaunchRow {
  return {
    chainId: 4663,
    tokenAddress: `0x${block.toString(16).padStart(40, "0")}`,
    marketAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    factoryAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
    factoryVersion: "v1",
    launchTxHash: `0x${block.toString(16).padStart(64, "0")}`,
    launchBlockNumber: block,
    launchBlockTimestamp: new Date(1_700_000_000_000).toISOString(),
    status,
  };
}

type QueryCapture = {
  gte?: { col: string; value: unknown };
  gt?: { col: string; value: unknown };
};

function createLaunchQueryMock(
  rows: ActiveLaunchRow[],
  capture: QueryCapture,
): WorkerSupabase {
  const dbRows = rows.map((r) => ({
    chain_id: r.chainId,
    token_address: r.tokenAddress,
    market_address: r.marketAddress,
    factory_address: r.factoryAddress,
    factory_version: r.factoryVersion,
    launch_tx_hash: r.launchTxHash,
    launch_block_number: r.launchBlockNumber,
    launch_block_timestamp: r.launchBlockTimestamp,
    status: r.status,
  }));

  const supabase = {
    from(table: string) {
      assert.equal(table, "pons_launches");
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  const api = {
                    gt(col: string, value: unknown) {
                      capture.gt = { col, value };
                      return Promise.resolve({
                        data: dbRows.filter(
                          (r) => Number(r.launch_block_number) > Number(value),
                        ),
                        error: null,
                      });
                    },
                    gte(col: string, value: unknown) {
                      capture.gte = { col, value };
                      return Promise.resolve({
                        data: dbRows.filter(
                          (r) => Number(r.launch_block_number) >= Number(value),
                        ),
                        error: null,
                      });
                    },
                  };
                  return api;
                },
                gt(col: string, value: unknown) {
                  // fired loader: status eq then timestamp gt then optional block filter
                  capture.gt = { col, value };
                  return {
                    gt(col2: string, value2: unknown) {
                      capture.gt = { col: col2, value: value2 };
                      return Promise.resolve({
                        data: dbRows.filter(
                          (r) =>
                            Number(r.launch_block_number) > Number(value2),
                        ),
                        error: null,
                      });
                    },
                    gte(col2: string, value2: unknown) {
                      capture.gte = { col: col2, value: value2 };
                      return Promise.resolve({
                        data: dbRows.filter(
                          (r) =>
                            Number(r.launch_block_number) >= Number(value2),
                        ),
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as WorkerSupabase;

  return supabase;
}

describe("Observation 1B boundary helpers", () => {
  it("A. legacy X=null and observation X set", () => {
    const B = 100;
    assert.equal(isProductionEligibleLaunchBlock(100, B), false);
    assert.equal(isProductionEligibleLaunchBlock(101, B), true);

    assert.equal(
      isForwardWatchEligibleLaunchBlock(100, {
        productionStartBlock: B,
        observationStartBlock: null,
      }),
      false,
    );
    assert.equal(
      isForwardWatchEligibleLaunchBlock(101, {
        productionStartBlock: B,
        observationStartBlock: null,
      }),
      true,
    );

    const X = 200;
    assert.equal(isObservationEligibleLaunchBlock(199, X), false);
    assert.equal(isObservationEligibleLaunchBlock(200, X), true);
    assert.equal(isObservationEligibleLaunchBlock(201, X), true);
    assert.equal(
      isForwardWatchEligibleLaunchBlock(199, {
        productionStartBlock: B,
        observationStartBlock: X,
      }),
      false,
    );
    assert.equal(
      isForwardWatchEligibleLaunchBlock(200, {
        productionStartBlock: B,
        observationStartBlock: X,
      }),
      true,
    );
  });
});

describe("Observation 1B ACTIVE / fired loaders", () => {
  it("B. ACTIVE loader: X null uses >B; X set uses >=X", async () => {
    const rows = [launchRow(100), launchRow(150), launchRow(200), launchRow(201)];
    const capLegacy: QueryCapture = {};
    const legacy = await loadActiveLaunches(
      createLaunchQueryMock(rows, capLegacy),
      4663,
      { productionStartBlock: 100, observationStartBlock: null },
    );
    assert.deepEqual(capLegacy.gt, { col: "launch_block_number", value: 100 });
    assert.equal(capLegacy.gte, undefined);
    assert.equal(legacy.every((r) => r.launchBlockNumber > 100), true);

    const capObs: QueryCapture = {};
    const obs = await loadActiveLaunches(
      createLaunchQueryMock(rows, capObs),
      4663,
      { productionStartBlock: 100, observationStartBlock: 200 },
    );
    assert.deepEqual(capObs.gte, { col: "launch_block_number", value: 200 });
    assert.ok(obs.every((r) => r.launchBlockNumber >= 200));
    assert.equal(obs.some((r) => r.launchBlockNumber === 150), false);
  });

  it("C. fired continuationWatch loader excludes pre-X", async () => {
    const rows = [
      launchRow(199, "fired"),
      launchRow(200, "fired"),
      launchRow(250, "fired"),
    ];
    const cap: QueryCapture = {};
    // Use a simpler mock for fired path (eq status → gt timestamp → gte/gt block)
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      gt() {
                        return {
                          gte(col: string, value: unknown) {
                            cap.gte = { col, value };
                            return Promise.resolve({
                              data: rows
                                .filter((r) => r.launchBlockNumber >= Number(value))
                                .map((r) => ({
                                  chain_id: r.chainId,
                                  token_address: r.tokenAddress,
                                  market_address: r.marketAddress,
                                  factory_address: r.factoryAddress,
                                  factory_version: r.factoryVersion,
                                  launch_tx_hash: r.launchTxHash,
                                  launch_block_number: r.launchBlockNumber,
                                  launch_block_timestamp: r.launchBlockTimestamp,
                                  status: r.status,
                                })),
                              error: null,
                            });
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as WorkerSupabase;

    const out = await loadFiredLaunchesForContinuationWatch(supabase, 4663, {
      launchTimestampAfterIso: "2020-01-01T00:00:00.000Z",
      productionStartBlock: 100,
      observationStartBlock: 200,
    });
    assert.deepEqual(cap.gte, { col: "launch_block_number", value: 200 });
    assert.equal(out.length, 2);
    assert.equal(out.some((r) => r.launchBlockNumber === 199), false);
  });
});

describe("Observation 1B factory/RAM/watch", () => {
  it("D–F. RAM admission + watched tokens respect X", () => {
    const B = 100;
    const X = 200;
    const memory: WorkerMemoryModel = {
      activeTokens: new Map(),
      continuationWatch: new Map(),
      continuationResolved: new Set(),
      confirmedBuyers: new Map(),
      rollingFirstBuyers: new Map(),
    };

    const mk = (block: number) => ({
      tokenAddress: `0x${block.toString(16).padStart(40, "0")}`,
      marketAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      factoryAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
      factoryVersion: "v1" as const,
      launchTxHash: `0x${block.toString(16).padStart(64, "0")}`,
      launchBlockNumber: block,
      launchBlockTimestampIso: new Date(1_700_000_000_000).toISOString(),
    });

    // Factory rewind may see 199; must not enter RAM when X=200
    addActiveLaunchToMemory(memory, mk(199), {
      productionStartBlock: B,
      observationStartBlock: X,
    });
    assert.equal(memory.activeTokens.size, 0);

    addActiveLaunchToMemory(memory, mk(200), {
      productionStartBlock: B,
      observationStartBlock: X,
    });
    assert.equal(memory.activeTokens.size, 1);

    addActiveLaunchToMemory(memory, mk(201), {
      productionStartBlock: B,
      observationStartBlock: X,
    });
    assert.equal(memory.activeTokens.size, 2);

    // continuationWatch post-X present in watched set
    const cont = launchRow(210, "fired");
    memory.continuationWatch.set(cont.tokenAddress, {
      tokenAddress: cont.tokenAddress,
      marketAddress: cont.marketAddress,
      factoryAddress: cont.factoryAddress,
      factoryVersion: "v1",
      launchTxHash: cont.launchTxHash,
      launchBlock: cont.launchBlockNumber,
      launchTimestamp: 1_700_000_000,
    });

    const watched = watchedTokensForScan(memory);
    assert.equal(
      watched.some((t) => t.launchBlock === 199),
      false,
    );
    assert.ok(watched.some((t) => t.launchBlock === 200));
    assert.ok(watched.some((t) => t.launchBlock === 210));

    // filter helper
    const filtered = filterForwardWatchEligibleLaunches(
      [launchRow(199), launchRow(200)],
      { productionStartBlock: B, observationStartBlock: X },
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.launchBlockNumber, 200);

    // reconstruct only receives already-filtered rows
    const mem2 = reconstructWorkerMemory([launchRow(200)], []);
    assert.equal(mem2.activeTokens.size, 1);
  });

  it("E. legacy X=null RAM still uses >B", () => {
    const memory: WorkerMemoryModel = {
      activeTokens: new Map(),
      continuationWatch: new Map(),
      continuationResolved: new Set(),
      confirmedBuyers: new Map(),
      rollingFirstBuyers: new Map(),
    };
    addActiveLaunchToMemory(
      memory,
      {
        tokenAddress: "0x0000000000000000000000000000000000000064",
        marketAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        factoryAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        factoryVersion: "v1",
        launchTxHash:
          "0x0000000000000000000000000000000000000000000000000000000000000064",
        launchBlockNumber: 100,
        launchBlockTimestampIso: new Date().toISOString(),
      },
      { productionStartBlock: 100, observationStartBlock: null },
    );
    assert.equal(memory.activeTokens.size, 0);
    addActiveLaunchToMemory(
      memory,
      {
        tokenAddress: "0x0000000000000000000000000000000000000065",
        marketAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        factoryAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
        factoryVersion: "v1",
        launchTxHash:
          "0x0000000000000000000000000000000000000000000000000000000000000065",
        launchBlockNumber: 101,
        launchBlockTimestampIso: new Date().toISOString(),
      },
      { productionStartBlock: 100, observationStartBlock: null },
    );
    assert.equal(memory.activeTokens.size, 1);
  });
});

describe("Observation 1B fire SQL contract", () => {
  it("G–H. fire RPCs guard before_observation_boundary; formulas retained", () => {
    const sql = readFileSync(
      path.join(
        root,
        "supabase/migrations/20260812223000_observation_1b_fire_observation_guard.sql",
      ),
      "utf8",
    );
    assert.match(sql, /launch_before_observation_boundary/);
    assert.match(sql, /before_observation_boundary/);
    assert.match(sql, /fire_pons_buyer_continuation/);
    assert.match(sql, /fire_pons_buying_activity/);
    assert.match(sql, /p_threshold integer DEFAULT 5/);
    assert.match(sql, /continuation_buyers.*>= 2|v_cont < 2/);
    assert.match(sql, /Does NOT activate observation/);
    assert.equal(sql.includes("UPDATE public.pons_launches"), true); // fire still flips status on burst
    assert.equal(sql.includes("activate_forward_observation"), false);
  });
});
