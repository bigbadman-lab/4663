/**
 * Server-only Supabase client for Next.js presence API routes.
 * Uses SUPABASE_URL + SUPABASE_SECRET_KEY. Never import from client components.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type PresenceSupabase = SupabaseClient;

export function loadPresenceServerEnv(
  env: NodeJS.ProcessEnv = process.env,
): { supabaseUrl: string; supabaseSecretKey: string } {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("[4663-presence] missing SUPABASE_URL");
  }
  const supabaseSecretKey = env.SUPABASE_SECRET_KEY?.trim();
  if (!supabaseSecretKey) {
    throw new Error("[4663-presence] missing SUPABASE_SECRET_KEY");
  }
  return { supabaseUrl, supabaseSecretKey };
}

export function createPresenceSupabase(
  env: NodeJS.ProcessEnv = process.env,
): PresenceSupabase {
  const { supabaseUrl, supabaseSecretKey } = loadPresenceServerEnv(env);
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
