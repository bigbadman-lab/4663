/**
 * Instant TokenLaunched decoder — real Robinhood Chain specimen.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, pad, parseAbiParameters, zeroAddress } from "viem";
import {
  POOLS_INSTANT_STRATEGY_V3_2_0,
  POOLS_TOKEN_LAUNCHED_TOPIC0,
} from "@/lib/pools/addresses";
import {
  decodePoolsInstantTokenLaunched,
  extractPoolsInstantLaunchesFromLogs,
} from "@/lib/pools/launch-discovery/decode";

/** Confirmed live Instant launch. */
const SPECIMEN_TOKEN =
  "0x87380657B18Eb20B57B66d9759De4262d2531Fa2".toLowerCase() as `0x${string}`;
const SPECIMEN_POOL_ID =
  "0xf880faadd73dd6eca13ee7d1e3958e6aef3e65a114b4123fb4007f6069406444";
const FEE_SPLITTER =
  "0xeFF166AAf189323c58dc27eD1206EB2C37FaACDf".toLowerCase();
const TX =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function padAddr(address: string): `0x${string}` {
  return pad(address as `0x${string}`) as `0x${string}`;
}

function specimenData(): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters(
      "address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks",
    ),
    [zeroAddress, SPECIMEN_TOKEN, 2500, 25, zeroAddress],
  );
}

function specimenLog(overrides: Record<string, unknown> = {}) {
  return {
    address: POOLS_INSTANT_STRATEGY_V3_2_0,
    blockNumber: 35_000_001,
    transactionHash: TX,
    logIndex: 4,
    topics: [
      POOLS_TOKEN_LAUNCHED_TOPIC0,
      SPECIMEN_POOL_ID,
      padAddr(SPECIMEN_TOKEN),
      padAddr(FEE_SPLITTER),
    ],
    data: specimenData(),
    ...overrides,
  };
}

describe("decodePoolsInstantTokenLaunched", () => {
  it("decodes the confirmed Instant specimen (token=topic2, poolId=topic1)", () => {
    const decoded = decodePoolsInstantTokenLaunched(specimenLog());
    assert.ok(decoded);
    assert.equal(decoded.launchpad, "pools");
    assert.equal(decoded.sourceVersion, "instant-v3.2.0");
    assert.equal(decoded.sourceContract, POOLS_INSTANT_STRATEGY_V3_2_0);
    assert.equal(decoded.poolId, SPECIMEN_POOL_ID);
    assert.equal(decoded.tokenAddress, SPECIMEN_TOKEN);
    assert.equal(decoded.finalPositionRecipient, FEE_SPLITTER);
    assert.equal(decoded.poolKey.currency0, zeroAddress.toLowerCase());
    assert.equal(decoded.poolKey.currency1, SPECIMEN_TOKEN);
    assert.equal(decoded.poolKey.fee, 2500);
    assert.equal(decoded.poolKey.tickSpacing, 25);
    assert.equal(decoded.poolKey.hooks, zeroAddress.toLowerCase());
    assert.equal(decoded.launchedTokenCurrencyIndex, 1);
    assert.equal(decoded.launchBlockNumber, 35_000_001);
    assert.equal(decoded.launchTxHash, TX);
  });

  it("rejects wrong emitting contract", () => {
    assert.equal(
      decodePoolsInstantTokenLaunched(
        specimenLog({
          address: "0xad44d55e7f8337c3ce113fbb591486e85be104b2",
        }),
      ),
      null,
    );
  });

  it("rejects wrong topic0", () => {
    const log = specimenLog();
    log.topics = [
      "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607",
      ...log.topics.slice(1),
    ];
    assert.equal(decodePoolsInstantTokenLaunched(log), null);
  });

  it("rejects malformed topics / data", () => {
    assert.equal(
      decodePoolsInstantTokenLaunched(specimenLog({ topics: [POOLS_TOKEN_LAUNCHED_TOPIC0] })),
      null,
    );
    assert.equal(
      decodePoolsInstantTokenLaunched(specimenLog({ data: "0x" })),
      null,
    );
    assert.equal(
      decodePoolsInstantTokenLaunched(
        specimenLog({ blockNumber: null, transactionHash: null }),
      ),
      null,
    );
  });

  it("extracts one launch per tx+token and ignores other factories", () => {
    const extracted = extractPoolsInstantLaunchesFromLogs([
      specimenLog(),
      specimenLog({ logIndex: 9 }),
      {
        address: "0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb",
        blockNumber: 35_000_001,
        transactionHash: TX,
        logIndex: 0,
        topics: [POOLS_TOKEN_LAUNCHED_TOPIC0, SPECIMEN_POOL_ID],
        data: "0x",
      },
    ]);
    assert.equal(extracted.length, 1);
    assert.equal(extracted[0]!.tokenAddress, SPECIMEN_TOKEN);
    assert.equal(extracted[0]!.poolId, SPECIMEN_POOL_ID);
  });
});
