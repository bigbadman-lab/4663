/**
 * RADAR token detail helpers — validation, timeline, bounds (no RPC).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RADAR_TOKEN_DETAIL_BUYER_LIMIT,
  buildRadarTimeline,
  loadRadarTokenDetail,
  normalizeRadarTokenAddress,
} from "@/lib/events/radar-token-detail";
import type { SupabaseClient } from "@supabase/supabase-js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TX = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

describe("radar token detail", () => {
  it("validates token addresses", () => {
    assert.equal(normalizeRadarTokenAddress(TOKEN), TOKEN);
    assert.equal(normalizeRadarTokenAddress(`  ${TOKEN.toUpperCase()}  `), TOKEN);
    assert.equal(normalizeRadarTokenAddress("not-an-address"), null);
    assert.equal(normalizeRadarTokenAddress("0x1234"), null);
  });

  it("builds deterministic bounded timeline", () => {
    const launch = "2026-08-14T12:00:00.000Z";
    const timeline = buildRadarTimeline({
      launchTimestamp: launch,
      launchTxHash: TX,
      launchBlockNumber: 100,
      buyers: [
        {
          wallet: WALLET,
          txHash: TX.replace(/c/g, "d"),
          blockNumber: 101,
          timestamp: "2026-08-14T12:01:00.000Z",
          ageSec: 60,
        },
        {
          wallet: WALLET,
          txHash: TX.replace(/c/g, "e"),
          blockNumber: 102,
          timestamp: "2026-08-14T12:04:00.000Z",
          ageSec: 240,
        },
      ],
      continuationTimestamp: "2026-08-14T12:04:30.000Z",
      qualificationTxHash: TX.replace(/c/g, "f"),
      qualificationBlockNumber: 103,
      buyerLimit: 10,
    });

    assert.equal(timeline[0]!.kind, "token_launched");
    assert.equal(timeline[0]!.label, "TOKEN LAUNCHED");
    assert.ok(timeline.some((e) => e.label === "EARLY BUYER"));
    assert.ok(timeline.some((e) => e.label === "CONTINUATION BUYER #1"));
    assert.ok(timeline.some((e) => e.label === "ADDED TO RADAR"));

    const times = timeline.map((e) => Date.parse(e.at));
    for (let i = 1; i < times.length; i += 1) {
      assert.ok(times[i]! >= times[i - 1]!);
    }
  });

  it("bounds buyer rows and never calls chain RPC", () => {
    assert.equal(RADAR_TOKEN_DETAIL_BUYER_LIMIT, 40);
    const loader = readSrc("src/lib/events/radar-token-detail.ts");
    assert.equal(loader.includes("eth_"), false);
    assert.equal(loader.includes("alchemy"), false);
    assert.equal(loader.includes("createPublicClient"), false);
    assert.ok(loader.includes("pons_launches"));
    assert.ok(loader.includes("pons_first_buyers"));
    assert.ok(loader.includes("pools_instant_launches"));
    assert.ok(loader.includes("pools_first_buyers"));
    assert.ok(loader.includes("launchpad"));
    assert.ok(loader.includes("options.launchpad"));
    assert.equal(loader.includes("EVENT_SOURCE_PONS"), false);
    assert.ok(loader.includes("Promise.all"));

    const route = readSrc("src/app/api/pons/token/[tokenAddress]/route.ts");
    assert.ok(route.includes("loadRadarTokenDetail"));
    assert.ok(route.includes("parseLaunchpad"));
    assert.ok(route.includes("searchParams.get(\"launchpad\")"));
    assert.ok(route.includes("invalid_token"));
    assert.ok(route.includes("404"));
  });

  it("POOLS detail lookup does not require a PONS market", () => {
    const loader = readSrc("src/lib/events/radar-token-detail.ts");
    assert.ok(loader.includes('launchpad === "pools"'));
    assert.ok(loader.includes("marketAddress: marketFromEvent ?? marketFromLaunch"));
    assert.ok(loader.includes('launchpad === "pons"'));
    const panel = readSrc("src/components/canvas/pons-monitoring-panel.tsx");
    assert.ok(panel.includes("detail.marketAddress"));
    assert.equal(panel.includes("PONS {detail.factoryVersion"), false);
    assert.ok(panel.includes("launchpadDetailLabel"));
  });

  it("loads PONS vs POOLS from the matching launch/buyer tables", async () => {
    const pons = await loadRadarTokenDetail(
      mockDetailSupabase("pons"),
      TOKEN,
      { launchpad: "pons" },
    );
    assert.equal(pons.ok, true);
    if (pons.ok) {
      assert.equal(pons.body.launchpad, "pons");
      assert.equal(
        pons.body.marketAddress,
        "0x1111111111111111111111111111111111111111",
      );
      assert.equal(pons.body.factoryVersion, "v2");
    }

    const pools = await loadRadarTokenDetail(
      mockDetailSupabase("pools"),
      TOKEN,
      { launchpad: "pools" },
    );
    assert.equal(pools.ok, true);
    if (pools.ok) {
      assert.equal(pools.body.launchpad, "pools");
      assert.equal(pools.body.marketAddress, null);
      assert.equal(pools.body.factoryVersion, null);
      assert.equal(pools.body.factoryAddress, null);
    }
  });
});

function thenableQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    then(
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

function mockDetailSupabase(source: "pons" | "pools"): SupabaseClient {
  return {
    from(table: string) {
      if (table === "production_state") {
        return thenableQuery({
          data: { production_start_block: 34002666 },
          error: null,
        });
      }
      if (table === "events") {
        return thenableQuery({
          data: {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            event_type: "pons_buyer_continuation",
            token_address: TOKEN,
            market_address:
              source === "pons"
                ? "0x1111111111111111111111111111111111111111"
                : "0x23f8209572b4a1c2ad88a42749e830791fb027f1",
            occurred_at: "2026-08-17T12:04:00.000Z",
            new_buyers: 2,
            trigger_tx_hash: TX,
            trigger_block_number: 34002700,
            payload: { launch_block_number: 34002670, pre_3m_buyers: 1, continuation_buyers: 2 },
            source,
          },
          error: null,
        });
      }
      if (table === "pons_launches") {
        assert.equal(source, "pons");
        return thenableQuery({
          data: {
            token_address: TOKEN,
            market_address: "0x1111111111111111111111111111111111111111",
            factory_version: "v2",
            factory_address: "0x2222222222222222222222222222222222222222",
            launch_block_number: 34002670,
            launch_block_timestamp: "2026-08-17T12:00:00.000Z",
            launch_tx_hash: TX,
          },
          error: null,
        });
      }
      if (table === "pools_instant_launches") {
        assert.equal(source, "pools");
        return thenableQuery({
          data: {
            token_address: TOKEN,
            launch_block_number: 34002670,
            launch_block_timestamp: "2026-08-17T12:00:00.000Z",
            launch_tx_hash: TX,
          },
          error: null,
        });
      }
      if (table === "pons_first_buyers" || table === "pools_first_buyers") {
        return thenableQuery({
          data: [
            {
              wallet_address: WALLET,
              first_buy_tx_hash: TX,
              first_buy_block_number: 34002680,
              first_buy_block_timestamp: "2026-08-17T12:01:00.000Z",
            },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}
