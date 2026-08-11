import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startupResumeBlock } from "@/lib/pons/eligibility";
import {
  CURSOR_STREAM_PONS_FACTORIES,
  CURSOR_STREAM_PONS_TRANSFERS,
} from "@/lib/pons/constants";
import { prepareStartupCursors } from "@/lib/worker/cursor-runtime";
import { normalizeAddress, normalizeHex } from "@/lib/worker/normalize";
import { reconstructWorkerMemory } from "@/lib/worker/state";
import type { ActiveLaunchRow, FirstBuyerRow } from "@/lib/worker/db-types";
import type { CursorStreamName } from "@/lib/pons/types";
import type { CursorRow } from "@/lib/worker/db-types";

describe("cursor rewind", () => {
  it("N=100 → 95", () => {
    assert.equal(startupResumeBlock(100), 95);
  });

  it("N=3 → 0", () => {
    assert.equal(startupResumeBlock(3), 0);
  });

  it("N=0 → 0", () => {
    assert.equal(startupResumeBlock(0), 0);
  });

  it("prepareStartupCursors does not invent durable N when missing", () => {
    const cursors = new Map<CursorStreamName, CursorRow | null>([
      [CURSOR_STREAM_PONS_FACTORIES, null],
      [
        CURSOR_STREAM_PONS_TRANSFERS,
        {
          streamName: CURSOR_STREAM_PONS_TRANSFERS,
          chainId: 4663,
          lastProcessedBlock: 100,
        },
      ],
    ]);

    const plans = prepareStartupCursors(cursors);
    const factories = plans.find(
      (p) => p.streamName === CURSOR_STREAM_PONS_FACTORIES,
    );
    const transfers = plans.find(
      (p) => p.streamName === CURSOR_STREAM_PONS_TRANSFERS,
    );

    assert.equal(factories?.lastProcessedBlock, null);
    assert.equal(factories?.startupFromBlock, 0);
    assert.equal(transfers?.lastProcessedBlock, 100);
    assert.equal(transfers?.startupFromBlock, 95);
  });
});

describe("normalize", () => {
  it("lowercases addresses and hashes", () => {
    assert.equal(
      normalizeAddress("0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB"),
      "0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb",
    );
    assert.equal(normalizeHex(" 0xABC "), "0xabc");
  });
});

describe("state reconstruction", () => {
  const launchBase: ActiveLaunchRow = {
    chainId: 4663,
    tokenAddress: "0xTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    marketAddress: "0xMarketAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    factoryAddress: "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB",
    factoryVersion: "v1",
    launchTxHash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    launchBlockNumber: 1000,
    launchBlockTimestamp: "2026-01-01T00:00:00.000Z",
    status: "active",
  };

  it("maps ACTIVE launches into activeTokens", () => {
    const memory = reconstructWorkerMemory([launchBase], []);
    const token = normalizeAddress(launchBase.tokenAddress);
    assert.equal(memory.activeTokens.size, 1);
    const state = memory.activeTokens.get(token);
    assert.ok(state);
    assert.equal(state.launchBlock, 1000);
    assert.equal(state.launchTimestamp, Date.parse("2026-01-01T00:00:00.000Z") / 1000);
    assert.equal(state.factoryVersion, "v1");
    assert.equal(
      state.factoryAddress,
      "0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb",
    );
  });

  it("deduplicates confirmed buyers into a Set and keeps queue order", () => {
    const token = normalizeAddress(launchBase.tokenAddress);
    const buyers: FirstBuyerRow[] = [
      {
        chainId: 4663,
        tokenAddress: launchBase.tokenAddress,
        walletAddress: "0x1111111111111111111111111111111111111111",
        firstBuyTxHash:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        firstBuyBlockNumber: 1001,
        firstBuyBlockTimestamp: "2026-01-01T00:01:00.000Z",
      },
      {
        chainId: 4663,
        tokenAddress: launchBase.tokenAddress,
        walletAddress: "0x2222222222222222222222222222222222222222",
        firstBuyTxHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        firstBuyBlockNumber: 1002,
        firstBuyBlockTimestamp: "2026-01-01T00:02:00.000Z",
      },
      // Same wallet again (should be ignored if passed)
      {
        chainId: 4663,
        tokenAddress: launchBase.tokenAddress,
        walletAddress: "0x1111111111111111111111111111111111111111",
        firstBuyTxHash:
          "0x3333333333333333333333333333333333333333333333333333333333333333",
        firstBuyBlockNumber: 1003,
        firstBuyBlockTimestamp: "2026-01-01T00:03:00.000Z",
      },
    ];

    const memory = reconstructWorkerMemory([launchBase], buyers);
    const set = memory.confirmedBuyers.get(token);
    assert.ok(set);
    assert.equal(set.size, 2);
    assert.ok(set.has("0x1111111111111111111111111111111111111111"));
    assert.ok(set.has("0x2222222222222222222222222222222222222222"));

    const rolling = memory.rollingFirstBuyers.get(token);
    assert.ok(rolling);
    assert.equal(rolling.length, 2);
    assert.equal(rolling[0]?.walletAddress, "0x1111111111111111111111111111111111111111");
    assert.equal(rolling[1]?.walletAddress, "0x2222222222222222222222222222222222222222");
  });

  it("ignores buyers for tokens that are not ACTIVE in memory", () => {
    const buyers: FirstBuyerRow[] = [
      {
        chainId: 4663,
        tokenAddress: "0xdead000000000000000000000000000000000001",
        walletAddress: "0x1111111111111111111111111111111111111111",
        firstBuyTxHash:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        firstBuyBlockNumber: 1,
        firstBuyBlockTimestamp: "2026-01-01T00:01:00.000Z",
      },
    ];
    const memory = reconstructWorkerMemory([launchBase], buyers);
    assert.equal(memory.confirmedBuyers.get(normalizeAddress(launchBase.tokenAddress))?.size, 0);
    assert.equal(memory.confirmedBuyers.has("0xdead000000000000000000000000000000000001"), false);
  });
});
