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
  normalizeRadarTokenAddress,
} from "@/lib/events/radar-token-detail";

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
    assert.ok(loader.includes("Promise.all"));

    const route = readSrc("src/app/api/pons/token/[tokenAddress]/route.ts");
    assert.ok(route.includes("loadRadarTokenDetail"));
    assert.ok(route.includes("invalid_token"));
    assert.ok(route.includes("404"));
  });
});
