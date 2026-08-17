/**
 * V2 curve map includes every persisted launch status and never assumes ETH.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addPonsV2LaunchToFeeIndex,
  createPonsV2FeeCurveIndex,
  rememberQuoteToken,
  reconstructPonsV2FeeCurveIndex,
} from "@/lib/pons/curve-fee/curve-map";
import { NATIVE_QUOTE_TOKEN_ADDRESS } from "@/lib/pons/curve-fee/constants";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const CURVE_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CURVE_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";
const QUOTE_ERC20 = "0x3333333333333333333333333333333333333333";

describe("PonsV2FeeCurveIndex", () => {
  it("indexes V2 launches of any status and ignores V1", () => {
    const index = createPonsV2FeeCurveIndex();
    assert.equal(
      addPonsV2LaunchToFeeIndex(index, {
        factoryVersion: "v2",
        tokenAddress: TOKEN_A,
        marketAddress: CURVE_A,
        launchBlockNumber: 10,
      }),
      true,
    );
    assert.equal(
      addPonsV2LaunchToFeeIndex(index, {
        factoryVersion: "v2",
        tokenAddress: TOKEN_B,
        marketAddress: CURVE_B,
        launchBlockNumber: 20,
      }),
      true,
    );
    assert.equal(
      addPonsV2LaunchToFeeIndex(index, {
        factoryVersion: "v1",
        tokenAddress: "0x4444444444444444444444444444444444444444",
        marketAddress: "0x5555555555555555555555555555555555555555",
        launchBlockNumber: 5,
      }),
      false,
    );
    assert.equal(index.byCurve.size, 2);
    assert.equal(index.byCurve.get(CURVE_A)?.tokenAddress, TOKEN_A);
    assert.equal(index.byCurve.get(CURVE_A)?.quoteTokenAddress, null);
  });

  it("reconstructs fired/expired V2 rows and cached non-ETH quotes", async () => {
    const launches = [
      {
        token_address: TOKEN_A,
        market_address: CURVE_A,
        launch_block_number: 10,
        status: "fired",
        factory_version: "v2",
      },
      {
        token_address: TOKEN_B,
        market_address: CURVE_B,
        launch_block_number: 20,
        status: "expired",
        factory_version: "v2",
      },
    ];
    const metrics = [
      {
        token_address: TOKEN_A,
        quote_token_address: QUOTE_ERC20,
      },
    ];
    const supabase = {
      from(table: string) {
        const rows = table === "pons_launches" ? launches : metrics;
        const q = {
          select() {
            return q;
          },
          eq() {
            return q;
          },
          order() {
            return q;
          },
          range() {
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return q;
      },
    } as unknown as WorkerSupabase;

    const index = await reconstructPonsV2FeeCurveIndex(supabase, 4663);
    assert.equal(index.byCurve.size, 2);
    assert.equal(index.byCurve.get(CURVE_A)?.quoteTokenAddress, QUOTE_ERC20);
    assert.equal(index.byCurve.get(CURVE_B)?.quoteTokenAddress, null);
    assert.notEqual(
      index.byCurve.get(CURVE_A)?.quoteTokenAddress,
      NATIVE_QUOTE_TOKEN_ADDRESS,
    );
  });

  it("rememberQuoteToken stores exact addresses including native zero", () => {
    const index = createPonsV2FeeCurveIndex();
    addPonsV2LaunchToFeeIndex(index, {
      factoryVersion: "v2",
      tokenAddress: TOKEN_A,
      marketAddress: CURVE_A,
      launchBlockNumber: 1,
    });
    rememberQuoteToken(index, CURVE_A, NATIVE_QUOTE_TOKEN_ADDRESS);
    assert.equal(
      index.byCurve.get(CURVE_A)?.quoteTokenAddress,
      NATIVE_QUOTE_TOKEN_ADDRESS,
    );
    rememberQuoteToken(index, CURVE_A, QUOTE_ERC20);
    assert.equal(index.byCurve.get(CURVE_A)?.quoteTokenAddress, QUOTE_ERC20);
  });
});
