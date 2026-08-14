/**
 * Health 2 — PONS monitor shared TTL cache.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PONS_MONITOR_POLL_MS } from "@/components/canvas/use-pons-monitor";
import {
  getCachedPonsMonitor,
  PONS_MONITOR_CACHE_TTL_MS,
  resetPonsMonitorCacheForTests,
} from "@/lib/pons/monitor-cache";
import type {
  LoadPonsMonitorResult,
  PonsMonitorResponse,
} from "@/lib/pons/monitor";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function sampleBody(n: number): PonsMonitorResponse {
  return {
    generatedAt: `2026-08-14T12:00:0${n}.000Z`,
    chainId: 4663,
    chainHead: 1000 + n,
    activeCount: n,
    items: [],
  };
}

afterEach(() => {
  resetPonsMonitorCacheForTests();
});

describe("getCachedPonsMonitor", () => {
  it("TTL is 2s and below the 8s client poll", () => {
    assert.equal(PONS_MONITOR_CACHE_TTL_MS, 2_000);
    assert.ok(PONS_MONITOR_CACHE_TTL_MS < PONS_MONITOR_POLL_MS);
    assert.equal(PONS_MONITOR_POLL_MS, 8_000);
  });

  it("cache hit: sequential requests inside TTL load once", async () => {
    let loads = 0;
    const load = async (): Promise<LoadPonsMonitorResult> => {
      loads += 1;
      return { ok: true, body: sampleBody(loads) };
    };

    const a = await getCachedPonsMonitor(load, { nowMs: 1_000, ttlMs: 2_000 });
    const b = await getCachedPonsMonitor(load, { nowMs: 2_500, ttlMs: 2_000 });

    assert.equal(loads, 1);
    assert.equal(a.ok && b.ok, true);
    if (a.ok && b.ok) {
      assert.equal(a.body.generatedAt, b.body.generatedAt);
      assert.equal(a.body.activeCount, 1);
    }
  });

  it("expiry: next request after TTL recomputes", async () => {
    let loads = 0;
    const load = async (): Promise<LoadPonsMonitorResult> => {
      loads += 1;
      return { ok: true, body: sampleBody(loads) };
    };

    const a = await getCachedPonsMonitor(load, { nowMs: 1_000, ttlMs: 2_000 });
    const b = await getCachedPonsMonitor(load, { nowMs: 3_001, ttlMs: 2_000 });

    assert.equal(loads, 2);
    assert.ok(a.ok && b.ok);
    if (a.ok && b.ok) {
      assert.notEqual(a.body.generatedAt, b.body.generatedAt);
      assert.equal(b.body.activeCount, 2);
    }
  });

  it("concurrent cold requests share one in-flight load", async () => {
    let loads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const load = async (): Promise<LoadPonsMonitorResult> => {
      loads += 1;
      await gate;
      return { ok: true, body: sampleBody(loads) };
    };

    const p1 = getCachedPonsMonitor(load, { nowMs: 10_000, ttlMs: 2_000 });
    const p2 = getCachedPonsMonitor(load, { nowMs: 10_000, ttlMs: 2_000 });
    const p3 = getCachedPonsMonitor(load, { nowMs: 10_000, ttlMs: 2_000 });

    // Allow microtasks to attach to the shared in-flight promise.
    await Promise.resolve();
    assert.equal(loads, 1);

    release();
    const [a, b, c] = await Promise.all([p1, p2, p3]);
    assert.equal(loads, 1);
    assert.ok(a.ok && b.ok && c.ok);
    if (a.ok && b.ok && c.ok) {
      assert.equal(a.body.generatedAt, b.body.generatedAt);
      assert.equal(b.body.generatedAt, c.body.generatedAt);
    }
  });

  it("failure is not cached; in-flight clears; later request retries", async () => {
    let loads = 0;
    const load = async (): Promise<LoadPonsMonitorResult> => {
      loads += 1;
      if (loads === 1) return { ok: false, error: "monitor_unavailable" };
      return { ok: true, body: sampleBody(loads) };
    };

    const failed = await getCachedPonsMonitor(load, {
      nowMs: 20_000,
      ttlMs: 2_000,
    });
    assert.equal(failed.ok, false);
    assert.equal(loads, 1);

    const ok = await getCachedPonsMonitor(load, {
      nowMs: 20_100,
      ttlMs: 2_000,
    });
    assert.equal(ok.ok, true);
    assert.equal(loads, 2);
    if (ok.ok) assert.equal(ok.body.activeCount, 2);

    // Success is now cached — third call inside TTL does not reload.
    const hit = await getCachedPonsMonitor(load, {
      nowMs: 20_500,
      ttlMs: 2_000,
    });
    assert.equal(loads, 2);
    assert.equal(hit.ok, true);
  });

  it("failure does not replace a prior successful cache entry while still fresh", async () => {
    let loads = 0;
    const load = async (): Promise<LoadPonsMonitorResult> => {
      loads += 1;
      if (loads === 1) return { ok: true, body: sampleBody(1) };
      return { ok: false, error: "monitor_unavailable" };
    };

    const first = await getCachedPonsMonitor(load, {
      nowMs: 30_000,
      ttlMs: 2_000,
    });
    assert.ok(first.ok);

    // Still fresh — should hit cache and never call the failing loader.
    const second = await getCachedPonsMonitor(load, {
      nowMs: 30_500,
      ttlMs: 2_000,
    });
    assert.equal(loads, 1);
    assert.ok(second.ok);
    if (first.ok && second.ok) {
      assert.equal(first.body.generatedAt, second.body.generatedAt);
    }
  });

  it("rejected load clears in-flight and allows retry", async () => {
    let loads = 0;
    const load = async (): Promise<LoadPonsMonitorResult> => {
      loads += 1;
      if (loads === 1) throw new Error("boom");
      return { ok: true, body: sampleBody(2) };
    };

    await assert.rejects(
      () => getCachedPonsMonitor(load, { nowMs: 40_000, ttlMs: 2_000 }),
      /boom/,
    );
    assert.equal(loads, 1);

    const ok = await getCachedPonsMonitor(load, {
      nowMs: 40_100,
      ttlMs: 2_000,
    });
    assert.equal(ok.ok, true);
    assert.equal(loads, 2);
  });
});

describe("Health 2 wiring + contract", () => {
  it("route uses getCachedPonsMonitor; response headers unchanged", () => {
    const route = readSrc("src/app/api/pons/monitor/route.ts");
    assert.ok(route.includes("getCachedPonsMonitor"));
    assert.ok(route.includes("loadPonsMonitor"));
    assert.ok(route.includes('Cache-Control": "no-store"'));
    assert.ok(route.includes("monitor_unavailable"));
    assert.ok(route.includes("status: 200"));
    assert.ok(route.includes("status: 500"));
  });

  it("Health 1 client poll cadence + visibility wiring intact", () => {
    assert.equal(PONS_MONITOR_POLL_MS, 8_000);
    const hook = readSrc("src/components/canvas/use-pons-monitor.ts");
    assert.ok(hook.includes("startVisibilityIntervalPolling"));
    assert.ok(hook.includes("PONS_MONITOR_POLL_MS"));
    assert.equal(hook.includes("getCachedPonsMonitor"), false);
  });

  it("single-entry cache module — no per-user keys", () => {
    const src = readSrc("src/lib/pons/monitor-cache.ts");
    assert.ok(src.includes("PONS_MONITOR_CACHE_TTL_MS"));
    assert.equal(src.includes("sessionId"), false);
    assert.equal(src.includes("Map<"), false);
    assert.ok(src.includes("inFlight"));
  });
});
