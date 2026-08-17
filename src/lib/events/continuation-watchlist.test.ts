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
  attachLaunchTimestamps,
  compareContinuationWatchlistRows,
  continuationWhyCopy,
  loadContinuationWatchlist,
  normalizeContinuationWatchlistRow,
  toRadarWatchlistToken,
  utcDayBounds,
} from "@/lib/events/continuation-watchlist";
import { EVENT_TYPE_PONS_BUYER_CONTINUATION } from "@/lib/pons/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

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

const EVENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function rank(
  launchpad: "pons" | "pools",
  tokenAddress: string,
  continuationBuyerCount: number,
  continuationTimestamp: string,
) {
  return {
    launchpad,
    tokenAddress,
    continuationBuyerCount,
    continuationTimestamp,
    eventId: EVENT_ID,
  };
}

function eventRow(input: {
  id: string;
  source: "pons" | "pools";
  token: string;
  buyers: number;
  at: string;
}) {
  return {
    id: input.id,
    event_type: EVENT_TYPE_PONS_BUYER_CONTINUATION,
    source: input.source,
    token_address: input.token,
    market_address:
      input.source === "pons"
        ? "0x1111111111111111111111111111111111111111"
        : "0x23f8209572b4a1c2ad88a42749e830791fb027f1",
    occurred_at: input.at,
    new_buyers: input.buyers,
    payload: {
      launch_block_number: 34002670,
      pre_3m_buyers: 1,
      continuation_buyers: input.buyers,
    },
  };
}

function thenableQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    in() {
      return query;
    },
    gte() {
      return query;
    },
    lt() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    then(
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

function mockWatchlistSupabase(opts: {
  events: unknown[];
  ponsLaunches?: unknown[];
  poolsLaunches?: unknown[];
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "production_state") {
        return thenableQuery({
          data: { production_start_block: 34002666 },
          error: null,
        });
      }
      if (table === "events") {
        return thenableQuery({ data: opts.events, error: null });
      }
      if (table === "pons_launches") {
        return thenableQuery({
          data: opts.ponsLaunches ?? [],
          error: null,
        });
      }
      if (table === "pools_instant_launches") {
        return thenableQuery({
          data: opts.poolsLaunches ?? [],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("continuation watchlist read-model", () => {
  it("1. only pons_buyer_continuation rows normalize", () => {
    const ok = normalizeContinuationWatchlistRow({
      id: EVENT_ID,
      event_type: EVENT_TYPE_PONS_BUYER_CONTINUATION,
      source: "pons",
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
    assert.equal(ok!.eventId, EVENT_ID);
    assert.equal(ok!.continuationBuyerCount, 3);
    assert.equal(ok!.pre3mFirstBuyers, 2);
    assert.equal(ok!.continuationFirstBuyers, 3);
    assert.equal(ok!.launchpad, "pons");

    const poolsRow = normalizeContinuationWatchlistRow({
      id: EVENT_ID,
      event_type: EVENT_TYPE_PONS_BUYER_CONTINUATION,
      source: "pools",
      token_address: TOKEN_A,
      occurred_at: "2026-08-13T12:00:00.000Z",
      new_buyers: 3,
      payload: { launch_block_number: 34002670 },
    });
    assert.equal(poolsRow?.launchpad, "pools");

    assert.equal(
      normalizeContinuationWatchlistRow({
        id: EVENT_ID,
        event_type: "pons_buying_activity",
        token_address: TOKEN_A,
        occurred_at: "2026-08-13T12:00:00.000Z",
        new_buyers: 5,
        payload: { launch_block_number: 34002670 },
      }),
      null,
    );

    assert.equal(
      normalizeContinuationWatchlistRow({
        event_type: EVENT_TYPE_PONS_BUYER_CONTINUATION,
        token_address: TOKEN_A,
        occurred_at: "2026-08-13T12:00:00.000Z",
        new_buyers: 3,
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
    assert.ok(loader.includes("RADAR_WATCHLIST_SOURCES"));
    assert.ok(loader.includes('.in("source"'));
    assert.ok(loader.includes("EVENT_SOURCE_POOLS"));
    assert.ok(loader.includes("pools_instant_launches"));
    assert.ok(loader.includes("pons_launches"));
    assert.equal(loader.includes('.eq("source", EVENT_SOURCE_PONS)'), false);
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
    assert.ok(surface.includes("RadarAlertLayer"));
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
    assert.ok(monitoring.includes("ON OUR RADAR"));
    assert.ok(monitoring.includes("SCANNING"));
    assert.ok(monitoring.includes("ON RADAR"));
    assert.ok(monitoring.includes("min-h-11"));
    assert.ok(monitoring.includes("touch-manipulation"));
    assert.ok(monitoring.includes('type="button"'));
    assert.ok(monitoring.includes("[ OPEN ]"));
    assert.ok(monitoring.includes("data-4663-pons-monitoring-card"));
    assert.ok(monitoring.includes("PonsMonitoringPanel"));
    assert.ok(monitoring.includes("stopPlayhtmlMoveStart"));
    assert.ok(monitoring.includes("useInteractiveControlProtection"));
    assert.equal(monitoring.includes("RadarAlertLayer"), false);

    const alertLayer = readSrc("src/components/canvas/radar-alert-layer.tsx");
    assert.ok(alertLayer.includes("export function RadarAlertLayer"));
    assert.ok(alertLayer.includes("RadarAlertObject"));

    const root = readSrc("src/components/canvas/canvas-root.tsx");
    assert.ok(root.includes("PonsMonitoringObject"));
    assert.equal(root.includes("LiveEventLayer"), false);
  });

  it("9. click/tap opens list panel; empty copy present", () => {
    const panel = readSrc("src/components/canvas/pons-monitoring-panel.tsx");
    assert.ok(panel.includes("data-4663-pons-monitoring-panel"));
    assert.ok(panel.includes("Nothing has crossed our radar today yet."));
    assert.ok(panel.includes("ON OUR RADAR"));
    assert.ok(panel.includes("WHY IT"));
    assert.ok(panel.includes("RadarLaunchpadLabel"));
    assert.ok(panel.includes("createPortal"));
    assert.equal(panel.includes("last 5"), false);

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
      readSrc("src/lib/canvas/control-palette.ts").includes('label: "RADAR"'),
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

describe("aggregated PONS + POOLS watchlist ranking", () => {
  it("drops unknown/missing source instead of defaulting to pons", () => {
    assert.equal(
      normalizeContinuationWatchlistRow({
        id: EVENT_ID,
        event_type: EVENT_TYPE_PONS_BUYER_CONTINUATION,
        token_address: TOKEN_A,
        occurred_at: "2026-08-13T12:00:00.000Z",
        new_buyers: 3,
        payload: { launch_block_number: 34002670 },
      }),
      null,
    );
    assert.equal(
      normalizeContinuationWatchlistRow({
        id: EVENT_ID,
        event_type: EVENT_TYPE_PONS_BUYER_CONTINUATION,
        source: "crowd",
        token_address: TOKEN_A,
        occurred_at: "2026-08-13T12:00:00.000Z",
        new_buyers: 3,
        payload: { launch_block_number: 34002670 },
      }),
      null,
    );
  });

  it("nulls POOLS market_address so Instant strategy is not a PONS market", () => {
    const row = normalizeContinuationWatchlistRow({
      id: EVENT_ID,
      event_type: EVENT_TYPE_PONS_BUYER_CONTINUATION,
      source: "pools",
      token_address: TOKEN_A,
      market_address: "0x23f8209572b4a1c2ad88a42749e830791fb027f1",
      occurred_at: "2026-08-13T12:00:00.000Z",
      new_buyers: 3,
      payload: { launch_block_number: 34002670 },
    });
    assert.equal(row?.launchpad, "pools");
    assert.equal(row?.marketAddress, null);
  });

  it("mixed ranking: POOLS can displace PONS in one global top-5", () => {
    const rows = [
      rank("pons", TOKEN_A, 2, "2026-08-13T12:00:00.000Z"),
      rank("pons", TOKEN_B, 2, "2026-08-13T11:00:00.000Z"),
      rank("pons", TOKEN_C, 2, "2026-08-13T10:00:00.000Z"),
      rank("pools", "0x1111111111111111111111111111111111111111", 5, "2026-08-13T09:00:00.000Z"),
      rank("pools", "0x2222222222222222222222222222222222222222", 4, "2026-08-13T08:00:00.000Z"),
      rank("pools", "0x3333333333333333333333333333333333333333", 3, "2026-08-13T07:00:00.000Z"),
    ];
    const top = [...rows].sort(compareContinuationWatchlistRows).slice(0, 5);
    assert.deepEqual(
      top.map((r) => r.launchpad),
      ["pools", "pools", "pools", "pons", "pons"],
    );
    assert.equal(top.some((r) => r.tokenAddress === TOKEN_C), false);
  });

  it("mixed ranking: PONS can displace POOLS in one global top-5", () => {
    const rows = [
      rank("pools", TOKEN_A, 2, "2026-08-13T12:00:00.000Z"),
      rank("pools", TOKEN_B, 2, "2026-08-13T11:00:00.000Z"),
      rank("pools", TOKEN_C, 2, "2026-08-13T10:00:00.000Z"),
      rank("pons", "0x1111111111111111111111111111111111111111", 5, "2026-08-13T09:00:00.000Z"),
      rank("pons", "0x2222222222222222222222222222222222222222", 4, "2026-08-13T08:00:00.000Z"),
      rank("pons", "0x3333333333333333333333333333333333333333", 3, "2026-08-13T07:00:00.000Z"),
    ];
    const top = [...rows].sort(compareContinuationWatchlistRows).slice(0, 5);
    assert.deepEqual(
      top.map((r) => r.launchpad),
      ["pons", "pons", "pons", "pools", "pools"],
    );
  });

  it("same token address on both launchpads stays two rows; launchpad then eventId tie-break", () => {
    const pons = {
      ...rank("pons", TOKEN_A, 4, "2026-08-13T12:00:00.000Z"),
      eventId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    };
    const pools = {
      ...rank("pools", TOKEN_A, 4, "2026-08-13T12:00:00.000Z"),
      eventId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    };
    const sorted = [pools, pons].sort(compareContinuationWatchlistRows);
    assert.equal(sorted[0]!.launchpad, "pons");
    assert.equal(sorted[1]!.launchpad, "pools");
    assert.equal(sorted[0]!.tokenAddress, sorted[1]!.tokenAddress);
  });

  it("launch enrichment keys by launchpad+token so sources do not collide", () => {
    const tokens = attachLaunchTimestamps(
      [
        {
          eventId: EVENT_ID,
          tokenAddress: TOKEN_A,
          launchpad: "pons",
          marketAddress: "0x1111111111111111111111111111111111111111",
          continuationTimestamp: "2026-08-13T12:00:00.000Z",
          continuationBuyerCount: 3,
          pre3mFirstBuyers: 1,
          continuationFirstBuyers: 3,
        },
        {
          eventId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          tokenAddress: TOKEN_A,
          launchpad: "pools",
          marketAddress: null,
          continuationTimestamp: "2026-08-13T12:01:00.000Z",
          continuationBuyerCount: 2,
          pre3mFirstBuyers: 1,
          continuationFirstBuyers: 2,
        },
      ],
      new Map([
        ["pons:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "2026-08-13T11:00:00.000Z"],
        ["pools:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "2026-08-13T11:30:00.000Z"],
      ]),
    );
    assert.equal(tokens[0]!.launchTimestamp, "2026-08-13T11:00:00.000Z");
    assert.equal(tokens[1]!.launchTimestamp, "2026-08-13T11:30:00.000Z");
    const dto = toRadarWatchlistToken(tokens[1]!);
    assert.equal(dto.launchpad, "pools");
    assert.equal(dto.displayMarketAddress, null);
    assert.equal("poolId" in dto, false);
  });
});

describe("loadContinuationWatchlist aggregated query", () => {
  it("PONS-only, POOLS-only, and mixed rows share one ranked top-5", async () => {
    const mixed = [
      eventRow({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        source: "pons",
        token: TOKEN_A,
        buyers: 2,
        at: "2026-08-17T12:00:00.000Z",
      }),
      eventRow({
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        source: "pools",
        token: TOKEN_B,
        buyers: 5,
        at: "2026-08-17T11:00:00.000Z",
      }),
      eventRow({
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        source: "pons",
        token: TOKEN_C,
        buyers: 4,
        at: "2026-08-17T10:00:00.000Z",
      }),
    ];
    const result = await loadContinuationWatchlist(
      mockWatchlistSupabase({ events: mixed }),
      Date.parse("2026-08-17T15:00:00.000Z"),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.body.tokens.map((t) => t.launchpad),
      ["pools", "pons", "pons"],
    );
    assert.equal(result.body.tokens[0]!.tokenAddress, TOKEN_B);
    assert.equal(result.body.tokens[0]!.marketAddress, null);
    assert.equal(result.body.tokens[1]!.launchpad, "pons");
    assert.equal(result.body.tokens.every((t) => typeof t.launchpad === "string"), true);
  });
});
