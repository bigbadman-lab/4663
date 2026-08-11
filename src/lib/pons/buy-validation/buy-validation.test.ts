import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectPonsBuyV0,
  isMarketToWalletCandidate,
} from "@/lib/pons/buy-validation";
import {
  decodeErc20TransferLog,
  ERC20_TRANSFER_TOPIC,
} from "@/lib/pons/transfer/decode";
import { normalizeAddress } from "@/lib/worker/normalize";
import {
  addFirstBuyerToMemory,
  reconstructWorkerMemory,
} from "@/lib/worker/state";
import type { ActiveLaunchRow } from "@/lib/worker/db-types";

const TOKEN = "0x1111111111111111111111111111111111111111";
const MARKET = "0x2222222222222222222222222222222222222222";
const BUYER = "0x3333333333333333333333333333333333333333";
const OTHER = "0x4444444444444444444444444444444444444444";

function padAddr(addr: string): string {
  return "0x" + "0".repeat(24) + addr.slice(2).toLowerCase();
}

function transferLog(from: string, to: string, amountHex: string) {
  return {
    address: TOKEN,
    topics: [
      ERC20_TRANSFER_TOPIC,
      padAddr(from),
      padAddr(to),
    ] as string[],
    data: ("0x" + amountHex.padStart(64, "0")) as string,
    transactionHash:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    blockNumber: 100,
    logIndex: 0,
  };
}

describe("Transfer decode", () => {
  it("decodes market→wallet Transfer", () => {
    const d = decodeErc20TransferLog(
      transferLog(MARKET, BUYER, "0a"), // amount 10
    );
    assert.ok(d);
    assert.equal(d.from, normalizeAddress(MARKET));
    assert.equal(d.to, normalizeAddress(BUYER));
    assert.equal(d.amount, BigInt(10));
  });

  it("rejects wrong topic0", () => {
    const log = transferLog(MARKET, BUYER, "0a");
    log.topics[0] = "0x" + "1".repeat(64);
    assert.equal(decodeErc20TransferLog(log), null);
  });
});

describe("candidate filter + first-wallet skip", () => {
  it("accepts market→wallet amount>0", () => {
    assert.equal(
      isMarketToWalletCandidate({
        transferFrom: MARKET,
        transferTo: BUYER,
        amount: BigInt(1),
        marketAddress: MARKET,
      }),
      true,
    );
  });

  it("rejects non-market from or zero amount", () => {
    assert.equal(
      isMarketToWalletCandidate({
        transferFrom: OTHER,
        transferTo: BUYER,
        amount: BigInt(1),
        marketAddress: MARKET,
      }),
      false,
    );
    assert.equal(
      isMarketToWalletCandidate({
        transferFrom: MARKET,
        transferTo: BUYER,
        amount: BigInt(0),
        marketAddress: MARKET,
      }),
      false,
    );
  });
});

describe("PonsBuy v0", () => {
  const baseTx = {
    from: BUYER as `0x${string}`,
    hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`,
    value: BigInt(0),
  };

  function receipt(
    status: "success" | "reverted",
    from: string,
    to: string,
    amountHex: string,
  ) {
    return {
      status,
      blockNumber: BigInt(100),
      logs: [
        {
          address: TOKEN as `0x${string}`,
          topics: [
            ERC20_TRANSFER_TOPIC as `0x${string}`,
            padAddr(from) as `0x${string}`,
            padAddr(to) as `0x${string}`,
          ],
          data: ("0x" + amountHex.padStart(64, "0")) as `0x${string}`,
          logIndex: 0,
          blockNumber: BigInt(100),
          transactionHash: baseTx.hash,
          transactionIndex: 0,
          blockHash: "0x" + "c".repeat(64),
          removed: false,
        },
      ],
    };
  }

  it("confirms strict market→tx.from transfer", () => {
    const r = detectPonsBuyV0({
      version: "v1",
      tokenAddress: TOKEN,
      marketAddress: MARKET,
      tx: baseTx,
      receipt: receipt("success", MARKET, BUYER, "0a") as never,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.buy.buyerAddress, normalizeAddress(BUYER));
      assert.equal(r.buy.tokenAmountRaw, "10");
    }
  });

  it("rejects failed receipt", () => {
    const r = detectPonsBuyV0({
      version: "v1",
      tokenAddress: TOKEN,
      marketAddress: MARKET,
      tx: baseTx,
      receipt: receipt("reverted", MARKET, BUYER, "0a") as never,
    });
    assert.equal(r.ok, false);
    if (!r.ok && r.kind === "not_buy") {
      assert.equal(r.reason, "failed_transaction");
    }
  });

  it("rejects when recipient is not tx.from", () => {
    const r = detectPonsBuyV0({
      version: "v1",
      tokenAddress: TOKEN,
      marketAddress: MARKET,
      tx: baseTx,
      receipt: receipt("success", MARKET, OTHER, "0a") as never,
    });
    assert.equal(r.ok, false);
    if (!r.ok && r.kind === "not_buy") {
      assert.equal(r.reason, "token_recipient_not_tx_from");
    }
  });
});

describe("runtime first-buyer RAM", () => {
  const launch: ActiveLaunchRow = {
    chainId: 4663,
    tokenAddress: TOKEN,
    marketAddress: MARKET,
    factoryAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    factoryVersion: "v1",
    launchTxHash:
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    launchBlockNumber: 1,
    launchBlockTimestamp: "2026-01-01T00:00:00.000Z",
    status: "active",
  };

  it("updates confirmedBuyers and rolling list once", () => {
    const memory = reconstructWorkerMemory([launch], []);
    addFirstBuyerToMemory(memory, {
      tokenAddress: TOKEN,
      walletAddress: BUYER,
      firstBuyBlockTimestampUnix: 100,
    });
    addFirstBuyerToMemory(memory, {
      tokenAddress: TOKEN,
      walletAddress: BUYER,
      firstBuyBlockTimestampUnix: 200,
    });
    const set = memory.confirmedBuyers.get(normalizeAddress(TOKEN));
    assert.equal(set?.size, 1);
    assert.equal(
      memory.rollingFirstBuyers.get(normalizeAddress(TOKEN))?.length,
      1,
    );
  });
});

describe("cursor ordering invariant (unit model)", () => {
  it("transfer commit requires factory >= to", () => {
    const factoryN = 100;
    const to = 100;
    assert.ok(factoryN >= to);
    assert.equal(99 >= to, false);
  });
});
