/**
 * Browser Supabase client for Realtime only (public env).
 * Do not import secret server keys into this module.
 *
 * Default path uses literal process.env.NEXT_PUBLIC_* references so Next.js
 * can inline them into the client bundle. Optional `env` override is for tests.
 *
 * Production browser consumers should use getBrowserSupabaseClient() so all
 * Realtime channels share one GoTrue/Realtime client instance.
 * createBrowserSupabase() remains a fresh-factory for tests.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BrowserSupabase = SupabaseClient;

const BROWSER_SUPABASE_AUTH = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/** Module-scoped singleton for browser Realtime consumers. */
let browserSupabaseSingleton: BrowserSupabase | null = null;

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

/**
 * Fresh browser Supabase client (tests / explicit factory use).
 * Prefer getBrowserSupabaseClient() in production browser consumers.
 */
export function createBrowserSupabase(
  env?: Record<string, string | undefined>,
): BrowserSupabase {
  const { supabaseUrl, supabaseAnonKey } = loadBrowserSupabaseEnv(env);
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { ...BROWSER_SUPABASE_AUTH },
  });
}

/**
 * Lazy shared browser Supabase client for Realtime (Presence / Broadcast /
 * postgres_changes). One GoTrueClient per browser module runtime.
 */
export function getBrowserSupabaseClient(): BrowserSupabase {
  if (!browserSupabaseSingleton) {
    browserSupabaseSingleton = createBrowserSupabase();
  }
  return browserSupabaseSingleton;
}

/** Test helper — clears the module singleton between cases. */
export function resetBrowserSupabaseClientForTests(): void {
  browserSupabaseSingleton = null;
}
