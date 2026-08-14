/**
 * RADAR continuation Realtime wake helpers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RADAR_CONTINUATION_CHANNEL_NAME,
  normalizeRadarContinuationWake,
} from "@/lib/events/radar-realtime";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("radar continuation Realtime wake", () => {
  it("normalizes minimal safe wake fields; rejects buying activity", () => {
    const wake = normalizeRadarContinuationWake({
      id: ID,
      event_type: "pons_buyer_continuation",
      token_address: TOKEN,
      occurred_at: "2026-08-14T12:00:00.000Z",
      new_buyers: 2,
      payload: { launch_block_number: 1, pre_3m_buyers: 3 },
    });
    assert.deepEqual(wake, {
      eventId: ID,
      tokenAddress: TOKEN,
      occurredAt: "2026-08-14T12:00:00.000Z",
    });

    assert.equal(
      normalizeRadarContinuationWake({
        id: ID,
        event_type: "pons_buying_activity",
        token_address: TOKEN,
        occurred_at: "2026-08-14T12:00:00.000Z",
      }),
      null,
    );
    assert.equal(normalizeRadarContinuationWake(null), null);
    assert.equal(normalizeRadarContinuationWake({}), null);
  });

  it("dedicated channel + filter; not merged into public events stream", () => {
    assert.equal(RADAR_CONTINUATION_CHANNEL_NAME, "4663-radar-continuation");
    const realtime = readSrc("src/lib/events/radar-realtime.ts");
    assert.ok(realtime.includes("event_type=eq."));
    assert.ok(realtime.includes("EVENT_TYPE_PONS_BUYER_CONTINUATION"));
    assert.ok(realtime.includes('event: "INSERT"'));
    assert.ok(realtime.includes("removeChannel(channel)"));

    const publicStream = readSrc("src/lib/events/browser-stream.ts");
    assert.equal(publicStream.includes("pons_buyer_continuation"), false);
    assert.ok(publicStream.includes("normalizePublicEvent"));

    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes("createRadarContinuationRealtimeClient"));
    assert.ok(hook.includes("requestWatchlistRefresh"));
    assert.ok(hook.includes("pendingRefresh"));
    assert.ok(hook.includes("realtimeWakeIds"));
    assert.ok(hook.includes('status === "SUBSCRIBED"'));
  });

  it("migration expands public SELECT to continuation without write grants", () => {
    const migration = readSrc(
      "supabase/migrations/20260814160000_radar_continuation_realtime.sql",
    );
    assert.ok(migration.includes("pons_buyer_continuation"));
    assert.ok(migration.includes("pons_buying_activity"));
    assert.ok(migration.includes("events_public_select"));
    assert.ok(migration.includes("GRANT SELECT"));
    assert.ok(migration.includes("REVOKE ALL PRIVILEGES"));
    assert.equal(migration.includes("GRANT INSERT"), false);
    assert.equal(migration.includes("GRANT UPDATE"), false);
    assert.equal(migration.includes("GRANT DELETE"), false);
  });
});
