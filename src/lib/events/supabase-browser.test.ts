/**
 * Shared browser Supabase client singleton (Realtime consumers).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, afterEach } from "node:test";
import { fileURLToPath } from "node:url";
import { PUBLIC_EVENTS_CHANNEL_NAME } from "@/lib/events/realtime-client";
import {
  createBrowserSupabase,
  getBrowserSupabaseClient,
  resetBrowserSupabaseClientForTests,
} from "@/lib/events/supabase-browser";
import { PARTICIPATION_CHANNEL_NAME } from "@/lib/social/participation-realtime";
import { SOCIAL_BROADCAST_CHANNEL_NAME } from "@/lib/social/text-draft";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const TEST_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
};

describe("browser Supabase singleton", () => {
  afterEach(() => {
    resetBrowserSupabaseClientForTests();
  });

  it("getBrowserSupabaseClient returns the same instance twice", () => {
    // Seed via factory path with test env, then install as singleton by
    // creating through a temporary override of process env for getter.
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const prevPub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_ENV.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      TEST_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    try {
      resetBrowserSupabaseClientForTests();
      const a = getBrowserSupabaseClient();
      const b = getBrowserSupabaseClient();
      assert.equal(a, b);
    } finally {
      if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
      if (prevPub === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevPub;
      }
      resetBrowserSupabaseClientForTests();
    }
  });

  it("createBrowserSupabase factory still creates fresh instances", () => {
    const a = createBrowserSupabase(TEST_ENV);
    const b = createBrowserSupabase(TEST_ENV);
    assert.notEqual(a, b);
  });

  it("auth config remains persistSession/autoRefresh/detectSession off", () => {
    const src = readSrc("src/lib/events/supabase-browser.ts");
    assert.ok(src.includes("persistSession: false"));
    assert.ok(src.includes("autoRefreshToken: false"));
    assert.ok(src.includes("detectSessionInUrl: false"));
    assert.ok(src.includes("getBrowserSupabaseClient"));
  });

  it("public events / participation / social broadcast use shared getter", () => {
    const events = readSrc("src/lib/events/use-public-events.ts");
    assert.ok(events.includes("getBrowserSupabaseClient"));
    assert.equal(events.includes("createBrowserSupabase()"), false);

    const participation = readSrc("src/lib/social/use-participation.tsx");
    assert.ok(participation.includes("getBrowserSupabaseClient"));
    assert.equal(participation.includes("createBrowserSupabase()"), false);

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("getBrowserSupabaseClient"));
    assert.equal(layer.includes("createBrowserSupabase()"), false);
  });

  it("channel names remain independent and unchanged", () => {
    assert.equal(PUBLIC_EVENTS_CHANNEL_NAME, "4663-public-events");
    assert.equal(PARTICIPATION_CHANNEL_NAME, "4663-participation");
    assert.equal(SOCIAL_BROADCAST_CHANNEL_NAME, "4663-social-broadcast");
    assert.equal(
      readSrc("src/lib/events/radar-realtime.ts").includes(
        '4663-radar-continuation',
      ),
      true,
    );
  });

  it("each consumer removes only its own channel; no removeAllChannels", () => {
    const realtime = readSrc("src/lib/events/realtime-client.ts");
    const presence = readSrc("src/lib/social/participation-realtime.ts");
    const broadcast = readSrc("src/lib/social/social-broadcast.ts");

    assert.ok(realtime.includes("removeChannel(channel)"));
    assert.ok(presence.includes("removeChannel(channel)"));
    assert.ok(broadcast.includes("removeChannel(channel)"));

    for (const src of [realtime, presence, broadcast]) {
      assert.equal(src.includes("removeAllChannels"), false);
    }
  });

  it("anonymous HTTP presence and server/worker clients unchanged", () => {
    const heartbeat = readSrc("src/lib/presence/browser-heartbeat.ts");
    assert.ok(heartbeat.includes("/api/presence/heartbeat"));
    assert.equal(heartbeat.includes("createBrowserSupabase"), false);
    assert.equal(heartbeat.includes("getBrowserSupabaseClient"), false);

    const server = readSrc("src/lib/presence/supabase-server.ts");
    assert.ok(server.includes("SUPABASE_SECRET_KEY"));
    assert.equal(server.includes("getBrowserSupabaseClient"), false);

    const worker = readSrc("src/lib/worker/supabase.ts");
    assert.ok(worker.includes("supabaseSecretKey"));
    assert.equal(worker.includes("getBrowserSupabaseClient"), false);
  });
});
