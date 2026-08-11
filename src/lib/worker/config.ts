/**
 * Server-only worker configuration.
 * Call loadWorkerConfig() explicitly — do not evaluate secrets at module import.
 */

import { CHAIN_ID as EXPECTED_CHAIN_ID } from "@/lib/pons/constants";
import { parseEvmAddress } from "@/lib/worker/env-address";

export type WorkerConfig = {
  chainId: typeof EXPECTED_CHAIN_ID;
  supabaseUrl: string;
  /** Service role key — never log this value. */
  supabaseSecretKey: string;
  /** Alchemy RPC URL — never log full value. */
  alchemyRpcUrl: string;
  ponsFactoryV1: string;
  ponsFactoryV2: string;
};

/**
 * Validate and return server-only worker config.
 * Stage 4 requires Alchemy + factory addresses for live launch discovery.
 */
export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const chainRaw = env.CHAIN_ID?.trim();
  if (!chainRaw) {
    throw new Error(
      "[4663-worker] missing required environment variable: CHAIN_ID",
    );
  }

  const chainId = Number(chainRaw);
  if (!Number.isInteger(chainId) || chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `[4663-worker] CHAIN_ID must be ${EXPECTED_CHAIN_ID}, got: ${chainRaw}`,
    );
  }

  const supabaseUrl = env.SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error(
      "[4663-worker] missing required environment variable: SUPABASE_URL",
    );
  }

  const supabaseSecretKey = env.SUPABASE_SECRET_KEY?.trim();
  if (!supabaseSecretKey) {
    throw new Error(
      "[4663-worker] missing required environment variable: SUPABASE_SECRET_KEY",
    );
  }

  const alchemyRpcUrl = env.ALCHEMY_RPC_URL?.trim();
  if (!alchemyRpcUrl) {
    throw new Error(
      "[4663-worker] missing required environment variable: ALCHEMY_RPC_URL",
    );
  }

  return {
    chainId: EXPECTED_CHAIN_ID,
    supabaseUrl,
    supabaseSecretKey,
    alchemyRpcUrl,
    ponsFactoryV1: parseEvmAddress("PONS_FACTORY_V1", env.PONS_FACTORY_V1),
    ponsFactoryV2: parseEvmAddress("PONS_FACTORY_V2", env.PONS_FACTORY_V2),
  };
}
