/**
 * Pure production mode gates (no I/O).
 */

import type { ProductionStateRow } from "@/lib/worker/repositories/production-state";

export type ProductionModeGate =
  | { ok: true; productionStartBlock: number; cutoverVersion: string }
  | { ok: false; reason: "no_cutover" };

/** Continuous / production workers require an existing cutover marker. */
export function requireProductionCutover(
  state: ProductionStateRow | null,
): ProductionModeGate {
  if (!state) {
    return { ok: false, reason: "no_cutover" };
  }
  return {
    ok: true,
    productionStartBlock: state.productionStartBlock,
    cutoverVersion: String(state.cutoverVersion),
  };
}

export const PRODUCTION_REFUSAL_MESSAGE =
  "[4663-worker] production mode refused: no production_state cutover marker. Run: npm run worker:cutover-production -- --from-head (dry-run) then --confirm. Local emergency only: worker:once --dev-uncutover";
