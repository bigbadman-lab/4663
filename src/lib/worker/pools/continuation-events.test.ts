/**
 * Phase 2 event uniqueness includes source; Phase 3 public watchlist aggregates both.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { toRadarFirstBuyer } from "@/lib/radar/first-buyers";
import { ramPoolsContinuationEligible } from "@/lib/worker/pools/continuation-eval";
import {
  addPoolsFirstBuyerToMemory,
  addPoolsLaunchToWatch,
  createPoolsWorkerMemory,
} from "@/lib/worker/pools/state";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("POOLS continuation events + RADAR boundary", () => {
  it("migration unique constraint includes source", () => {
    const sql = readSrc(
      "supabase/migrations/20260817140000_radar_pools_instant_buyers.sql",
    );
    assert.ok(sql.includes("events_token_event_source_unique"));
    assert.ok(sql.includes("UNIQUE (chain_id, event_type, source, token_address)"));
    assert.ok(sql.includes("fire_pools_buyer_continuation"));
    assert.ok(sql.includes("AND source = 'pools'"));
    assert.ok(sql.includes("AND source = 'pons'"));
    assert.ok(sql.includes("CREATE TABLE public.pools_first_buyers"));
    assert.equal(sql.includes("INSERT INTO public.pons_launches"), false);
  });

  it("public watchlist query includes PONS and POOLS in one ranked list", () => {
    const loader = readSrc("src/lib/events/continuation-watchlist.ts");
    assert.ok(loader.includes("EVENT_SOURCE_POOLS"));
    assert.ok(loader.includes("RADAR_WATCHLIST_SOURCES"));
    assert.ok(loader.includes('.in("source"'));
    assert.equal(loader.includes('.eq("source", EVENT_SOURCE_PONS)'), false);
  });

  it("Candidate B thresholds are reused for POOLS RAM eligibility", () => {
    const memory = createPoolsWorkerMemory();
    const launchTs = 1_000;
    addPoolsLaunchToWatch(memory, {
      tokenAddress: "0x87380657b18eb20b57b66d9759de4262d2531fa2",
      poolId:
        "0xf880faadd73dd6eca13ee7d1e3958e6aef3e65a114b4123fb4007f6069406444",
      launchedTokenCurrencyIndex: 1,
      sourceContract: "0x23f8209572b4a1c2ad88a42749e830791fb027f1",
      launchTxHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      launchBlock: 1,
      launchTimestamp: launchTs,
    });
    const token = memory.watch.get(
      "0x87380657b18eb20b57b66d9759de4262d2531fa2",
    )!;
    addPoolsFirstBuyerToMemory(memory, {
      tokenAddress: token.tokenAddress,
      walletAddress: "0x1111111111111111111111111111111111111111",
      firstBuyBlockTimestampUnix: launchTs + 10,
    });
    assert.equal(ramPoolsContinuationEligible(memory, token), false);
    addPoolsFirstBuyerToMemory(memory, {
      tokenAddress: token.tokenAddress,
      walletAddress: "0x2222222222222222222222222222222222222222",
      firstBuyBlockTimestampUnix: launchTs + 180,
    });
    assert.equal(ramPoolsContinuationEligible(memory, token), false);
    addPoolsFirstBuyerToMemory(memory, {
      tokenAddress: token.tokenAddress,
      walletAddress: "0x3333333333333333333333333333333333333333",
      firstBuyBlockTimestampUnix: launchTs + 200,
    });
    assert.equal(ramPoolsContinuationEligible(memory, token), true);
  });

  it("RADAR first-buyer mapping hides pool mechanics", () => {
    const mapped = toRadarFirstBuyer(
      {
        chainId: 4663,
        tokenAddress: "0x87380657b18eb20b57b66d9759de4262d2531fa2",
        walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        firstBuyTxHash:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        firstBuyBlockNumber: 35_000_200,
        firstBuyBlockTimestamp: "2026-08-17T12:00:00.000Z",
      },
      "pools",
    );
    assert.equal(mapped.launchpad, "pools");
    assert.equal(mapped.tokenAddress, "0x87380657b18eb20b57b66d9759de4262d2531fa2");
    assert.equal("poolId" in mapped, false);
    assert.equal("marketAddress" in mapped, false);
  });
});
