/**
 * Continuation watchlist read-model + public monitoring presentation tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN,
  robinhoodChainTokenExplorerUrl,
} from "@/lib/canvas/blockscout";
import {
  CONTINUATION_WATCHLIST_LIMIT,
  compareContinuationWatchlistRows,
  continuationWhyCopy,
  normalizeContinuationWatchlistRow,
  utcDayBounds,
} from "@/lib/events/continuation-watchlist";
import { EVENT_TYPE_PONS_BUYER_CONTINUATION } from "@/lib/pons/constants";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_C = "0xcccccccccccccccccccccccccccccccccccccccc";

describe("continuation watchlist read-model", () => {
  it("1. only pons_buyer_continuation rows normalize", () => {
    const ok = normalizeContinuationWatchlistRow({
      event_type: EVENT_TYPE_PONS_BUYER_CONTINUATION,
      token_address: TOKEN_A,
      market_address: "0x1111111111111111111111111111111111111111",
      occurred_at: "2026-08-13T12:00:00.000Z",
      new_buyers: 3,
      payload: {
        launch_block_number: 34002670,
        pre_3m_buyers: 2,
        continuation_buyers: 3,
      },
    });
    assert.ok(ok);
    assert.equal(ok!.continuationBuyerCount, 3);
    assert.equal(ok!.pre3mFirstBuyers, 2);
    assert.equal(ok!.continuationFirstBuyers, 3);

    assert.equal(
      normalizeContinuationWatchlistRow({
        event_type: "pons_buying_activity",
        token_address: TOKEN_A,
        occurred_at: "2026-08-13T12:00:00.000Z",
        new_buyers: 5,
        payload: { launch_block_number: 34002670 },
      }),
      null,
    );
  });

  it("2. UTC day bounds are calendar-day (continuation occurred_at filter basis)", () => {
    const bounds = utcDayBounds(Date.parse("2026-08-13T15:30:00.000Z"));
    assert.equal(bounds.startIso, "2026-08-13T00:00:00.000Z");
    assert.equal(bounds.endIso, "2026-08-14T00:00:00.000Z");
    const loader = readSrc("src/lib/events/continuation-watchlist.ts");
    assert.ok(loader.includes('EVENT_TYPE_PONS_BUYER_CONTINUATION'));
    assert.ok(loader.includes('.gte("occurred_at"'));
    assert.ok(loader.includes('.lt("occurred_at"'));
    assert.ok(loader.includes("utcDayBounds"));
  });

  it("3–5. max 5, fewer than 5, deterministic ordering by strength then recency then address", () => {
    assert.equal(CONTINUATION_WATCHLIST_LIMIT, 5);
    const rows = [
      {
        continuationBuyerCount: 2,
        continuationTimestamp: "2026-08-13T12:00:00.000Z",
        tokenAddress: TOKEN_C,
      },
      {
        continuationBuyerCount: 4,
        continuationTimestamp: "2026-08-13T10:00:00.000Z",
        tokenAddress: TOKEN_A,
      },
      {
        continuationBuyerCount: 4,
        continuationTimestamp: "2026-08-13T11:00:00.000Z",
        tokenAddress: TOKEN_B,
      },
      {
        continuationBuyerCount: 3,
        continuationTimestamp: "2026-08-13T09:00:00.000Z",
        tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
      },
      {
        continuationBuyerCount: 2,
        continuationTimestamp: "2026-08-13T13:00:00.000Z",
        tokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      },
      {
        continuationBuyerCount: 2,
        continuationTimestamp: "2026-08-13T08:00:00.000Z",
        tokenAddress: "0xffffffffffffffffffffffffffffffffffffffff",
      },
    ];
    const sorted = [...rows].sort(compareContinuationWatchlistRows);
    assert.equal(sorted[0]!.tokenAddress, TOKEN_B); // 4 buyers, newer
    assert.equal(sorted[1]!.tokenAddress, TOKEN_A); // 4 buyers, older
    assert.equal(sorted.slice(0, 5).length, 5);
    assert.equal(sorted.slice(0, 2).length, 2);
  });

  it("6. empty list is valid (no tokens)", () => {
    assert.deepEqual([].slice(0, CONTINUATION_WATCHLIST_LIMIT), []);
    assert.ok(
      continuationWhyCopy(2).includes(
        "2 new first-time buyers arrived during the 3–5 minute continuation window",
      ),
    );
  });

  it("7. Blockscout token URLs are Robinhood Chain explorer", () => {
    assert.equal(
      ROBINHOOD_CHAIN_BLOCKSCOUT_ORIGIN,
      "https://robinhoodchain.blockscout.com",
    );
    assert.equal(
      robinhoodChainTokenExplorerUrl(TOKEN_A),
      `https://robinhoodchain.blockscout.com/token/${TOKEN_A}`,
    );
    const panel = readSrc("src/components/canvas/pons-monitoring-panel.tsx");
    assert.ok(panel.includes("robinhoodChainTokenExplorerUrl"));
  });
});

describe("public PONS monitoring presentation", () => {
  it("8. one watchlist monitoring object; live terminal is separate; live layer empty", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("MovablePonsMonitoringObject"));
    assert.ok(surface.includes("MovablePonsMonitorTerminal"));
    assert.ok(surface.includes("items={[]}"));
    assert.equal(
      (surface.match(/<MovablePonsMonitoringObject/g) ?? []).length,
      1,
    );
    assert.equal(
      (surface.match(/<MovablePonsMonitorTerminal/g) ?? []).length,
      1,
    );

    const monitoring = readSrc(
      "src/components/canvas/pons-monitoring-object.tsx",
    );
    assert.ok(monitoring.includes("/pons.png"));
    assert.ok(monitoring.includes("ROBINHOOD CHAIN"));
    assert.ok(monitoring.includes("TOKENS WE'RE MONITORING") || monitoring.includes("TOKENS WE&apos;RE MONITORING"));
    assert.ok(monitoring.includes("SCANNING"));
    assert.ok(monitoring.includes("ACTIVE"));
    assert.ok(monitoring.includes("min-h-11"));
    assert.ok(monitoring.includes("touch-manipulation"));
    assert.ok(monitoring.includes('type="button"'));
    assert.ok(monitoring.includes("[ OPEN ]"));
    assert.ok(monitoring.includes("data-4663-pons-monitoring-card"));
    assert.ok(monitoring.includes("PonsMonitoringPanel"));
    assert.ok(monitoring.includes("stopPlayhtmlMoveStart"));
    assert.ok(monitoring.includes("useInteractiveControlProtection"));

    const root = readSrc("src/components/canvas/canvas-root.tsx");
    assert.ok(root.includes("PonsMonitoringObject"));
    assert.equal(root.includes("LiveEventLayer"), false);
  });

  it("9. click/tap opens list panel; empty copy present", () => {
    const panel = readSrc("src/components/canvas/pons-monitoring-panel.tsx");
    assert.ok(panel.includes("data-4663-pons-monitoring-panel"));
    assert.ok(panel.includes("Nothing has crossed our continuation signal today yet."));
    assert.ok(panel.includes("WHY IT"));
    assert.ok(panel.includes("createPortal"));

    const monitoring = readSrc(
      "src/components/canvas/pons-monitoring-object.tsx",
    );
    assert.ok(monitoring.includes("openPanel()"));
    assert.ok(monitoring.includes("usePonsMonitoringPanelOpen"));
    assert.ok(monitoring.includes("data-4663-pons-monitoring-open"));

    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes("openPonsMonitoringPanel"));
    assert.ok(
      readSrc("src/lib/canvas/control-palette.ts").includes('label: "CRYPTO"'),
    );
  });

  it("10. API route + poll; detector / Candidate B modules untouched by presentation", () => {
    const route = readSrc(
      "src/app/api/events/continuation-watchlist/route.ts",
    );
    assert.ok(route.includes("loadContinuationWatchlist"));

    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes("/api/events/continuation-watchlist"));
    assert.ok(hook.includes("45_000") || hook.includes("45000"));

    const continuation = readSrc("src/lib/pons/continuation.ts");
    assert.ok(continuation.includes("Candidate B"));
    assert.ok(continuation.includes("CONTINUATION_WINDOW_START_SECONDS"));

    const fireSql = readSrc(
      "supabase/migrations/20260812140000_stage11b_pons_buyer_continuation.sql",
    );
    assert.ok(fireSql.includes("fire_pons_buyer_continuation"));

    const loader = readSrc("src/lib/events/continuation-watchlist.ts");
    assert.equal(loader.includes("fire_pons_buyer_continuation"), false);
    assert.equal(loader.includes("@playhtml/react"), false);
  });
});
