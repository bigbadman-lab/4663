/**
 * RADAR V1 — user-facing rename, panel UX, alert wiring, health cadence.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CONTINUATION_WATCHLIST_POLL_MS } from "@/components/canvas/use-continuation-watchlist";
import { getLiveControlDockItems } from "@/lib/canvas/control-palette";
import {
  robinhoodChainAddressExplorerUrl,
  robinhoodChainBlockExplorerUrl,
  robinhoodChainTokenExplorerUrl,
  robinhoodChainTxExplorerUrl,
} from "@/lib/canvas/blockscout";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("RADAR V1 naming + watchlist UX", () => {
  it("dock label is RADAR; stale CRYPTO label removed from this feature", () => {
    assert.deepEqual(
      getLiveControlDockItems().map((i) => i.label),
      ["TEXT", "DRAW", "HOME", "RADAR", "RESET"],
    );
    const defs = readSrc("src/lib/canvas/control-palette.ts");
    assert.ok(defs.includes('label: "RADAR"'));
    assert.equal(defs.includes('label: "CRYPTO"'), false);
    assert.ok(defs.includes('id: "summon"'));

    const monitoring = readSrc(
      "src/components/canvas/pons-monitoring-object.tsx",
    );
    assert.ok(monitoring.includes("ON OUR RADAR"));
    assert.equal(monitoring.includes("CRYPTO"), false);

    const panel = readSrc("src/components/canvas/pons-monitoring-panel.tsx");
    assert.ok(panel.includes("ON OUR RADAR"));
    assert.ok(panel.includes("tokens currently on our radar"));
    assert.equal(panel.includes("last 5"), false);
    assert.equal(panel.includes("CRYPTO"), false);
  });

  it("watchlist DTO exposes eventId; recentQualifications retained (not alert trigger)", () => {
    const loader = readSrc("src/lib/events/continuation-watchlist.ts");
    assert.ok(loader.includes("eventId: string"));
    assert.ok(loader.includes("recentQualifications"));
    assert.ok(loader.includes("RADAR_RECENT_QUALIFICATIONS_LIMIT"));
    assert.equal(loader.includes("CONTINUATION_WATCHLIST_LIMIT = 5"), true);
  });

  it("copy address + investigate + detail navigation wiring", () => {
    const panel = readSrc("src/components/canvas/pons-monitoring-panel.tsx");
    assert.ok(panel.includes("PonsAddressCopyControl"));
    assert.ok(panel.includes("copyTextQuiet"));
    assert.ok(panel.includes("COPIED"));
    assert.ok(panel.includes("[ TAKE A CLOSER LOOK ]"));
    assert.ok(panel.includes("[ BACK ]"));
    assert.ok(panel.includes("data-4663-radar-back"));
    assert.ok(panel.includes("/api/pons/token/"));
    assert.ok(panel.includes("initialTokenAddress"));
    assert.ok(panel.includes("onClearSelection"));

    const state = readSrc(
      "src/components/canvas/pons-monitoring-panel-state.ts",
    );
    assert.ok(state.includes("selectedTokenAddress"));
    assert.ok(state.includes("openRadarToToken"));
  });
});

describe("RADAR V1 canvas alert + explorers", () => {
  it("locked alert copy + radar.json Lottie wiring", () => {
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(alert.includes('title: "JUST HIT OUR RADAR"'));
    assert.ok(
      alert.includes(
        'body: "Something on Robinhood Chain caught our attention."',
      ),
    );
    assert.ok(alert.includes('cta: "[ TAKE A LOOK ]"'));
    assert.ok(alert.includes('"/radar.json"'));
    assert.ok(alert.includes("lottie-react"));
    assert.ok(alert.includes("prefers-reduced-motion"));
    assert.ok(alert.includes("onOpen"));
    assert.ok(alert.includes("pointer-events-none"));
    assert.ok(alert.includes('data-4663-radar-lottie'));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("RadarAlertLayer"));

    const pkg = readSrc("package.json");
    assert.ok(pkg.includes('"lottie-react"'));
    assert.ok(readSrc("public/radar.json").includes('"v"'));
  });

  it("alert body is movable; only TAKE A LOOK opens RADAR", () => {
    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(alert.includes("CanMoveElement"));
    assert.ok(alert.includes("PLAYHTML_CANVAS_BOUNDS_ID"));
    assert.ok(alert.includes("playhtmlRadarAlertElementId"));
    assert.ok(alert.includes("cursor-grab"));
    assert.ok(alert.includes("active:cursor-grabbing"));
    assert.ok(alert.includes("useInteractiveControlProtection"));
    assert.ok(alert.includes("stopPlayhtmlMoveStart"));

    // CTA is the open control — not a whole-card button wrapper.
    assert.ok(alert.includes('data-4663-radar-alert-open'));
    assert.ok(alert.includes("{RADAR_ALERT_COPY.cta}"));
    assert.ok(alert.includes("onOpen(alert.tokenAddress)"));
    assert.ok(alert.includes("onDismiss(alert.eventId)"));
    assert.ok(alert.includes("event.stopPropagation()"));

    // Body/host must not wire open on the movable shell.
    const hostBlock = alert.slice(
      alert.indexOf("<CanMoveElement"),
      alert.indexOf("data-4663-radar-alert-open"),
    );
    assert.equal(hostBlock.includes("onOpen("), false);
    assert.equal(hostBlock.includes("onClick"), false);

    // Lottie stays non-interactive so drag reaches the host.
    const lottieIdx = alert.indexOf("data-4663-radar-lottie");
    assert.ok(lottieIdx > 0);
    const lottieWindow = alert.slice(Math.max(0, lottieIdx - 120), lottieIdx + 40);
    assert.ok(lottieWindow.includes("pointer-events-none"));

    // CTA isolates move-start (IC3.6 pattern) and keeps a mobile tap target.
    assert.ok(alert.includes("min-h-11"));
    const ctaIdx = alert.indexOf("data-4663-radar-alert-open");
    const ctaWindow = alert.slice(ctaIdx, ctaIdx + 550);
    assert.ok(ctaWindow.includes("onPointerDown={stopPlayhtmlMoveStart}"));
    assert.ok(ctaWindow.includes("onMouseDown={stopPlayhtmlMoveStart}"));
    assert.ok(ctaWindow.includes("onTouchStart={stopPlayhtmlMoveStart}"));
  });

  it("Blockscout token/wallet/tx/block helpers", () => {
    assert.equal(
      robinhoodChainTokenExplorerUrl(TOKEN),
      `https://robinhoodchain.blockscout.com/token/${TOKEN}`,
    );
    assert.equal(
      robinhoodChainAddressExplorerUrl(TOKEN),
      `https://robinhoodchain.blockscout.com/address/${TOKEN}`,
    );
    assert.equal(
      robinhoodChainTxExplorerUrl(TX),
      `https://robinhoodchain.blockscout.com/tx/${TX}`,
    );
    assert.equal(
      robinhoodChainBlockExplorerUrl(12345),
      "https://robinhoodchain.blockscout.com/block/12345",
    );
  });

  it("Health 1: 45s visible poll; alerts driven by tokens[] membership", () => {
    assert.equal(CONTINUATION_WATCHLIST_POLL_MS, 45_000);
    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes("startVisibilityIntervalPolling"));
    assert.ok(hook.includes("applyRadarWatchlistSnapshot"));
    assert.ok(hook.includes("visibleTokens"));
    assert.equal(hook.includes("diffRadarQualifications"), false);
    assert.ok(hook.includes("recentQualifications"));
    assert.ok(hook.includes("getCanvasPlacementSnapshot"));
    assert.ok(hook.includes("radarAlertSpawnWorldPct"));
    assert.ok(hook.includes("createRadarContinuationRealtimeClient"));
    assert.ok(hook.includes("emitAlerts: isDocumentVisible()"));
    assert.equal(CONTINUATION_WATCHLIST_POLL_MS, 45_000);
  });
});

describe("RADAR alert viewport placement wiring", () => {
  it("alerts live on the world layer; spawn uses camera snapshot", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("<RadarAlertLayer />"));
    assert.ok(surface.includes("<EphemeralTextLayer />"));
    // Mounted as a world sibling of EphemeralTextLayer (after home-region closes).
    const afterHome = surface.slice(surface.lastIndexOf("data-4663-home-region"));
    const homeCloseToText = afterHome.slice(
      0,
      afterHome.indexOf("<EphemeralTextLayer"),
    );
    assert.ok(homeCloseToText.includes("</div>"));
    assert.ok(homeCloseToText.includes("<RadarAlertLayer"));
    // Not only inside the home-region opening tag block before first child close —
    // ensure world comment documents world-% placement.
    assert.ok(surface.includes("viewport-spawned RADAR alerts"));

    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes("resolvePosition"));
    assert.ok(hook.includes("getCanvasPlacementSnapshot"));

    const alerts = readSrc("src/lib/events/radar-alerts.ts");
    assert.ok(alerts.includes("radarAlertSpawnWorldPct"));
    assert.ok(alerts.includes("dockCreateWorldPct"));
  });
});

describe("RADAR alert trigger wiring (store → layer → open)", () => {
  it("production hook diffs tokens[]; layer mounts alerts; click opens token", () => {
    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes("diffRadarVisibleTokens") || hook.includes("applyRadarWatchlistSnapshot"));
    assert.ok(hook.includes("tokens: visibleTokens") || hook.includes("tokens: visibleTokens") || hook.includes("visibleTokens"));
    assert.ok(hook.includes("alerts"));
    assert.ok(
      hook.includes("applied.alerts") ||
        hook.includes("[...pruned, ...diff.newAlerts]"),
    );

    const layer = readSrc("src/components/canvas/radar-alert-layer.tsx");
    assert.ok(layer.includes("export function RadarAlertLayer"));
    assert.ok(layer.includes("useContinuationWatchlist()"));
    assert.ok(layer.includes("alerts.map"));
    assert.ok(layer.includes("RadarAlertObject"));
    assert.ok(layer.includes("onOpen={openToToken}"));
    assert.ok(layer.includes("onDismiss={dismissAlert}"));

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("<RadarAlertLayer />"));
    assert.ok(
      surface.includes('from "@/components/canvas/radar-alert-layer"'),
    );

    const alert = readSrc("src/components/canvas/radar-alert-object.tsx");
    assert.ok(alert.includes("onOpen(alert.tokenAddress)"));
    assert.ok(alert.includes("onDismiss(alert.eventId)"));
    assert.ok(alert.includes('data-4663-radar-alert-open'));
    assert.equal(
      alert.includes('aria-label="JUST HIT OUR RADAR — take a look"'),
      true,
    );

    const state = readSrc(
      "src/components/canvas/pons-monitoring-panel-state.ts",
    );
    assert.ok(state.includes("openRadarToToken"));
    assert.ok(state.includes("selectedTokenAddress"));
  });
});
