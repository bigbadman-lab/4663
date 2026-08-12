/**
 * Observation 1A — migration contract + activation helper tests.
 * Does not call production Supabase.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  callActivateForwardObservation,
  callRollbackForwardObservation,
  FORWARD_OBSERVATION_VERSION,
  isValidObservationBoundary,
  observationCursorTargetBlock,
} from "@/lib/worker/observation-activation";
import type { WorkerSupabase } from "@/lib/worker/supabase";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const MIGRATION = "supabase/migrations/20260812220000_observation_1a_forward_boundary.sql";

function readMigration(): string {
  return readFileSync(path.join(root, MIGRATION), "utf8");
}

describe("Observation 1A migration contract", () => {
  it("A. schema columns nullable; production cols untouched by ALTER list", () => {
    const sql = readMigration();
    assert.match(sql, /ADD COLUMN IF NOT EXISTS observation_start_block bigint NULL/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS observation_started_at timestamptz NULL/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS observation_version text NULL/);
    assert.match(
      sql,
      /ADD COLUMN IF NOT EXISTS observation_rollback_factories_cursor bigint NULL/,
    );
    assert.match(
      sql,
      /ADD COLUMN IF NOT EXISTS observation_rollback_transfers_cursor bigint NULL/,
    );
    assert.match(
      sql,
      /production_state_observation_after_production_check/,
    );
    assert.match(sql, /observation_start_block > production_start_block/);
    // Migration must not rewrite production provenance columns
    assert.equal(sql.includes("DROP COLUMN production_start_block"), false);
    assert.equal(sql.includes("ALTER COLUMN production_start_block"), false);
    // Must not move cursors during migration apply
    assert.equal(/\nUPDATE\s+public\.chain_cursors/i.test(sql), false);
    assert.match(sql, /Does NOT activate observation/);
    assert.match(sql, /Does NOT move cursors/);
  });

  it("B–G. activate/rollback RPC contracts, locks, grants, idempotency", () => {
    const sql = readMigration();

    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.activate_forward_observation/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.rollback_forward_observation/);
    assert.match(sql, /pg_advisory_xact_lock\(4663, 7002\)/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path = public/);

    assert.match(sql, /'status', 'activated'/);
    assert.match(sql, /'status', 'already_activated'/);
    assert.match(sql, /'status', 'rolled_back'/);
    assert.match(sql, /'status', 'not_active'/);
    assert.match(sql, /'reason', 'missing_production_cutover'/);
    assert.match(sql, /'reason', 'invalid_boundary'/);
    assert.match(sql, /'reason', 'missing_cursors'/);
    assert.match(sql, /'reason', 'missing_rollback_cursors'/);

    // Cursors only pons_factories / pons_transfers → X-1
    assert.match(sql, /stream_name = 'pons_factories'/);
    assert.match(sql, /stream_name = 'pons_transfers'/);
    assert.match(sql, /v_target := p_observation_start_block - 1/);

    // already_activated must not overwrite rollback snapshot (no UPDATE before return)
    const alreadyIdx = sql.indexOf("'status', 'already_activated'");
    assert.ok(alreadyIdx > 0);
    const activateFn = sql.slice(
      sql.indexOf("activate_forward_observation"),
      sql.indexOf("rollback_forward_observation"),
    );
    const alreadyBlock = activateFn.slice(
      activateFn.indexOf("observation_start_block IS NOT NULL"),
      activateFn.indexOf("p_observation_start_block <= v_state.production_start_block"),
    );
    assert.equal(alreadyBlock.includes("UPDATE public.production_state"), false);
    assert.equal(alreadyBlock.includes("UPDATE public.chain_cursors"), false);

    // Historical tables never touched
    assert.equal(sql.includes("UPDATE public.pons_launches"), false);
    assert.equal(sql.includes("UPDATE public.pons_first_buyers"), false);
    assert.equal(sql.includes("UPDATE public.events"), false);
    assert.equal(sql.includes("DELETE FROM public.pons_launches"), false);
    assert.equal(sql.includes("DELETE FROM public.events"), false);

    // Permissions: revoke public, grant service_role only
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.activate_forward_observation\(integer, bigint, text\) FROM PUBLIC/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.activate_forward_observation\(integer, bigint, text\) TO service_role/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.rollback_forward_observation\(integer\) FROM PUBLIC/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.rollback_forward_observation\(integer\) TO service_role/,
    );
    assert.equal(/GRANT EXECUTE[\s\S]{0,120}activate_forward_observation[\s\S]{0,80}TO anon/.test(sql), false);
    assert.equal(/GRANT EXECUTE[\s\S]{0,120}activate_forward_observation[\s\S]{0,80}TO authenticated/.test(sql), false);
    assert.equal(/GRANT EXECUTE[\s\S]{0,120}rollback_forward_observation[\s\S]{0,80}TO anon/.test(sql), false);

    // Rollback caveat documented
    assert.match(sql, /Post-activation launches\/buyers\/events are intentionally retained/);
    assert.match(sql, /Does NOT delete post-activation/);
  });

  it("C. missing cursor path returns before writing observation or moving cursors", () => {
    const sql = readMigration();
    const activateFn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.activate_forward_observation"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.rollback_forward_observation"),
    );
    const missingIdx = activateFn.indexOf("'reason', 'missing_cursors'");
    const updateStateIdx = activateFn.indexOf("UPDATE public.production_state");
    const updateCursorIdx = activateFn.indexOf("UPDATE public.chain_cursors");
    assert.ok(missingIdx > 0);
    assert.ok(updateStateIdx > missingIdx);
    assert.ok(updateCursorIdx > missingIdx);
  });
});

describe("Observation 1A pure helpers", () => {
  it("cursor target and boundary validation", () => {
    assert.equal(observationCursorTargetBlock(34_836_885), 34_836_884);
    assert.equal(FORWARD_OBSERVATION_VERSION, "forward-obs-v1");
    assert.equal(isValidObservationBoundary(34_836_885, 34_002_666), true);
    assert.equal(isValidObservationBoundary(34_002_666, 34_002_666), false);
    assert.equal(isValidObservationBoundary(34_002_665, 34_002_666), false);
    assert.equal(isValidObservationBoundary(0, 34_002_666), false);
  });
});

describe("Observation 1A RPC client mapping", () => {
  it("maps activated + already_activated + rolled_back + not_active", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];

    const supabase = {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        if (name === "activate_forward_observation") {
          if (calls.filter((c) => c.name === name).length === 1) {
            return Promise.resolve({
              data: {
                status: "activated",
                chain_id: 4663,
                production_start_block: 34_002_666,
                observation_start_block: 34_836_885,
                observation_version: "forward-obs-v1",
                observation_started_at: "2026-08-12T00:00:00.000Z",
                cursors: {
                  pons_factories: 34_836_884,
                  pons_transfers: 34_836_884,
                },
                rollback_cursors: {
                  pons_factories: 34_560_217,
                  pons_transfers: 34_481_194,
                },
              },
              error: null,
            });
          }
          return Promise.resolve({
            data: {
              status: "already_activated",
              production_start_block: 34_002_666,
              observation_start_block: 34_836_885,
              rollback_cursors: {
                pons_factories: 34_560_217,
                pons_transfers: 34_481_194,
              },
            },
            error: null,
          });
        }
        if (calls.filter((c) => c.name === "rollback_forward_observation").length === 1) {
          return Promise.resolve({
            data: {
              status: "rolled_back",
              production_start_block: 34_002_666,
              previous_observation_start_block: 34_836_885,
              restored_cursors: {
                pons_factories: 34_560_217,
                pons_transfers: 34_481_194,
              },
              note: "Post-activation launches/buyers/events are intentionally retained",
            },
            error: null,
          });
        }
        return Promise.resolve({
          data: {
            status: "not_active",
            production_start_block: 34_002_666,
          },
          error: null,
        });
      },
    } as unknown as WorkerSupabase;

    const activated = await callActivateForwardObservation(supabase, {
      chainId: 4663,
      observationStartBlock: 34_836_885,
    });
    assert.equal(activated.status, "activated");
    assert.equal(activated.productionStartBlock, 34_002_666);
    assert.equal(activated.observationStartBlock, 34_836_885);
    assert.deepEqual(activated.cursors, {
      pons_factories: 34_836_884,
      pons_transfers: 34_836_884,
    });
    assert.deepEqual(activated.rollbackCursors, {
      pons_factories: 34_560_217,
      pons_transfers: 34_481_194,
    });

    const again = await callActivateForwardObservation(supabase, {
      chainId: 4663,
      observationStartBlock: 99,
    });
    assert.equal(again.status, "already_activated");
    assert.deepEqual(again.rollbackCursors, {
      pons_factories: 34_560_217,
      pons_transfers: 34_481_194,
    });

    const rolled = await callRollbackForwardObservation(supabase, {
      chainId: 4663,
    });
    assert.equal(rolled.status, "rolled_back");
    assert.equal(rolled.previousObservationStartBlock, 34_836_885);
    assert.deepEqual(rolled.restoredCursors, {
      pons_factories: 34_560_217,
      pons_transfers: 34_481_194,
    });
    assert.match(rolled.note ?? "", /intentionally retained/);

    const inactive = await callRollbackForwardObservation(supabase, {
      chainId: 4663,
    });
    assert.equal(inactive.status, "not_active");
    assert.equal(inactive.productionStartBlock, 34_002_666);

    assert.equal(calls[0]!.name, "activate_forward_observation");
    assert.equal(calls[0]!.args.p_observation_version, FORWARD_OBSERVATION_VERSION);
  });
});
