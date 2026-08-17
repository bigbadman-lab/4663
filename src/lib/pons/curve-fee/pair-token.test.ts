import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeFunctionResult, parseAbi } from "viem";
import { NATIVE_QUOTE_TOKEN_ADDRESS } from "@/lib/pons/curve-fee/constants";
import {
  decodePairTokenResult,
  PAIR_TOKEN_CALLDATA,
  readCurvePairToken,
} from "@/lib/pons/curve-fee/pair-token";

const ERC20 = "0x3333333333333333333333333333333333333333";
const ABI = parseAbi(["function pairToken() view returns (address)"]);

describe("readCurvePairToken", () => {
  it("decodes pairToken including native zero and ERC-20 quotes", () => {
    const native = encodeFunctionResult({
      abi: ABI,
      functionName: "pairToken",
      result: NATIVE_QUOTE_TOKEN_ADDRESS,
    });
    const erc20 = encodeFunctionResult({
      abi: ABI,
      functionName: "pairToken",
      result: ERC20,
    });
    assert.equal(decodePairTokenResult(native), NATIVE_QUOTE_TOKEN_ADDRESS);
    assert.equal(decodePairTokenResult(erc20), ERC20);
    assert.ok(PAIR_TOKEN_CALLDATA.startsWith("0x"));
  });

  it("rejects empty or truncated ABI data instead of guessing ETH", () => {
    assert.throws(() => decodePairTokenResult("0x"), /32-byte/);
    assert.throws(() => decodePairTokenResult("0x1234"), /32-byte/);
  });

  it("reads via eth_call and does not default to ETH on RPC failure", async () => {
    const data = encodeFunctionResult({
      abi: ABI,
      functionName: "pairToken",
      result: ERC20,
    });
    const quote = await readCurvePairToken(
      {
        async call() {
          return data;
        },
      },
      "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    assert.equal(quote, ERC20);

    await assert.rejects(
      () =>
        readCurvePairToken(
          {
            async call() {
              throw new Error("rpc down");
            },
          },
          "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        ),
      /rpc down/,
    );
  });
});
