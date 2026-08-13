/**
 * Official 4663 token — Supabase load + activation (service role only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAIN_ID } from "@/lib/pons/constants";
import {
  type ActivateOfficialTokenRpcBody,
  type OfficialTokenActivationResult,
  type OfficialTokenPublicState,
  type OfficialTokenRow,
  OFFICIAL_TOKEN_ACTIVATION_VERSION,
  toOfficialTokenPublicState,
} from "@/lib/token/official";

type OfficialTokenDbRow = {
  chain_id: number;
  contract_address: string;
  contract_address_normalized: string;
  activated_at: string;
  activation_version: string;
};

function mapRow(row: OfficialTokenDbRow): OfficialTokenRow {
  return {
    chainId: row.chain_id,
    contractAddress: row.contract_address,
    activatedAt: row.activated_at,
    activationVersion: row.activation_version,
  };
}

export async function loadOfficialTokenRow(
  supabase: SupabaseClient,
  chainId: number = CHAIN_ID,
): Promise<
  | { ok: true; row: OfficialTokenRow | null }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("official_token")
    .select(
      "chain_id, contract_address, contract_address_normalized, activated_at, activation_version",
    )
    .eq("chain_id", chainId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: true, row: null };
  }
  return { ok: true, row: mapRow(data as OfficialTokenDbRow) };
}

export async function loadOfficialTokenPublicState(
  supabase: SupabaseClient,
): Promise<
  | { ok: true; state: OfficialTokenPublicState }
  | { ok: false; error: string }
> {
  const loaded = await loadOfficialTokenRow(supabase);
  if (!loaded.ok) return loaded;
  return { ok: true, state: toOfficialTokenPublicState(loaded.row) };
}

export type ActivateOfficialTokenOutcome = {
  result: OfficialTokenActivationResult;
  chainId?: number;
  contractAddress?: string;
  activatedAt?: string;
  activationVersion?: string;
};

export async function callActivateOfficial4663Token(
  supabase: SupabaseClient,
  input: { chainId: number; contractAddress: string },
): Promise<ActivateOfficialTokenOutcome> {
  const { data, error } = await supabase.rpc("activate_official_4663_token", {
    p_chain_id: input.chainId,
    p_contract_address: input.contractAddress,
  });

  if (error) {
    throw new Error(
      `[4663-launch] activate_official_4663_token RPC failed: ${error.message}`,
    );
  }

  const body = data as ActivateOfficialTokenRpcBody | null;
  if (!body || typeof body !== "object" || typeof body.result !== "string") {
    throw new Error("[4663-launch] activate_official_4663_token returned invalid payload");
  }

  return {
    result: body.result,
    chainId: body.chain_id,
    contractAddress: body.contract_address,
    activatedAt: body.activated_at,
    activationVersion: body.activation_version ?? OFFICIAL_TOKEN_ACTIVATION_VERSION,
  };
}
