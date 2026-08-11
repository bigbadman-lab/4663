/**
 * V2 market resolution: factory log topics[2], with bytecode confirmation.
 * Ported from pons-data-lab build-launch-registry V2 branch.
 */

import { bytecodeSize } from "@/lib/pons/launch-discovery/topic-utils";
import type { CodeLookup } from "@/lib/pons/launch-discovery/types";
import { normalizeAddress } from "@/lib/worker/normalize";

export type V2MarketResolution = {
  market: string | null;
  evidence: string[];
};

export async function resolveV2Market(
  marketFromTopics: string | null,
  getCode: CodeLookup,
): Promise<V2MarketResolution> {
  if (!marketFromTopics) {
    return {
      market: null,
      evidence: ["V2 factory log missing address-shaped topics[2]"],
    };
  }

  const market = normalizeAddress(marketFromTopics);
  const code = await getCode(market);
  const size = bytecodeSize(code);
  if (size <= 0) {
    return {
      market: null,
      evidence: ["factory topics[2]", "WARNING missing bytecode"],
    };
  }

  return {
    market,
    evidence: ["factory topics[2]", `has_bytecode size=${size}`],
  };
}
