/**
 * Server-only worker configuration.
 * Call loadWorkerConfig() explicitly — do not evaluate secrets at module import
 * so Next.js bundling never accidentally requires worker env.
 */

import { CHAIN_ID as EXPECTED_CHAIN_ID } from "@/lib/pons/constants";

export type WorkerConfig = {
  chainId: typeof EXPECTED_CHAIN_ID;
  supabaseUrl: string;
  /** Service role key — never log this value. */
  supabaseSecretKey: string;
};

/**
 * Validate and return server-only worker config.
 * Reads process.env (after entrypoint loads .env.local for local runs).
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

  return {
    chainId: EXPECTED_CHAIN_ID,
    supabaseUrl,
    supabaseSecretKey,
  };
}
