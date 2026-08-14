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

  it("watchlist DTO exposes eventId; recentQualifications for alerts", () => {
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

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("RadarAlertLayer"));

    const pkg = readSrc("package.json");
    assert.ok(pkg.includes('"lottie-react"'));
    assert.ok(readSrc("public/radar.json").includes('"v"'));
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

  it("Health 1: 45s visible poll preserved", () => {
    assert.equal(CONTINUATION_WATCHLIST_POLL_MS, 45_000);
    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes("startVisibilityIntervalPolling"));
    assert.ok(hook.includes("diffRadarQualifications"));
    assert.ok(hook.includes("recentQualifications"));
  });
});
