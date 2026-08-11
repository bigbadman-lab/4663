/**
 * Server-only Supabase client for the Render worker / trusted server paths.
 * Uses the secret service role key. Never import from client components.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WorkerConfig } from "@/lib/worker/config";

export type WorkerSupabase = SupabaseClient;

export function createWorkerSupabase(config: WorkerConfig): WorkerSupabase {
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Minimal connectivity probe against a private Stage 1 table.
 * Succeeds only when service-role credentials can read past RLS.
 */
export async function proveSupabaseConnectivity(
  supabase: WorkerSupabase,
): Promise<void> {
  const { error } = await supabase
    .from("worker_health")
    .select("worker_name")
    .limit(1);

  if (error) {
    throw new Error(
      `[4663-worker] supabase connectivity check failed: ${error.message}`,
    );
  }
}
