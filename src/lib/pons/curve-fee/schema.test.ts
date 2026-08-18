/**
 * Phase 1 PONS V2 curve-fee schema + isolation contract.
 * Does not call production Supabase.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CURSOR_STREAM_PONS_V2_CURVE_FEES } from "@/lib/pons/curve-fee/constants";
import { PONS_CURSOR_STREAMS } from "@/lib/worker/repositories/cursors";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const MIGRATION =
  "supabase/migrations/20260817213000_pons_v2_curve_fees.sql";

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const ISOLATED_FILES = [
  "src/lib/pons/continuation.ts",
  "src/lib/pons/continuation.test.ts",
  "scripts/worker.ts",
  "src/lib/events/radar-alerts.ts",
  "src/lib/events/continuation-watchlist.ts",
  "src/lib/worker/pools/continuation-eval.ts",
  "src/lib/worker/repositories/cursors.ts",
  "src/lib/pons/constants.ts",
  "src/lib/pons/types.ts",
] as const;

describe("PONS V2 curve-fee Phase 1 schema", () => {
  const sql = readSrc(MIGRATION);

  it("creates the ledger and metrics tables with numeric(78,0) quote amounts", () => {
    assert.ok(sql.includes("CREATE TABLE public.pons_v2_curve_fee_events"));
    assert.ok(sql.includes("CREATE TABLE public.token_fee_metrics"));
    assert.ok(sql.includes("UNIQUE (chain_id, tx_hash, log_index)"));
    assert.ok(sql.includes("PRIMARY KEY (chain_id, token_address)"));
    assert.ok(sql.includes("fee_raw numeric(78, 0)"));
    assert.ok(sql.includes("tax_raw numeric(78, 0)"));
    assert.ok(sql.includes("total_fee_raw numeric(78, 0) GENERATED ALWAYS AS (fee_raw + tax_raw) STORED"));
    assert.ok(sql.includes("global_fees_paid_quote numeric(78, 0)"));
    assert.ok(sql.includes("buy_fees_quote numeric(78, 0)"));
    assert.ok(sql.includes("sell_fees_quote numeric(78, 0)"));
    assert.ok(sql.includes("quote_token_address"));
    assert.ok(sql.includes("venue text NOT NULL DEFAULT 'curve'"));
    assert.ok(sql.includes("CHECK (side IN ('buy', 'sell'))"));
    assert.ok(sql.includes("CHECK (launchpad = 'pons')"));
    assert.ok(sql.includes("CHECK (factory_version = 'v2')"));
    assert.equal(/\bdouble precision\b|\breal\b|\bfloat8\b|\bfloat4\b/i.test(sql), false);
    assert.equal(sql.includes("fees_paid_native"), false);
    assert.equal(sql.includes("global_fees_paid_native"), false);
  });

  it("apply RPC is insert-then-aggregate and idempotent", () => {
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.apply_pons_v2_curve_fees(p_events jsonb)"));
    assert.ok(sql.includes("ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING"));
    assert.ok(sql.includes("GET DIAGNOSTICS v_inserted = ROW_COUNT"));
    assert.ok(sql.includes("IF v_inserted = 0 THEN"));
    assert.ok(sql.includes("v_skipped := v_skipped + 1"));
    assert.ok(sql.includes("ON CONFLICT (chain_id, token_address) DO UPDATE SET"));
    assert.ok(
      sql.includes(
        "GREATEST(public.token_fee_metrics.last_fee_block, EXCLUDED.last_fee_block)",
      ),
    );
    assert.ok(sql.includes("fee_raw and tax_raw must be decimal strings"));
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.apply_pons_v2_curve_fees(jsonb) TO service_role"));

    const updateBlock = sql.slice(
      sql.indexOf("ON CONFLICT (chain_id, token_address) DO UPDATE SET"),
    );
    const updateOnly = updateBlock.slice(
      0,
      updateBlock.indexOf("v_applied := v_applied + 1"),
    );
    assert.equal(updateOnly.includes("quote_token_address"), false);
    assert.ok(updateOnly.includes("global_fees_paid_quote"));
  });

  it("14. does not modify continuation, RADAR, worker loop, or PONS cursor identity", () => {
    assert.equal(CURSOR_STREAM_PONS_V2_CURVE_FEES, "pons_v2_curve_fees");
    assert.deepEqual([...PONS_CURSOR_STREAMS], [
      "pons_factories",
      "pons_transfers",
    ]);
    assert.equal(
      (PONS_CURSOR_STREAMS as readonly string[]).includes(
        CURSOR_STREAM_PONS_V2_CURVE_FEES,
      ),
      false,
    );

    assert.equal(sql.includes("fire_pons_buying_activity"), false);
    assert.equal(sql.includes("fire_pons_buyer_continuation"), false);
    assert.equal(sql.includes("CREATE OR REPLACE FUNCTION public.fire_"), false);
    assert.equal(sql.includes("pons_first_buyers"), false);
    assert.equal(sql.includes("ALTER TABLE public.events"), false);

    const worker = readSrc("scripts/worker.ts");
    assert.ok(worker.includes("catchUpPonsV2CurveFeesCursorIsolated"));
    assert.ok(worker.includes("formatPonsV2FeeCycleLog"));
    assert.equal(worker.includes("scanPonsV2CurveFeesRange"), false);
    assert.equal(worker.includes("apply_pons_v2_curve_fees"), false);
    assert.equal(worker.includes("@/lib/pons/continuation"), false);
    assert.equal(worker.includes("@/lib/events/radar"), false);

    const isolated = ISOLATED_FILES.filter(
      (rel) =>
        rel !== "scripts/worker.ts" &&
        rel !== "src/lib/worker/repositories/cursors.ts",
    );
    for (const rel of isolated) {
      const src = readSrc(rel);
      assert.equal(
        src.includes("apply_pons_v2_curve_fees"),
        false,
        `${rel} must not call the fee RPC`,
      );
      assert.equal(
        src.includes("@/lib/pons/curve-fee"),
        false,
        `${rel} must not import curve-fee`,
      );
    }

    const cursors = readSrc("src/lib/worker/repositories/cursors.ts");
    assert.ok(cursors.includes("CURSOR_STREAM_PONS_V2_CURVE_FEES"));
    assert.ok(cursors.includes("KNOWN_CURSOR_STREAMS"));
    assert.equal(cursors.includes("apply_pons_v2_curve_fees"), false);
    assert.ok(cursors.includes("PONS_CURSOR_STREAMS"));
    assert.equal(
      cursors.includes("CURSOR_STREAM_PONS_V2_CURVE_FEES") &&
        /PONS_CURSOR_STREAMS[\s\S]*CURSOR_STREAM_PONS_V2_CURVE_FEES/.test(
          cursors.slice(
            cursors.indexOf("export const PONS_CURSOR_STREAMS"),
            cursors.indexOf("export const KNOWN_CURSOR_STREAMS"),
          ),
        ),
      false,
    );
  });
});
