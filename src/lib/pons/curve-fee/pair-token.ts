/**
 * Resolve BondingCurve.pairToken() once per newly seen V2 curve.
 * Never guess native ETH when the call fails.
 */

import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  type Hex,
} from "viem";
import { normalizeAddress } from "@/lib/worker/normalize";

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

const PAIR_TOKEN_ABI = parseAbi([
  "function pairToken() view returns (address)",
]);

export const PAIR_TOKEN_CALLDATA = encodeFunctionData({
  abi: PAIR_TOKEN_ABI,
  functionName: "pairToken",
});

export type PairTokenRpc = {
  call(input: { to: string; data: string }): Promise<string>;
};

export function decodePairTokenResult(data: string): string {
  const hex = data.trim();
  if (!hex.startsWith("0x") || hex.length < 66) {
    throw new Error("[pons-v2-fees] pairToken result is not a 32-byte ABI word");
  }
  const address = decodeFunctionResult({
    abi: PAIR_TOKEN_ABI,
    functionName: "pairToken",
    data: hex as Hex,
  });
  const normalized = normalizeAddress(String(address));
  if (!ADDRESS_RE.test(normalized)) {
    throw new Error("[pons-v2-fees] pairToken returned an invalid address");
  }
  return normalized;
}

export async function readCurvePairToken(
  rpc: PairTokenRpc,
  curveAddress: string,
): Promise<string> {
  const curve = normalizeAddress(curveAddress);
  if (!ADDRESS_RE.test(curve)) {
    throw new Error("[pons-v2-fees] invalid curve address for pairToken");
  }
  const data = await rpc.call({ to: curve, data: PAIR_TOKEN_CALLDATA });
  return decodePairTokenResult(data);
}
