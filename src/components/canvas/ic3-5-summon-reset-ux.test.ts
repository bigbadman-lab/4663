/**
 * IC3.5 — SUMMON + RESET UX recovery (local feedback + HOME after success).
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
  CONTROL_NOTICE_COPY,
  CONTROL_NOTICE_DURATION_MS,
  controlNoticeMessage,
} from "@/lib/canvas/control-notice";
import {
  getSummonDockA11yLabel,
  isSummonDockDisabled,
  SUMMON_DOCK_A11Y,
} from "@/lib/canvas/control-palette";
import {
  getLocalHomeView,
  registerLocalHomeView,
  requestLocalHomeView,
} from "@/lib/canvas/local-home-view";
import {
  canDispatchSummon,
  selectSummonEventIds,
  SUMMON_COOLDOWN_MS,
  SUMMON_MAX_EVENTS,
} from "@/lib/canvas/summon";
import { LIVE_OBJECT_MAX_AGE_MS } from "@/lib/canvas/visible-events";
import type { PublicEvent } from "@/lib/events/types";
import { colourFromSessionId } from "@/lib/social/colour";
import { ParticipationController } from "@/lib/social/participation-controller";
import {
  PARTICIPATION_SESSION_STORAGE_KEY,
  type StorageLike,
} from "@/lib/social/participation-session";
import type {
  ParticipationPresenceClient,
  ParticipationPresenceHandlers,
  ParticipationPresenceSubscription,
} from "@/lib/social/participation-realtime";
import type { ParticipationPresencePayload } from "@/lib/social/types";

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
    type: "pons_buyer_continuation",
    tokenAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
    newBuyers: 3,
    triggerBlockNumber: 34400000,
    triggerTxHash: null,
    ...overrides,
  };
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  store: Record<string, string>;
} {
  const store = { ...initial };
  return {
    store,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]!
        : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
  };
}

function mockPresence(): ParticipationPresenceClient & {
  tracked: ParticipationPresencePayload[];
  handlers: ParticipationPresenceHandlers | null;
  emitStatus: (status: string) => void;
} {
  const client = {
    tracked: [] as ParticipationPresencePayload[],
    handlers: null as ParticipationPresenceHandlers | null,
    emitStatus(status: string) {
      client.handlers?.onStatus(status);
    },
    connect({
      handlers,
    }: {
      presenceKey: string;
      handlers: ParticipationPresenceHandlers;
    }) {
      client.handlers = handlers;
      const sub: ParticipationPresenceSubscription = {
        disconnect: () => {
          client.handlers = null;
        },
        track: async (payload) => {
          client.tracked.push(payload);
        },
        untrack: async () => {},
        getPresenceState: () => ({}),
      };
      return sub;
    },
  };
  return client;
}

describe("IC3.5 SUMMON UX recovery", () => {
  it("1. successful SUMMON creates active state (max 4)", () => {
    const historical = Array.from({ length: 6 }, (_, i) =>
      event({
        id: idAt(i + 1),
        occurredAt: new Date(
          NOW - LIVE_OBJECT_MAX_AGE_MS - 60_000 - i * 1_000,
        ).toISOString(),
      }),
    );
    const ids = selectSummonEventIds(historical, NOW);
    assert.equal(ids.length, SUMMON_MAX_EVENTS);
    assert.equal(SUMMON_MAX_EVENTS, 4);
    const state = createActiveSummonState({
      ownerSessionId: OWNER,
      eventIds: ids,
    });
    assert.ok(state);
    assert.equal(state!.eventIds.length, 4);
  });

  it("2–3+7. successful path: write → cooldown → local HOME; failures skip HOME", () => {
    const controller = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );
    const onSummon = controller.slice(controller.indexOf("function onSummon"));
    const writeIdx = onSummon.indexOf("writePageData({ active: state })");
    const coolIdx = onSummon.indexOf("lastDispatchAtRef.current = now");
    const homeIdx = onSummon.indexOf("requestLocalHomeView()");
    assert.ok(writeIdx > 0);
    assert.ok(coolIdx > writeIdx);
    assert.ok(homeIdx > coolIdx);

    const emptyBranch = onSummon.slice(
      onSummon.indexOf('onControlNoticeRef.current?.("summon-empty")'),
      onSummon.indexOf("writePageData({ active: state })"),
    );
    assert.equal(emptyBranch.includes("requestLocalHomeView"), false);
    assert.equal(emptyBranch.includes("lastDispatchAtRef"), false);

    const catchBlock = onSummon.slice(onSummon.indexOf("} catch {"));
    assert.ok(catchBlock.includes('"summon-error"'));
    assert.equal(
      catchBlock.slice(0, catchBlock.indexOf("} finally")).includes(
        "requestLocalHomeView",
      ),
      false,
    );
    assert.equal(
      catchBlock.slice(0, catchBlock.indexOf("} finally")).includes(
        "lastDispatchAtRef",
      ),
      false,
    );

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("registerLocalHomeView(goHome)"));
    assert.equal(surface.includes("requestLocalHomeView"), false);
  });

  it("4–6. empty history notice; no cooldown / camera side effects in helpers", () => {
    assert.equal(
      controlNoticeMessage("summon-empty"),
      "NO SUMMON HISTORY YET",
    );
    assert.equal(
      createActiveSummonState({ ownerSessionId: OWNER, eventIds: [] }),
      null,
    );
    assert.equal(selectSummonEventIds([], NOW).length, 0);

    let homeCalls = 0;
    const unsub = registerLocalHomeView(() => {
      homeCalls += 1;
    });
    // Empty path never calls requestLocalHomeView in production code (structural).
    assert.equal(homeCalls, 0);
    unsub();

    const controller = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );
    assert.ok(controller.includes('"summon-empty"'));
    assert.ok(
      readSrc("src/components/canvas/canvas-control-palette.tsx").includes(
        "data-4663-control-notice",
      ),
    );
  });

  it("7–9. fetch error notice copy + duration local-only", () => {
    assert.equal(CONTROL_NOTICE_COPY["summon-error"], "SUMMON UNAVAILABLE");
    assert.equal(CONTROL_NOTICE_DURATION_MS, 1_200);
    assert.equal(controlNoticeMessage("summon-error"), "SUMMON UNAVAILABLE");
    const noticeHook = readSrc(
      "src/components/canvas/use-control-notice.ts",
    );
    assert.ok(noticeHook.includes("CONTROL_NOTICE_DURATION_MS"));
    assert.ok(noticeHook.includes("clearTimeout"));
  });

  it("10. in-flight duplicate summon requests are prevented", () => {
    const controller = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );
    assert.ok(controller.includes("summonInFlightRef.current"));
    assert.ok(controller.includes("if (summonInFlightRef.current) return"));
    assert.ok(controller.includes("setSummonInFlight(true)"));
    assert.equal(
      isSummonDockDisabled({
        canSummon: true,
        summonActive: false,
        isSummonOwner: false,
        summonInFlight: true,
      }),
      true,
    );
    assert.equal(
      getSummonDockA11yLabel({
        summonActive: false,
        isSummonOwner: false,
        summonInFlight: true,
      }),
      SUMMON_DOCK_A11Y.inFlight,
    );
  });

  it("11–12. cooldown remains 4s with explanatory title/aria", () => {
    assert.equal(SUMMON_COOLDOWN_MS, 4_000);
    assert.equal(canDispatchSummon(NOW - 3_999, NOW), false);
    assert.equal(canDispatchSummon(NOW - 4_000, NOW), true);
    assert.equal(
      getSummonDockA11yLabel({
        summonActive: false,
        isSummonOwner: false,
        summonCoolingDown: true,
      }),
      "Summon cooling down",
    );
  });

  it("13–15. owner OFF clears; non-owner cannot; OFF does not HOME", () => {
    const state = createActiveSummonState({
      ownerSessionId: OWNER,
      eventIds: [idAt(1)],
    });
    assert.ok(state);
    const data = { active: state };
    assert.equal(shouldDismissActiveSummonOnClick(data, OWNER), true);
    assert.equal(shouldDismissActiveSummonOnClick(data, OTHER), false);
    assert.equal(clearActiveSummonIfOwner(data, OWNER).active, null);
    assert.equal(clearActiveSummonIfOwner(data, OTHER).active, state);

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
      getSummonDockA11yLabel({
        summonActive: true,
        isSummonOwner: false,
      }),
      SUMMON_DOCK_A11Y.activeOther,
    );

    const onSummon = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    ).slice(
      readSrc("src/components/canvas/use-summon-controller.ts").indexOf(
        "function onSummon",
      ),
    );
    const dismissBlock = onSummon.slice(
      0,
      onSummon.indexOf("const now = Date.now()"),
    );
    assert.ok(dismissBlock.includes("dismissIfOwner()"));
    assert.equal(dismissBlock.includes("requestLocalHomeView"), false);
  });

  it("16. local HOME registry is local-only", () => {
    let hits = 0;
    const unsub = registerLocalHomeView(() => {
      hits += 1;
    });
    assert.equal(typeof getLocalHomeView(), "function");
    requestLocalHomeView();
    assert.equal(hits, 1);
    unsub();
    requestLocalHomeView();
    assert.equal(hits, 1);
  });
});

describe("IC3.5 RESET UX recovery", () => {
  it("1–8. RESET semantics preserved: content only, no camera/HOME/identity", () => {
    const colour = colourFromSessionId(OWNER);
    const storage = memoryStorage({
      [PARTICIPATION_SESSION_STORAGE_KEY]: JSON.stringify({
        sessionId: OWNER,
        displayName: "Alex",
        colour,
        joinedAt: "2026-08-12T12:00:00.000Z",
      }),
    });
    const presence = mockPresence();
    const controller = new ParticipationController({
      storage,
      presence,
      onSelf: () => {},
      onParticipants: () => {},
      onStatus: () => {},
      onSessionEnded: () => {},
      onSessionContentReset: () => {},
    });
    controller.start();
    presence.emitStatus("SUBSCRIBED");
    assert.equal(controller.resetContent().ok, true);
    assert.equal(controller.getSelf()?.sessionId, OWNER);
    assert.equal(controller.getSelf()?.displayName, "Alex");

    const playTree = readSrc("src/components/canvas/canvas-play-tree.tsx");
    const resetHandler = playTree.slice(playTree.indexOf("onReset={() =>"));
    assert.ok(resetHandler.includes("resetContent()"));
    assert.ok(resetHandler.includes('showNotice("reset-cleared")'));
    assert.equal(resetHandler.includes("goHome"), false);
    assert.equal(resetHandler.includes("requestLocalHomeView"), false);

    const layer = readSrc("src/components/social/ephemeral-text-layer.tsx");
    assert.ok(layer.includes("removeEphemeralTextsByOwner"));
    assert.ok(layer.includes("removeEphemeralDrawingsByOwner"));
    assert.ok(layer.includes("registerSessionContentResetHandler"));

    const summonCtrl = readSrc(
      "src/components/canvas/use-summon-controller.ts",
    );
    assert.ok(summonCtrl.includes("registerSessionContentResetHandler"));
    assert.ok(summonCtrl.includes("clearActiveSummonIfOwner"));
  });

  it("4–5. owned Summon clears on RESET helper; other owner retained", () => {
    const owned = createActiveSummonState({
      ownerSessionId: OWNER,
      eventIds: [idAt(1)],
    });
    const other = createActiveSummonState({
      ownerSessionId: OTHER,
      eventIds: [idAt(2)],
    });
    assert.ok(owned && other);
    assert.equal(clearActiveSummonIfOwner({ active: owned }, OWNER).active, null);
    assert.equal(
      clearActiveSummonIfOwner({ active: other }, OWNER).active,
      other,
    );
  });

  it("9–10. CLEARED notice is local transient copy", () => {
    assert.equal(controlNoticeMessage("reset-cleared"), "CLEARED");
    assert.equal(CONTROL_NOTICE_DURATION_MS, 1_200);
    const palette = readSrc(
      "src/components/canvas/canvas-control-palette.tsx",
    );
    assert.ok(palette.includes("controlNoticeMessage"));
    assert.ok(palette.includes('role="status"'));
    assert.ok(palette.includes("aria-live"));
    assert.equal(palette.includes("toast"), false);
  });
});
