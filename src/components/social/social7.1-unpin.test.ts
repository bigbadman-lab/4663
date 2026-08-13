/**
 * Social 7.1 — Owner UNPIN structural + behavioral invariants.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LIVE_OBJECT_MAX_AGE_MS } from "@/lib/canvas/visible-events";
import { colourFromSessionId } from "@/lib/social/colour";
import {
  isPinOwner,
  parseUnpinPinInput,
  pinExpiresAtFromOccurred,
  removeCanvasPinById,
  shouldRestoreLiveAfterUnpin,
  suppressLiveEventsWhenPinned,
  type CanvasPin,
} from "@/lib/social/canvas-pin";
import { deleteCanvasPin, createCanvasPin } from "@/lib/social/pins-server";
import type { PublicEvent } from "@/lib/events/types";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_B = "550e8400-e29b-41d4-a716-446655440001";
const PIN_ID = "770e8400-e29b-41d4-a716-446655440000";
const EVENT_A = "660e8400-e29b-41d4-a716-446655440000";
const COLOUR = colourFromSessionId(SESSION_A);
const NOW = Date.parse("2026-08-13T12:00:00.000Z");

function event(occurredAt: string, id = EVENT_A): PublicEvent {
  return {
    id,
    type: "pons_buying_activity",
    tokenAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
    newBuyers: 7,
    occurredAt,
    triggerBlockNumber: 34400000,
    triggerTxHash: null,
  };
}

function samplePin(overrides: Partial<CanvasPin> = {}): CanvasPin {
  const occurred = new Date(NOW - 5 * 60 * 1000);
  const ev = event(occurred.toISOString());
  return {
    id: PIN_ID,
    chainId: 4663,
    eventId: ev.id,
    pinnedBySessionId: SESSION_A,
    pinnedByDisplayName: "Alex",
    pinnedByColour: COLOUR,
    createdAt: new Date(NOW - 4 * 60 * 1000).toISOString(),
    expiresAt: pinExpiresAtFromOccurred(occurred).toISOString(),
    event: ev,
    ...overrides,
  };
}

describe("Social 7.1 owner UNPIN UI gating", () => {
  it("owner sees UNPIN; non-owner and anonymous do not (isPinOwner)", () => {
    const pin = samplePin();
    assert.equal(isPinOwner(pin, SESSION_A), true);
    assert.equal(isPinOwner(pin, SESSION_B), false);
    assert.equal(isPinOwner(pin, null), false);
    assert.equal(isPinOwner(pin, undefined), false);
    assert.equal(isPinOwner(pin, "not-a-uuid"), false);

    const ui = readSrc("src/components/canvas/pinned-pons-object.tsx");
    assert.ok(ui.includes("[ UNPIN ]"));
    assert.ok(ui.includes("isPinOwner"));
    assert.ok(ui.includes("canUnpin = !!self && isPinOwner"));
  });

  it("SUMMON still has no PIN/UNPIN", () => {
    const summoned = readSrc("src/components/canvas/summoned-pons-object.tsx");
    assert.equal(summoned.includes("PonsPinControl"), false);
    assert.equal(summoned.includes("UNPIN"), false);
    assert.equal(summoned.includes("[ PIN"), false);
  });

  it("MARK / TEXT / DRAW unchanged for PIN/UNPIN", () => {
    assert.equal(
      readSrc("src/components/social/canvas-mark-object.tsx").includes("UNPIN"),
      false,
    );
    assert.equal(
      readSrc("src/components/social/ephemeral-text-object.tsx").includes(
        "UNPIN",
      ),
      false,
    );
    assert.equal(
      readSrc("src/lib/social/ephemeral-drawing.ts").includes("unpin"),
      false,
    );
  });
});

describe("Social 7.1 server DELETE ownership", () => {
  it("parseUnpinPinInput requires pinId + participationSessionId", () => {
    assert.equal(parseUnpinPinInput(null).ok, false);
    const ok = parseUnpinPinInput({
      pinId: PIN_ID,
      participationSessionId: SESSION_A,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.pinId, PIN_ID);
      assert.equal(ok.participationSessionId, SESSION_A);
    }
  });

  it("owner DELETE succeeds; non-owner rejected; missing pin idempotent", async () => {
    let deleted = false;
    const ownerSupabase = {
      from(table: string) {
        assert.equal(table, "canvas_pins");
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return {
                          data: {
                            id: PIN_ID,
                            chain_id: 4663,
                            pinned_by_session_id: SESSION_A,
                          },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          delete() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async eq() {
                        deleted = true;
                        return { error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const owner = await deleteCanvasPin(ownerSupabase as never, {
      pinId: PIN_ID,
      participationSessionId: SESSION_A,
    });
    assert.equal(owner.ok, true);
    assert.equal(deleted, true);

    const nonOwner = await deleteCanvasPin(ownerSupabase as never, {
      pinId: PIN_ID,
      participationSessionId: SESSION_B,
    });
    assert.equal(nonOwner.ok, false);
    if (!nonOwner.ok) {
      assert.equal(nonOwner.error, "not_pin_owner");
      assert.equal(nonOwner.status, 403);
    }

    const missingSupabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return { data: null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const missing = await deleteCanvasPin(missingSupabase as never, {
      pinId: PIN_ID,
      participationSessionId: SESSION_A,
    });
    assert.equal(missing.ok, true);
    if (missing.ok) assert.equal(missing.alreadyGone, true);
  });

  it("API route exposes DELETE via service-role helper; public RLS has no DELETE", () => {
    const route = readSrc("src/app/api/social/pins/route.ts");
    assert.ok(route.includes("export async function DELETE"));
    assert.ok(route.includes("deleteCanvasPin"));
    assert.ok(route.includes("createPresenceSupabase"));

    const migration = readSrc(
      "supabase/migrations/20260813030000_social7_canvas_pins.sql",
    );
    assert.ok(migration.includes("REVOKE ALL PRIVILEGES"));
    assert.ok(migration.includes("GRANT SELECT"));
    assert.equal(migration.includes("GRANT DELETE"), false);
    assert.equal(migration.includes("FOR DELETE"), false);
  });
});

describe("Social 7.1 LIVE restoration after UNPIN", () => {
  it("unpin at 5m restores live; exactly 10m and 11m do not", () => {
    const occurred5 = new Date(NOW - 5 * 60 * 1000).toISOString();
    const occurred10 = new Date(NOW - LIVE_OBJECT_MAX_AGE_MS).toISOString();
    const occurred11 = new Date(NOW - 11 * 60 * 1000).toISOString();

    assert.equal(shouldRestoreLiveAfterUnpin(occurred5, NOW), true);
    assert.equal(shouldRestoreLiveAfterUnpin(occurred10, NOW), false);
    assert.equal(shouldRestoreLiveAfterUnpin(occurred11, NOW), false);

    const live = event(occurred5);
    const pinnedIds = new Set([live.id]);
    assert.equal(suppressLiveEventsWhenPinned([live], pinnedIds).length, 0);
    // After unpin: empty pin set → live returns from existing source
    assert.equal(
      suppressLiveEventsWhenPinned([live], new Set()).map((e) => e.id)[0],
      live.id,
    );

    const stale = event(occurred10);
    // Even with empty pins, LIVE selection (age < 10m) would exclude it —
    // restoration helper documents that boundary.
    assert.equal(shouldRestoreLiveAfterUnpin(stale.occurredAt, NOW), false);
  });

  it("removeCanvasPinById clears local pin set for live recompute", () => {
    const pin = samplePin();
    const next = removeCanvasPinById([pin], PIN_ID);
    assert.equal(next.length, 0);
    assert.equal(
      suppressLiveEventsWhenPinned(
        [pin.event],
        new Set(next.map((p) => p.eventId)),
      ).length,
      1,
    );
  });
});

describe("Social 7.1 re-PIN while LIVE / reject after 10m", () => {
  it("create rejects not_live after 10m; uniqueness allows re-insert after delete", async () => {
    const now = new Date(NOW);
    const stale = await createCanvasPin(
      {
        from() {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return {
                            data: {
                              id: EVENT_A,
                              chain_id: 4663,
                              event_type: "pons_buying_activity",
                              token_address:
                                "0xabcdef0123456789abcdef0123456789abcdef01",
                              new_buyers: 7,
                              occurred_at: new Date(
                                NOW - LIVE_OBJECT_MAX_AGE_MS,
                              ).toISOString(),
                              trigger_block_number: 1,
                              trigger_tx_hash: null,
                            },
                            error: null,
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      } as never,
      {
        eventId: EVENT_A,
        participationSessionId: SESSION_A,
        displayName: "Alex",
        colour: COLOUR,
      },
      now,
    );
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.error, "not_live");

    // Structural: UNIQUE (chain_id, event_id) allows re-PIN after row delete
    const migration = readSrc(
      "supabase/migrations/20260813030000_social7_canvas_pins.sql",
    );
    assert.ok(migration.includes("UNIQUE (chain_id, event_id)"));
  });
});

describe("Social 7.1 WATCH / RESET / LEAVE / Presence / expiry / realtime", () => {
  it("WATCH survives UNPIN while event remains (no wipe on unpin)", () => {
    const watch = readSrc("src/lib/social/watch.ts");
    assert.equal(watch.includes("unpin"), false);
    assert.equal(watch.includes("canvas_pins"), false);

    const hook = readSrc("src/lib/social/use-canvas-pins.ts");
    assert.equal(hook.includes("clearWatch"), false);
    assert.equal(hook.includes("removeWatch"), false);
  });

  it("RESET / LEAVE / Presence do not unpin", () => {
    const hook = readSrc("src/lib/social/use-canvas-pins.ts");
    assert.equal(hook.includes("registerSessionEndedHandler"), false);
    assert.equal(hook.includes("registerSessionContentResetHandler"), false);
    assert.ok(hook.includes("unpin"));
    assert.ok(hook.includes("deleteCanvasPinRequest"));
  });

  it("natural 24h expiry unchanged; realtime DELETE subscribed", () => {
    const pinLib = readSrc("src/lib/social/canvas-pin.ts");
    assert.ok(pinLib.includes("PIN_TTL_MS = 24 * 60 * 60 * 1000"));
    assert.ok(pinLib.includes("isPinActive"));

    const realtime = readSrc("src/lib/social/pins-realtime.ts");
    assert.ok(realtime.includes('event: "INSERT"'));
    assert.ok(realtime.includes('event: "DELETE"'));
    assert.ok(realtime.includes("onDelete"));
    assert.ok(realtime.includes("payload.old"));

    const hook = readSrc("src/lib/social/use-canvas-pins.ts");
    assert.ok(hook.includes("getBrowserSupabaseClient"));
    assert.ok(hook.includes("onDelete"));
    assert.ok(hook.includes("removeCanvasPinById"));
  });

  it("shared Supabase singleton reused; PONS pipeline untouched", () => {
    assert.ok(
      readSrc("src/lib/social/use-canvas-pins.ts").includes(
        "getBrowserSupabaseClient",
      ),
    );
    assert.ok(readSrc("src/lib/pons/continuation.ts").length > 0);
    assert.ok(
      readSrc("src/lib/canvas/visible-events.ts").includes(
        "LIVE_OBJECT_MAX_AGE_MS",
      ),
    );
  });
});
