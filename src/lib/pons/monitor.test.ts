/**
 * Stage 8A.3 — live PONS monitoring terminal read-model + wiring.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  comparePonsMonitorLaunches,
  continuationWatchCutoffIso,
  mapLaunchToMonitorItem,
  normalizePonsMonitorLaunchRow,
  PONS_MONITOR_LIMIT,
} from "@/lib/pons/monitor";
import { CONTINUATION_WATCH_END_SECONDS } from "@/lib/pons/constants";
import { formatShortAddress } from "@/lib/canvas/format-address";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("pons monitor read-model", () => {
  it("1. normalizes active/fired launch rows only", () => {
    const active = normalizePonsMonitorLaunchRow({
      token_address: "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
      market_address: "0x1111111111111111111111111111111111111111",
      factory_version: "v2",
      launch_block_number: 34870001,
      launch_block_timestamp: "2026-08-13T22:11:42.000Z",
      status: "active",
    });
    assert.ok(active);
    assert.equal(
      active.tokenAddress,
      "0xabcdef0123456789abcdef0123456789abcdef01",
    );
    assert.equal(active.dbStatus, "active");
    assert.equal(active.version, "v2");

    assert.equal(
      normalizePonsMonitorLaunchRow({
        token_address: "0xabcdef0123456789abcdef0123456789abcdef01",
        launch_block_timestamp: "2026-08-13T22:11:42.000Z",
        status: "expired",
      }),
      null,
    );
    assert.equal(
      normalizePonsMonitorLaunchRow({
        token_address: "not-an-address",
        launch_block_timestamp: "2026-08-13T22:11:42.000Z",
        status: "active",
      }),
      null,
    );
  });

  it("2. maps watching vs activity from durable status only", () => {
    const base = {
      tokenAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
      marketAddress: null,
      version: "v1" as const,
      launchBlock: 1,
      launchTimestamp: "2026-08-13T22:11:42.000Z",
      launchMs: Date.parse("2026-08-13T22:11:42.000Z"),
    };
    assert.equal(
      mapLaunchToMonitorItem({ ...base, dbStatus: "active" }, 3).status,
      "watching",
    );
    assert.equal(
      mapLaunchToMonitorItem({ ...base, dbStatus: "active" }, 3).launchpad,
      "pons",
    );
    assert.equal(
      mapLaunchToMonitorItem({ ...base, dbStatus: "fired" }, 3).status,
      "activity",
    );
    assert.equal(
      mapLaunchToMonitorItem({ ...base, dbStatus: "active" }, 3)
        .firstBuyerCount,
      3,
    );
  });

  it("3. sorts newest launch first then token address", () => {
    const a = {
      tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      launchMs: 2000,
    };
    const b = {
      tokenAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      launchMs: 3000,
    };
    const c = {
      tokenAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
      launchMs: 3000,
    };
    const rows = [a, c, b].sort(comparePonsMonitorLaunches);
    assert.deepEqual(
      rows.map((r) => r.tokenAddress),
      [
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "0xcccccccccccccccccccccccccccccccccccccccc",
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ],
    );
  });

  it("4. caps public rows and uses continuation window cutoff", () => {
    assert.equal(PONS_MONITOR_LIMIT, 15);
    assert.equal(CONTINUATION_WATCH_END_SECONDS, 300);
    const now = Date.parse("2026-08-13T22:20:00.000Z");
    assert.equal(
      continuationWatchCutoffIso(now),
      new Date(now - 300_000).toISOString(),
    );
  });

  it("5. response shape omits worker secrets / internal fields", () => {
    const route = readSrc("src/app/api/pons/monitor/route.ts");
    assert.ok(route.includes("loadPonsMonitor"));
    assert.ok(route.includes("getCachedPonsMonitor"));
    assert.ok(route.includes("Cache-Control"));
    assert.equal(route.includes("SUPABASE_SECRET"), false);
    assert.equal(route.includes("private_key"), false);

    const lib = readSrc("src/lib/pons/monitor.ts");
    assert.ok(lib.includes("activeCount"));
    assert.ok(lib.includes("chainHead"));
    assert.equal(lib.includes("wallet_address"), false);
    assert.equal(lib.includes("first_buy_tx_hash"), false);
    assert.equal(lib.includes("factory_address"), false);
  });
});

describe("pons monitor terminal presentation", () => {
  it("6. independent object id + default placement away from watchlist", () => {
    const terminal = readSrc(
      "src/components/canvas/pons-monitor-terminal.tsx",
    );
    assert.ok(terminal.includes('4663-pons-monitor-terminal'));
    assert.equal(
      terminal.includes('PONS_MONITORING_ELEMENT_ID'),
      false,
    );
    assert.equal(
      /id=\{?"4663-pons-monitoring"\}?/.test(terminal) ||
        terminal.includes('="4663-pons-monitoring"'),
      false,
    );
    assert.ok(terminal.includes('left: "48%"'));
    assert.ok(terminal.includes('top: "36%"'));
    assert.ok(terminal.includes("PONS MONITOR"));
    assert.ok(terminal.includes("CHAIN"));
    assert.ok(terminal.includes("NO ACTIVE LAUNCHES"));
    assert.ok(terminal.includes("MONITORING PONS"));
    assert.ok(terminal.includes("WATCHING"));
    assert.ok(terminal.includes("formatShortAddress"));

    const monitoring = readSrc(
      "src/components/canvas/pons-monitoring-object.tsx",
    );
    assert.ok(monitoring.includes('4663-pons-monitoring'));
    assert.equal(monitoring.includes("4663-pons-monitor-terminal"), false);
  });

  it("7. movable PlayHTML host + canvas mounts (additive)", () => {
    const movable = readSrc(
      "src/components/canvas/movable-pons-monitor-terminal.tsx",
    );
    assert.ok(movable.includes("CanMoveElement"));
    assert.ok(movable.includes("PONS_MONITOR_TERMINAL_ELEMENT_ID"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("MovablePonsMonitoringObject"));
    assert.ok(surface.includes("MovablePonsMonitorTerminal"));
    assert.ok(surface.includes("MovableLiveChatObject"));

    const root = readSrc("src/components/canvas/canvas-root.tsx");
    assert.ok(root.includes("PonsMonitoringObject"));
    assert.ok(root.includes("PonsMonitorTerminal"));
  });

  it("8. polls compact endpoint without overlapping / without crashing hooks", () => {
    const hook = readSrc("src/components/canvas/use-pons-monitor.ts");
    assert.ok(hook.includes("/api/pons/monitor"));
    assert.ok(hook.includes("8_000") || hook.includes("8000"));
    assert.ok(hook.includes("inFlight"));
    assert.ok(hook.includes("lastGood"));
    assert.ok(hook.includes("cache: \"no-store\""));
  });

  it("9. existing watchlist + Candidate B remain untouched by terminal wiring", () => {
    const watchlist = readSrc("src/lib/events/continuation-watchlist.ts");
    assert.ok(watchlist.includes("CONTINUATION_WATCHLIST_LIMIT"));
    assert.equal(watchlist.includes("loadPonsMonitor"), false);

    const continuation = readSrc("src/lib/pons/continuation.ts");
    assert.ok(continuation.includes("Candidate B") || continuation.includes("CONTINUATION_WINDOW"));

    const terminal = readSrc(
      "src/components/canvas/pons-monitor-terminal.tsx",
    );
    assert.equal(terminal.includes("openPonsMonitoringPanel"), false);
    assert.equal(terminal.includes("Dexscreener"), false);
    assert.equal(terminal.includes("href="), false);

    assert.equal(
      formatShortAddress("0xabcdef0123456789abcdef0123456789abcdef01"),
      "0xabcd…ef01",
    );
  });
});
