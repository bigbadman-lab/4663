/**
 * Official 4663 token — validation + activation result types (LAUNCH1).
 */

import { CHAIN_ID } from "@/lib/pons/constants";
import { isValidEvmAddress } from "@/lib/worker/env-address";

export const OFFICIAL_TOKEN_ACTIVATION_VERSION = "official-4663-v1" as const;

export const ZERO_EVM_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

export const OFFICIAL_TOKEN_POLL_INACTIVE_MS = 20_000 as const;
export const OFFICIAL_CONTRACT_COPIED_MS = 1200 as const;

export type OfficialTokenActivationResult =
  | "activated"
  | "already_active"
  | "different_contract_already_active"
  | "invalid_chain"
  | "invalid_address";

export type OfficialTokenRow = {
  chainId: number;
  contractAddress: string;
  activatedAt: string;
  activationVersion: string;
};

export type OfficialTokenPublicState =
  | { active: false }
  | {
      active: true;
      chainId: typeof CHAIN_ID;
      contractAddress: string;
    };

export type ActivateOfficialTokenRpcBody = {
  result: OfficialTokenActivationResult;
  chain_id?: number;
  contract_address?: string;
  activated_at?: string;
  activation_version?: string;
  reason?: string;
};

export function normalizeOfficialContractAddress(
  value: string,
): string {
  return value.trim().toLowerCase();
}

export function isZeroEvmAddress(value: string): boolean {
  return normalizeOfficialContractAddress(value) === ZERO_EVM_ADDRESS;
}

/**
 * Validate operator-supplied address. Preserves original casing on success.
 */
export function parseOfficialContractAddress(
  value: string | undefined,
):
  | { ok: true; address: string; normalized: string }
  | { ok: false; error: string } {
  const raw = value?.trim() ?? "";
  if (!raw) {
    return { ok: false, error: "missing_contract" };
  }
  if (!isValidEvmAddress(raw)) {
    return { ok: false, error: "invalid_address" };
  }
  if (isZeroEvmAddress(raw)) {
    return { ok: false, error: "zero_address" };
  }
  return {
    ok: true,
    address: raw,
    normalized: normalizeOfficialContractAddress(raw),
  };
}

export function contractsEqual(a: string, b: string): boolean {
  return normalizeOfficialContractAddress(a) === normalizeOfficialContractAddress(b);
}

export function isSuccessfulActivationResult(
  result: OfficialTokenActivationResult,
): boolean {
  return result === "activated" || result === "already_active";
}

export function toOfficialTokenPublicState(
  row: OfficialTokenRow | null,
): OfficialTokenPublicState {
  if (!row) return { active: false };
  if (row.chainId !== CHAIN_ID) return { active: false };
  if (!isValidEvmAddress(row.contractAddress)) return { active: false };
  if (isZeroEvmAddress(row.contractAddress)) return { active: false };
  return {
    active: true,
    chainId: CHAIN_ID,
    contractAddress: row.contractAddress,
  };
}

/** Pure activation decision (mirrors RPC semantics for unit tests). */
export function decideOfficialTokenActivation(input: {
  chainId: number;
  contractAddress: string;
  existing: OfficialTokenRow | null;
}):
  | { result: "invalid_chain" }
  | { result: "invalid_address" }
  | { result: "activated"; contractAddress: string }
  | { result: "already_active"; contractAddress: string }
  | {
      result: "different_contract_already_active";
      contractAddress: string;
    } {
  if (input.chainId !== CHAIN_ID) {
    return { result: "invalid_chain" };
  }
  const parsed = parseOfficialContractAddress(input.contractAddress);
  if (!parsed.ok) {
    return { result: "invalid_address" };
  }
  if (!input.existing) {
    return { result: "activated", contractAddress: parsed.address };
  }
  if (contractsEqual(input.existing.contractAddress, parsed.address)) {
    return {
      result: "already_active",
      contractAddress: input.existing.contractAddress,
    };
  }
  return {
    result: "different_contract_already_active",
    contractAddress: input.existing.contractAddress,
  };
}
