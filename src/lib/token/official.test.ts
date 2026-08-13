/**
 * LAUNCH1 — official 4663 token activation semantics (pure + structural).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CHAIN_ID } from "@/lib/pons/constants";
import {
  hasDeployedBytecode,
  parseActivate4663Args,
} from "@/lib/token/activate-4663-plan";
import {
  decideOfficialTokenActivation,
  isSuccessfulActivationResult,
  isZeroEvmAddress,
  parseOfficialContractAddress,
  toOfficialTokenPublicState,
  ZERO_EVM_ADDRESS,
} from "@/lib/token/official";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const ADDR_A = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const ADDR_B = "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb";

describe("LAUNCH1 official token activation", () => {
  it("1. valid first address activates", () => {
    const decided = decideOfficialTokenActivation({
      chainId: CHAIN_ID,
      contractAddress: ADDR_A,
      existing: null,
    });
    assert.equal(decided.result, "activated");
    if (decided.result === "activated") {
      assert.equal(decided.contractAddress, ADDR_A);
    }
  });

  it("2. same address rerun is idempotent", () => {
    const decided = decideOfficialTokenActivation({
      chainId: CHAIN_ID,
      contractAddress: ADDR_A.toLowerCase(),
      existing: {
        chainId: CHAIN_ID,
        contractAddress: ADDR_A,
        activatedAt: "2026-08-13T00:00:00.000Z",
        activationVersion: "official-4663-v1",
      },
    });
    assert.equal(decided.result, "already_active");
    assert.equal(isSuccessfulActivationResult("already_active"), true);
  });

  it("3. different second address fails", () => {
    const decided = decideOfficialTokenActivation({
      chainId: CHAIN_ID,
      contractAddress: ADDR_B,
      existing: {
        chainId: CHAIN_ID,
        contractAddress: ADDR_A,
        activatedAt: "2026-08-13T00:00:00.000Z",
        activationVersion: "official-4663-v1",
      },
    });
    assert.equal(decided.result, "different_contract_already_active");
    assert.equal(
      isSuccessfulActivationResult("different_contract_already_active"),
      false,
    );
  });

  it("4–5. malformed and zero address fail", () => {
    assert.equal(parseOfficialContractAddress("0x1234").ok, false);
    assert.equal(
      parseOfficialContractAddress(
        "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      ).ok,
      false,
    );
    assert.equal(parseOfficialContractAddress("").ok, false);
    assert.equal(parseOfficialContractAddress(ZERO_EVM_ADDRESS).ok, false);
    assert.equal(isZeroEvmAddress(ZERO_EVM_ADDRESS), true);
    assert.equal(
      decideOfficialTokenActivation({
        chainId: CHAIN_ID,
        contractAddress: ZERO_EVM_ADDRESS,
        existing: null,
      }).result,
      "invalid_address",
    );
  });

  it("6–7. wrong chain fails; activation stores chain 4663", () => {
    assert.equal(
      decideOfficialTokenActivation({
        chainId: 1,
        contractAddress: ADDR_A,
        existing: null,
      }).result,
      "invalid_chain",
    );
    const ok = decideOfficialTokenActivation({
      chainId: 4663,
      contractAddress: ADDR_A,
      existing: null,
    });
    assert.equal(ok.result, "activated");
    assert.equal(CHAIN_ID, 4663);
  });

  it("8. browser cannot call activation — RPC execute is service_role only", () => {
    const sql = readSrc(
      "supabase/migrations/20260813140000_launch1_official_token.sql",
    );
    assert.ok(sql.includes("activate_official_4663_token"));
    assert.ok(sql.includes("GRANT EXECUTE"));
    assert.ok(sql.includes("TO service_role"));
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION"));
    assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
    assert.equal(sql.includes("TO anon"), false);
    assert.equal(sql.includes("TO authenticated"), false);

    const route = readSrc("src/app/api/token/official/route.ts");
    assert.equal(route.includes("activate_official"), false);
    assert.equal(route.includes("POST"), false);
    assert.ok(route.includes("GET"));
  });

  it("9–10. public state inactive / active", () => {
    assert.deepEqual(toOfficialTokenPublicState(null), { active: false });
    const active = toOfficialTokenPublicState({
      chainId: 4663,
      contractAddress: ADDR_A,
      activatedAt: "2026-08-13T00:00:00.000Z",
      activationVersion: "official-4663-v1",
    });
    assert.equal(active.active, true);
    if (active.active) {
      assert.equal(active.contractAddress, ADDR_A);
      assert.equal(active.chainId, 4663);
    }
  });

  it("11–12. API exposes no secrets; CLI parses --contract", () => {
    const route = readSrc("src/app/api/token/official/route.ts");
    assert.equal(route.includes("SUPABASE_SECRET"), false);
    assert.equal(route.includes("activation_version"), false);
    assert.ok(route.includes("createPresenceSupabase"));

    const args = parseActivate4663Args(["--contract", ADDR_A]);
    assert.equal(args.ok, true);
    if (args.ok) assert.equal(args.contract, ADDR_A);
    assert.equal(parseActivate4663Args([]).ok, false);
    assert.equal(hasDeployedBytecode("0x"), false);
    assert.equal(hasDeployedBytecode("0x608060"), true);
  });
});
