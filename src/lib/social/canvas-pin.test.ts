/**
 * Social 7 — PIN validation, LIVE eligibility, server create.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIVE_OBJECT_MAX_AGE_MS } from "@/lib/canvas/visible-events";
import { colourFromSessionId } from "@/lib/social/colour";
import {
  PIN_TTL_MS,
  isEventLiveForPin,
  isPinOwner,
  normalizeCanvasPin,
  parseCreatePinInput,
  parseUnpinPinInput,
  pinExpiresAtFromOccurred,
  pruneExpiredPins,
  removeCanvasPinById,
  shouldRestoreLiveAfterUnpin,
  suppressLiveEventsWhenPinned,
  upsertCanvasPin,
  type CanvasPin,
} from "@/lib/social/canvas-pin";
import { createCanvasPin, deleteCanvasPin } from "@/lib/social/pins-server";
import type { PublicEvent } from "@/lib/events/types";

const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";
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
  const occurred = new Date("2026-08-13T11:00:00.000Z");
  const ev = event(occurred.toISOString());
  return {
    id: "770e8400-e29b-41d4-a716-446655440000",
    chainId: 4663,
    eventId: ev.id,
    pinnedBySessionId: SESSION_A,
    pinnedByDisplayName: "Alex",
    pinnedByColour: COLOUR,
    createdAt: "2026-08-13T11:05:00.000Z",
    expiresAt: pinExpiresAtFromOccurred(occurred).toISOString(),
    event: ev,
    ...overrides,
  };
}

describe("Social 7 LIVE window for PIN", () => {
  it("LIVE window is exactly 10m; exclusive at boundary", () => {
    assert.equal(LIVE_OBJECT_MAX_AGE_MS, 600_000);
    assert.equal(
      isEventLiveForPin(new Date(NOW - 599_999).toISOString(), NOW),
      true,
    );
    assert.equal(
      isEventLiveForPin(new Date(NOW - LIVE_OBJECT_MAX_AGE_MS).toISOString(), NOW),
      false,
    );
    assert.equal(
      isEventLiveForPin(new Date(NOW - LIVE_OBJECT_MAX_AGE_MS - 1).toISOString(), NOW),
      false,
    );
  });

  it("pin expiry is event.occurred_at + 24h, not pin time", () => {
    const occurred = new Date("2026-08-13T10:00:00.000Z");
    const pinCreated = new Date("2026-08-13T10:08:00.000Z");
    const expires = pinExpiresAtFromOccurred(occurred);
    assert.equal(expires.getTime() - occurred.getTime(), PIN_TTL_MS);
    assert.notEqual(
      expires.getTime(),
      pinCreated.getTime() + PIN_TTL_MS,
    );
  });
});

describe("Social 7 PIN helpers", () => {
  it("suppresses live duplicates when pinned", () => {
    const a = event(new Date(NOW - 1000).toISOString(), EVENT_A);
    const b = event(
      new Date(NOW - 2000).toISOString(),
      "880e8400-e29b-41d4-a716-446655440000",
    );
    const out = suppressLiveEventsWhenPinned([a, b], new Set([EVENT_A]));
    assert.deepEqual(
      out.map((e) => e.id),
      [b.id],
    );
  });

  it("parseCreatePinInput ignores client expiry fields", () => {
    const parsed = parseCreatePinInput({
      eventId: EVENT_A,
      participationSessionId: SESSION_A,
      displayName: "Alex",
      colour: COLOUR,
      expiresAt: "2000-01-01T00:00:00.000Z",
      createdAt: "2000-01-01T00:00:00.000Z",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(parsed, "expiresAt"),
        false,
      );
    }
  });

  it("normalize / prune / upsert", () => {
    const pin = samplePin();
    assert.ok(normalizeCanvasPin(pin));
    assert.deepEqual(pruneExpiredPins([pin], Date.parse(pin.expiresAt)), []);
    assert.equal(upsertCanvasPin([], pin).length, 1);
  });

  it("owner helpers + live restoration after unpin", () => {
    const pin = samplePin();
    assert.equal(isPinOwner(pin, SESSION_A), true);
    assert.equal(isPinOwner(pin, "550e8400-e29b-41d4-a716-446655440099"), false);
    assert.equal(removeCanvasPinById([pin], pin.id).length, 0);

    const parsed = parseUnpinPinInput({
      pinId: pin.id,
      participationSessionId: SESSION_A,
    });
    assert.equal(parsed.ok, true);

    assert.equal(
      shouldRestoreLiveAfterUnpin(
        new Date(NOW - 5 * 60 * 1000).toISOString(),
        NOW,
      ),
      true,
    );
    assert.equal(
      shouldRestoreLiveAfterUnpin(
        new Date(NOW - LIVE_OBJECT_MAX_AGE_MS).toISOString(),
        NOW,
      ),
      false,
    );
  });
});

describe("Social 7.1 PIN server delete", () => {
  it("deletes only when session owns pin", async () => {
    let deleteCalls = 0;
    const supabase = {
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
                            id: "770e8400-e29b-41d4-a716-446655440000",
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
                        deleteCalls += 1;
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

    const denied = await deleteCanvasPin(supabase as never, {
      pinId: "770e8400-e29b-41d4-a716-446655440000",
      participationSessionId: "550e8400-e29b-41d4-a716-446655440099",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.error, "not_pin_owner");
    assert.equal(deleteCalls, 0);

    const ok = await deleteCanvasPin(supabase as never, {
      pinId: "770e8400-e29b-41d4-a716-446655440000",
      participationSessionId: SESSION_A,
    });
    assert.equal(ok.ok, true);
    assert.equal(deleteCalls, 1);
  });
});

describe("Social 7 PIN server create", () => {
  it("rejects missing / wrong type / not live; sets expiry from occurred_at; unique", async () => {
    const occurredIso = "2026-08-13T11:55:00.000Z";
    const now = new Date("2026-08-13T12:00:00.000Z");
    let insertCount = 0;
    let lastInsert: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === "events") {
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
                              occurred_at: occurredIso,
                              trigger_block_number: 34400000,
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
        }
        return {
          insert(payload: Record<string, unknown>) {
            insertCount += 1;
            lastInsert = payload;
            if (insertCount === 1) {
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: {
                          id: "770e8400-e29b-41d4-a716-446655440000",
                          chain_id: 4663,
                          event_id: EVENT_A,
                          pinned_by_session_id: SESSION_A,
                          pinned_by_display_name: "Alex",
                          pinned_by_colour: COLOUR,
                          token_address:
                            "0xabcdef0123456789abcdef0123456789abcdef01",
                          new_buyers: 7,
                          event_occurred_at: occurredIso,
                          trigger_block_number: 34400000,
                          trigger_tx_hash: null,
                          created_at: now.toISOString(),
                          expires_at: pinExpiresAtFromOccurred(
                            new Date(occurredIso),
                          ).toISOString(),
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            }
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: null,
                      error: { code: "23505", message: "dup" },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const missing = await createCanvasPin(
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
      } as never,
      {
        eventId: EVENT_A,
        participationSessionId: SESSION_A,
        displayName: "Alex",
        colour: COLOUR,
      },
      now,
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error, "event_not_found");

    const wrongType = await createCanvasPin(
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
                              event_type: "pons_buyer_continuation",
                              token_address: "0xabc",
                              new_buyers: 7,
                              occurred_at: occurredIso,
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
    assert.equal(wrongType.ok, false);
    if (!wrongType.ok) assert.equal(wrongType.error, "invalid_event_type");

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
                              occurred_at: "2026-08-13T11:00:00.000Z",
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

    const first = await createCanvasPin(
      supabase as never,
      {
        eventId: EVENT_A,
        participationSessionId: SESSION_A,
        displayName: "Alex",
        colour: COLOUR,
      },
      now,
    );
    assert.equal(first.ok, true);
    assert.ok(lastInsert);
    const insertPayload = lastInsert as Record<string, unknown>;
    assert.equal(
      Object.prototype.hasOwnProperty.call(insertPayload, "created_at"),
      false,
    );
    assert.equal(
      insertPayload.expires_at,
      pinExpiresAtFromOccurred(new Date(occurredIso)).toISOString(),
    );
    if (first.ok) {
      assert.equal(
        Date.parse(first.pin.expiresAt) - Date.parse(first.pin.event.occurredAt),
        PIN_TTL_MS,
      );
    }

    const second = await createCanvasPin(
      supabase as never,
      {
        eventId: EVENT_A,
        participationSessionId: SESSION_A,
        displayName: "Alex",
        colour: COLOUR,
      },
      now,
    );
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.error, "already_pinned");
      assert.equal(second.status, 409);
    }
  });
});
