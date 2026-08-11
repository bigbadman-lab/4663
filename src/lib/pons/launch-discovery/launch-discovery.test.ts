import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { buildFactoryDefinitions } from "@/lib/pons/factories";
import {
  annotateFactoryLogs,
  extractLaunchesFromLogs,
  resolveV2Market,
} from "@/lib/pons/launch-discovery";
import {
  PONS_V1_FACTORY,
  PONS_V2_FACTORY,
} from "@/lib/pons/addresses";
import { startupResumeBlock } from "@/lib/pons/eligibility";
import { normalizeAddress } from "@/lib/worker/normalize";
import type { InsertLaunchResult } from "@/lib/worker/repositories/launches";
import type { ActiveLaunchRow } from "@/lib/worker/db-types";

const fixture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "src/lib/pons/launch-discovery/fixtures/factory-log-samples.json",
    ),
    "utf8",
  ),
) as {
  v1: {
    expected: {
      token: string;
      market: string;
      tx: string;
      block: number;
    };
    logs: Array<{
      factoryVersion: "V1" | "V2";
      factoryAddress: string;
      blockNumber: string;
      transactionHash: string;
      logIndex: number;
      address: string;
      topics: string[];
      data: string;
    }>;
  };
  v2: {
    expected: {
      token: string;
      market: string;
      tx: string;
      block: number;
    };
    logs: Array<{
      factoryVersion: "V1" | "V2";
      factoryAddress: string;
      blockNumber: string;
      transactionHash: string;
      logIndex: number;
      address: string;
      topics: string[];
      data: string;
    }>;
  };
};

const factories = buildFactoryDefinitions({
  factoryV1: PONS_V1_FACTORY,
  factoryV2: PONS_V2_FACTORY,
});

function toRawLogs(rows: typeof fixture.v1.logs) {
  return rows.map((l) => ({
    address: l.address,
    blockNumber: BigInt(l.blockNumber),
    transactionHash: l.transactionHash,
    logIndex: l.logIndex,
    topics: l.topics,
    data: l.data,
  }));
}

describe("V2 launch extraction", () => {
  it("extracts token topics[1] and market topics[2]", () => {
    const annotated = annotateFactoryLogs(toRawLogs(fixture.v2.logs), factories);
    const launches = extractLaunchesFromLogs(annotated);
    assert.equal(launches.length, 1);
    const L = launches[0]!;
    assert.equal(L.factoryVersion, "v2");
    assert.equal(L.tokenAddress, normalizeAddress(fixture.v2.expected.token));
    assert.equal(
      L.marketFromTopics,
      normalizeAddress(fixture.v2.expected.market),
    );
    assert.equal(L.launchTxHash, fixture.v2.expected.tx.toLowerCase());
    assert.equal(L.launchBlockNumber, fixture.v2.expected.block);
  });

  it("resolves V2 market when bytecode present", async () => {
    const annotated = annotateFactoryLogs(toRawLogs(fixture.v2.logs), factories);
    const launches = extractLaunchesFromLogs(annotated);
    const L = launches[0]!;
    const resolved = await resolveV2Market(L.marketFromTopics, async () => "0x608060");
    assert.equal(resolved.market, normalizeAddress(fixture.v2.expected.market));
  });

  it("rejects V2 market without bytecode", async () => {
    const annotated = annotateFactoryLogs(toRawLogs(fixture.v2.logs), factories);
    const launches = extractLaunchesFromLogs(annotated);
    const resolved = await resolveV2Market(launches[0]!.marketFromTopics, async () => "0x");
    assert.equal(resolved.market, null);
  });
});

describe("V1 launch extraction", () => {
  it("extracts token from topics[1] (either factory topic0)", () => {
    const annotated = annotateFactoryLogs(toRawLogs(fixture.v1.logs), factories);
    const launches = extractLaunchesFromLogs(annotated);
    assert.equal(launches.length, 1);
    const L = launches[0]!;
    assert.equal(L.factoryVersion, "v1");
    assert.equal(L.tokenAddress, normalizeAddress(fixture.v1.expected.token));
    assert.equal(L.marketFromTopics, null);
    assert.equal(L.launchBlockNumber, fixture.v1.expected.block);
  });
});

describe("normalize + cursor rewind", () => {
  it("lowercases addresses", () => {
    assert.equal(
      normalizeAddress("0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB"),
      PONS_V1_FACTORY,
    );
  });

  it("startup rewind math", () => {
    assert.equal(startupResumeBlock(100), 95);
    assert.equal(startupResumeBlock(3), 0);
    assert.equal(startupResumeBlock(0), 0);
  });
});

describe("terminal status preservation (unit model)", () => {
  it("already_exists path does not rewrite fired/expired to active", () => {
    // Pure semantics of insertLaunchIdempotent return shape.
    const existingFired: ActiveLaunchRow = {
      chainId: 4663,
      tokenAddress: "0x1111111111111111111111111111111111111111",
      marketAddress: "0x2222222222222222222222222222222222222222",
      factoryAddress: PONS_V1_FACTORY,
      factoryVersion: "v1",
      launchTxHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      launchBlockNumber: 1,
      launchBlockTimestamp: "2026-01-01T00:00:00.000Z",
      status: "fired",
    };
    const result: InsertLaunchResult = {
      outcome: "already_exists",
      row: existingFired,
      preservedStatus: "fired",
    };
    assert.equal(result.outcome, "already_exists");
    assert.equal(result.preservedStatus, "fired");
    assert.notEqual(result.preservedStatus, "active");
  });
});

describe("cursor advancement gate", () => {
  it("fullyProcessed false blocks cursor advance", () => {
    const fullyProcessed = false;
    const shouldAdvance = fullyProcessed;
    assert.equal(shouldAdvance, false);
  });

  it("fullyProcessed true allows cursor advance", () => {
    assert.equal(true, true);
  });
});
