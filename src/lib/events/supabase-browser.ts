/**
 * Browser Supabase client for Realtime only (public env).
 * Do not import secret server keys into this module.
 *
 * Default path uses literal process.env.NEXT_PUBLIC_* references so Next.js
 * can inline them into the client bundle. Optional `env` override is for tests.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BrowserSupabase = SupabaseClient;

export function loadBrowserSupabaseEnv(
  env?: Record<string, string | undefined>,
): { supabaseUrl: string; supabaseAnonKey: string } {
  const supabaseUrl = (
    env
      ? env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.trim();
  if (!supabaseUrl) {
    throw new Error("[4663-events] missing NEXT_PUBLIC_SUPABASE_URL");
  }

  const supabaseAnonKey = (
    env
      ? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!supabaseAnonKey) {
    throw new Error(
      "[4663-events] missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function createBrowserSupabase(
  env?: Record<string, string | undefined>,
): BrowserSupabase {
  const { supabaseUrl, supabaseAnonKey } = loadBrowserSupabaseEnv(env);
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
