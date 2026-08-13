/**
 * Stage 8A.3 — Summon icon toggle (no separate Dismiss; no auto-timer).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clearActiveSummonIfOwner,
  createActiveSummonState,
  shouldDismissActiveSummonOnClick,
} from "@/lib/canvas/active-summon";
import {
  isSummonDockDisabled,
  SUMMON_DOCK_ACTIVE_COLOR,
} from "@/lib/canvas/control-palette";
import { PONS_BUYER_COUNT_COLOR } from "@/lib/canvas/pons-visual";
import {
  selectSummonEventIds,
  SUMMON_LIFETIME_MS,
} from "@/lib/canvas/summon";
import { LIVE_OBJECT_MAX_AGE_MS } from "@/lib/canvas/visible-events";
import type { PublicEvent } from "@/lib/events/types";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const OTHER = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const NOW = Date.parse("2026-08-13T12:00:00.000Z");

function idAt(n: number): string {
  return `aaaaaaaa-bbbb-cccc-dddd-${String(n).padStart(12, "0")}`;
}

function event(
  overrides: Partial<PublicEvent> & Pick<PublicEvent, "id" | "occurredAt">,
): PublicEvent {
  return {
    type: "pons_buying_activity",
    tokenAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
    newBuyers: 3,
    triggerBlockNumber: 34400000,
    triggerTxHash: null,
    ...overrides,
  };
}

describe("Stage 8A.3 Summon toggle", () => {
  it("1+8. no separate Dismiss control in palette / surface / play tree", () => {
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    const controller = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );

    assert.equal(palette.includes("[ DISMISS ]"), false);
    assert.equal(palette.includes("data-4663-summon-dismiss"), false);
    assert.equal(palette.includes("onDismissSummon"), false);
    assert.equal(surface.includes("onDismissSummon"), false);
    assert.equal(playTree.includes("onDismissSummon"), false);
    assert.equal(controller.includes("onDismiss:"), false);
    assert.ok(palette.includes("onSummon"));
    assert.ok(palette.includes("isSummonDockDisabled"));
  });

  it("2–5. OFF→ON selects; ON→OFF clears owned set; third ON can select again", () => {
    const historical = Array.from({ length: 4 }, (_, i) =>
      event({
        id: idAt(i + 1),
        occurredAt: new Date(
          NOW - LIVE_OBJECT_MAX_AGE_MS - 60_000 - i * 1_000,
        ).toISOString(),
      }),
    );
    const live = event({
      id: idAt(99),
      occurredAt: new Date(NOW - 1_000).toISOString(),
    });
    const events = [...historical, live];

    // First ON: selection (existing production helper).
    const firstIds = selectSummonEventIds(events, NOW);
    assert.ok(firstIds.length > 0);
    assert.equal(firstIds.includes(idAt(99)), false);

    const active = createActiveSummonState({
      ownerSessionId: OWNER,
      eventIds: firstIds,
      summonId: idAt(50),
      startedAt: "2026-08-13T12:00:00.000Z",
    });
    assert.ok(active);
    const data = { active };

    assert.equal(shouldDismissActiveSummonOnClick(data, OWNER), true);
    assert.equal(shouldDismissActiveSummonOnClick(data, OTHER), false);
    assert.equal(
      shouldDismissActiveSummonOnClick({ active: null }, OWNER),
      false,
    );

    // Second click (ON→OFF): remove summoned page-data only.
    const cleared = clearActiveSummonIfOwner(data, OWNER);
    assert.equal(cleared.active, null);

    // Third ON: selection still available (fresh fetch/selection path).
    const thirdIds = selectSummonEventIds(events, NOW);
    assert.deepEqual(thirdIds, firstIds);
    assert.equal(shouldDismissActiveSummonOnClick(cleared, OWNER), false);
  });

  it("4. ON→OFF path returns before selectSummonEventIds / createActiveSummonState", () => {
    const controller = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );
    const onSummonSlice = controller.slice(
      controller.indexOf("function onSummon"),
    );
    const dismissIdx = onSummonSlice.indexOf("shouldDismissActiveSummonOnClick");
    const selectIdx = onSummonSlice.indexOf("selectSummonEventIds");
    const createIdx = onSummonSlice.indexOf("createActiveSummonState");
    assert.ok(dismissIdx > 0);
    assert.ok(selectIdx > dismissIdx);
    assert.ok(createIdx > dismissIdx);
    assert.ok(controller.includes("dismissIfOwner"));
    // Early return after dismiss — no selection on toggle-off.
    assert.ok(
      /shouldDismissActiveSummonOnClick[\s\S]*?dismissIfOwner\(\);\s*return;/.test(
        onSummonSlice,
      ),
    );
  });

  it("6. clearing summon does not touch live layer wiring", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("MovableLiveEventLayer"));
    assert.ok(surface.includes("SummonLayer"));
    assert.ok(surface.includes("PinnedPonsLayer"));
    assert.ok(surface.includes("EphemeralTextLayer"));
    // Live items stay independent of summonId gate.
    assert.ok(surface.includes("items={liveItems}"));
    assert.ok(surface.includes("{summonId ? ("));

    const active = createActiveSummonState({
      ownerSessionId: OWNER,
      eventIds: [idAt(1)],
      summonId: idAt(50),
      startedAt: "2026-08-13T12:00:00.000Z",
    });
    assert.ok(active);
    const cleared = clearActiveSummonIfOwner({ active }, OWNER);
    assert.equal(cleared.active, null);
  });

  it("7. no 90s / fixed auto-dismiss timer on active Summon path", () => {
    const controller = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );
    const summonLib = readSrc("src/lib/canvas/summon.ts");
    const activeLib = readSrc("src/lib/canvas/active-summon.ts");

    assert.equal(controller.includes("setTimeout"), false);
    assert.equal(controller.includes("clearTimeout"), false);
    assert.equal(controller.includes("SUMMON_LIFETIME_MS"), false);
    assert.equal(controller.includes("90000"), false);
    assert.equal(controller.includes("90_000"), false);
    assert.equal(activeLib.includes("setTimeout"), false);
    assert.equal(activeLib.includes("90000"), false);
    assert.equal(activeLib.includes("90_000"), false);
    // Deprecated constant exists but is not 90s and does not drive lifetime.
    assert.equal(SUMMON_LIFETIME_MS, 20_000);
    assert.ok(summonLib.includes("@deprecated"));
    assert.equal(summonLib.includes("90_000"), false);
    assert.equal(summonLib.includes("90000"), false);
  });

  it("dock: owner can click while active; non-owner stays disabled", () => {
    assert.equal(
      isSummonDockDisabled({
        canSummon: false,
        summonActive: true,
        isSummonOwner: true,
      }),
      false,
    );
    assert.equal(
      isSummonDockDisabled({
        canSummon: false,
        summonActive: true,
        isSummonOwner: false,
      }),
      true,
    );
    assert.equal(
      isSummonDockDisabled({
        canSummon: true,
        summonActive: false,
        isSummonOwner: false,
      }),
      false,
    );
    assert.equal(
      isSummonDockDisabled({
        canSummon: false,
        summonActive: false,
        isSummonOwner: false,
      }),
      true,
    );
  });
});

describe("Stage 8A.3.1 Summon active visual polish", () => {
  it("1–3. inactive default vs active accent driven by summonActive", () => {
    assert.equal(SUMMON_DOCK_ACTIVE_COLOR, PONS_BUYER_COUNT_COLOR);
    assert.equal(SUMMON_DOCK_ACTIVE_COLOR, "#8FAE00");

    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("SUMMON_DOCK_ACTIVE_COLOR"));
    assert.ok(palette.includes("isSummonActive"));
    assert.ok(palette.includes("DOCK_BUTTON_IDLE"));
    assert.ok(palette.includes("DOCK_BUTTON_SUMMON_ACTIVE"));
    assert.ok(palette.includes('data-4663-dock-icon-active="true"'));
    assert.ok(palette.includes("maskImage"));
    // Active styling gated on summonActive prop (no local active state).
    assert.ok(palette.includes("item.id === \"summon\" && summonActive"));
    assert.equal(palette.includes("useState"), false);
  });

  it("4–6. active Summon stays clickable, clears via onSummon, no Dismiss", () => {
    assert.equal(
      isSummonDockDisabled({
        canSummon: false,
        summonActive: true,
        isSummonOwner: true,
      }),
      false,
    );

    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("cursor-pointer"));
    assert.ok(palette.includes('aria-pressed={'));
    assert.ok(palette.includes('"Clear summon"'));
    assert.equal(palette.includes("[ DISMISS ]"), false);
    assert.equal(palette.includes("onDismissSummon"), false);

    const controller = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );
    assert.ok(controller.includes("shouldDismissActiveSummonOnClick"));
    assert.ok(
      /shouldDismissActiveSummonOnClick[\s\S]*?dismissIfOwner\(\);\s*return;/.test(
        controller.slice(controller.indexOf("function onSummon")),
      ),
    );
  });
});
