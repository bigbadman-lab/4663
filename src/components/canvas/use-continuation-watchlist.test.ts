/**
 * useSyncExternalStore snapshot identity for the continuation watchlist store.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyContinuationWatchlistStoreUpdateForTests,
  getContinuationWatchlistSnapshotsForTests,
  resetContinuationWatchlistStoreForTests,
} from "@/components/canvas/use-continuation-watchlist";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

afterEach(() => {
  resetContinuationWatchlistStoreForTests();
});

describe("continuation watchlist store snapshot identity", () => {
  it("1. two consecutive getServerSnapshot() reads return the exact same reference", () => {
    const { getServerSnapshot } = getContinuationWatchlistSnapshotsForTests();
    const a = getServerSnapshot();
    const b = getServerSnapshot();
    assert.equal(a, b);
    assert.equal(a.status, "loading");
    assert.equal(a.generatedAt, null);
  });

  it("2. server snapshot nested arrays/objects are stable", () => {
    const { getServerSnapshot } = getContinuationWatchlistSnapshotsForTests();
    const a = getServerSnapshot();
    const b = getServerSnapshot();
    assert.equal(a.tokens, b.tokens);
    assert.equal(a.recentQualifications, b.recentQualifications);
    assert.equal(a.alerts, b.alerts);
    assert.equal(a.tokens.length, 0);
    assert.equal(a.recentQualifications.length, 0);
    assert.equal(a.alerts.length, 0);
  });

  it("3. two client getSnapshot() reads without a store change return the same reference", () => {
    const { getSnapshot } = getContinuationWatchlistSnapshotsForTests();
    const a = getSnapshot();
    const b = getSnapshot();
    assert.equal(a, b);
  });

  it("4. after a real store update, client snapshot reference changes", () => {
    const { getSnapshot } = getContinuationWatchlistSnapshotsForTests();
    const before = getSnapshot();
    applyContinuationWatchlistStoreUpdateForTests({
      status: "ready",
      generatedAt: "2026-08-15T15:00:00.000Z",
    });
    const after = getSnapshot();
    assert.notEqual(after, before);
    assert.equal(after.status, "ready");
    assert.equal(after.generatedAt, "2026-08-15T15:00:00.000Z");
    assert.equal(getSnapshot(), after);
  });

  it("5. watchlist loading / data path remains unchanged", () => {
    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes('fetch("/api/events/continuation-watchlist"'));
    assert.ok(hook.includes("startVisibilityIntervalPolling"));
    assert.ok(hook.includes("CONTINUATION_WATCHLIST_POLL_MS"));
    assert.ok(hook.includes("tokens: nextTokens"));
    assert.ok(hook.includes("recentQualifications: nextRecent"));
    assert.ok(hook.includes("createRadarContinuationRealtimeClient"));
  });

  it("6. radar sound / dedupe behaviour remains unchanged", () => {
    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes("applyRadarWatchlistSnapshot"));
    assert.ok(hook.includes("seenIds"));
    assert.ok(hook.includes("realtimeWakeIds"));
    assert.ok(
      hook.includes("notifyRadarSoundForNewAlerts(applied.newAlerts.length)"),
    );
    assert.ok(hook.includes("pruneExpiredRadarAlerts(store.alerts, Date.now())"));
    assert.equal(hook.includes("dismissRadarAlert"), false);
  });
});
