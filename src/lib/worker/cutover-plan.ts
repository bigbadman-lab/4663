/**
 * Pure cutover argument / plan helpers for tests and operator scripts.
 */

import {
  isProductionEligibleLaunchBlock,
  PRODUCTION_CUTOVER_VERSION,
} from "@/lib/pons/production-boundary";

export type CutoverMode =
  | { kind: "from_head" }
  | { kind: "from_block"; block: number };

export type ParseCutoverArgsResult =
  | { ok: true; mode: CutoverMode; confirm: boolean }
  | { ok: false; error: string };

export function parseCutoverArgs(argv: string[]): ParseCutoverArgsResult {
  let fromHead = false;
  let fromBlock: number | null = null;
  let confirm = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") {
      confirm = true;
      continue;
    }
    if (a === "--from-head") {
      fromHead = true;
      continue;
    }
    if (a === "--from-block") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 0) {
        return {
          ok: false,
          error: "--from-block requires a non-negative integer",
        };
      }
      fromBlock = v;
      continue;
    }
    return { ok: false, error: `unknown argument: ${a}` };
  }

  if (fromHead && fromBlock !== null) {
    return {
      ok: false,
      error: "use either --from-head or --from-block, not both",
    };
  }
  if (!fromHead && fromBlock === null) {
    return {
      ok: false,
      error: "require --from-head or --from-block <n>",
    };
  }

  return {
    ok: true,
    mode: fromHead
      ? { kind: "from_head" }
      : { kind: "from_block", block: fromBlock! },
    confirm,
  };
}

export type CutoverPlan = {
  productionStartBlock: number;
  cutoverVersion: typeof PRODUCTION_CUTOVER_VERSION;
  /** Durable cursors to set after successful cutover */
  cursorLastProcessedBlock: number;
  firstExclusiveProductionBlock: number;
  /** Human boundary rule */
  launchEligibility: string;
  /** Expected mutations (no execution here) */
  mutations: string[];
};

export function buildCutoverPlan(productionStartBlock: number): CutoverPlan {
  const B = productionStartBlock;
  return {
    productionStartBlock: B,
    cutoverVersion: PRODUCTION_CUTOVER_VERSION,
    cursorLastProcessedBlock: B,
    firstExclusiveProductionBlock: B + 1,
    launchEligibility: `launch_block_number > ${B}`,
    mutations: [
      `INSERT production_state (chain_id=4663, production_start_block=${B}, cutover_version=${PRODUCTION_CUTOVER_VERSION})`,
      `UPSERT chain_cursors pons_factories last_processed_block=${B}`,
      `UPSERT chain_cursors pons_transfers last_processed_block=${B}`,
      "Does NOT mutate historical pons_launches rows (boundary filter excludes pre-B from production watch)",
      "Does NOT delete first buyers or events",
    ],
  };
}

/** Dry-run never applies confirm=false must not call RPC — caller responsibility. */
export function shouldMutateCutover(confirm: boolean): boolean {
  return confirm;
}

export function refuseSecondCutoverWhenPresent(hasExisting: boolean): boolean {
  return hasExisting;
}

export {
  isProductionEligibleLaunchBlock,
  PRODUCTION_CUTOVER_VERSION,
};
