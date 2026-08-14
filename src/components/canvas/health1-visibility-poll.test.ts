/**
 * Health 1 — canvas poll hooks wire visibility-aware polling with unchanged cadences.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CONTINUATION_WATCHLIST_POLL_MS } from "@/components/canvas/use-continuation-watchlist";
import { PONS_MONITOR_POLL_MS } from "@/components/canvas/use-pons-monitor";
import { PRESENCE_SUMMARY_POLL_MS } from "@/lib/presence/format-presence";
import { OFFICIAL_TOKEN_POLL_INACTIVE_MS } from "@/lib/token/official";

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Health 1 visibility-aware canvas polls", () => {
  it("cadences remain production values", () => {
    assert.equal(PONS_MONITOR_POLL_MS, 8_000);
    assert.equal(PRESENCE_SUMMARY_POLL_MS, 15_000);
    assert.equal(CONTINUATION_WATCHLIST_POLL_MS, 45_000);
    assert.equal(OFFICIAL_TOKEN_POLL_INACTIVE_MS, 20_000);
  });

  it("pons monitor uses visibility interval poller + lastGood", () => {
    const hook = readSrc("src/components/canvas/use-pons-monitor.ts");
    assert.ok(hook.includes("startVisibilityIntervalPolling"));
    assert.ok(hook.includes("browserVisibilityIntervalDeps"));
    assert.ok(hook.includes("PONS_MONITOR_POLL_MS"));
    assert.ok(hook.includes("inFlight"));
    assert.ok(hook.includes("lastGood"));
    assert.ok(hook.includes("/api/pons/monitor"));
  });

  it("continuation watchlist uses visibility interval poller", () => {
    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes("startVisibilityIntervalPolling"));
    assert.ok(hook.includes("CONTINUATION_WATCHLIST_POLL_MS"));
    assert.ok(hook.includes("/api/events/continuation-watchlist"));
    assert.ok(hook.includes("inFlight"));
  });

  it("presence summary poller is visibility-aware", () => {
    const src = readSrc("src/lib/presence/use-presence-summary.ts");
    assert.ok(src.includes("startVisibilityIntervalPolling"));
    assert.ok(src.includes("getVisibilityState"));
    assert.ok(src.includes("PRESENCE_SUMMARY_POLL_MS"));
  });

  it("presence heartbeat remains independently visibility-aware", () => {
    const beat = readSrc("src/lib/presence/browser-heartbeat.ts");
    assert.ok(beat.includes("visibilitychange"));
    assert.ok(beat.includes("PRESENCE_HEARTBEAT_INTERVAL_MS"));
    assert.equal(beat.includes("startVisibilityIntervalPolling"), false);
  });
});
