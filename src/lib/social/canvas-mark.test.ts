/**
 * Social 6 — MARK validation / expiry / one-per-session helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colourFromSessionId } from "@/lib/social/colour";
import {
  MARK_MAX_CHARS,
  MARK_TTL_MS,
  isMarkActive,
  markExpiresAtFromCreated,
  normalizeCanvasMark,
  parseCreateMarkInput,
  pruneExpiredMarks,
  sessionHasMark,
  upsertCanvasMark,
  validateMarkBody,
  validateMarkPosition,
  type CanvasMark,
} from "@/lib/social/canvas-mark";
import { createCanvasMark } from "@/lib/social/marks-server";

const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_B = "550e8400-e29b-41d4-a716-446655440001";
const COLOUR = colourFromSessionId(SESSION_A);

function sampleMark(overrides: Partial<CanvasMark> = {}): CanvasMark {
  const created = new Date("2026-08-13T00:00:00.000Z");
  const expires = markExpiresAtFromCreated(created);
  return {
    id: "660e8400-e29b-41d4-a716-446655440000",
    chainId: 4663,
    ownerSessionId: SESSION_A,
    ownerDisplayName: "Alex",
    ownerColour: COLOUR,
    body: "alex was here",
    leftPct: 40,
    topPct: 50,
    createdAt: created.toISOString(),
    expiresAt: expires.toISOString(),
    ...overrides,
  };
}

describe("Social 6 MARK validation", () => {
  it("body: trim, nonempty, 200 ok, >200 rejected, whitespace rejected", () => {
    assert.deepEqual(validateMarkBody("  hello  "), {
      ok: true,
      body: "hello",
    });
    assert.equal(validateMarkBody("").ok, false);
    assert.equal(validateMarkBody("   ").ok, false);
    assert.equal(validateMarkBody("a".repeat(MARK_MAX_CHARS)).ok, true);
    assert.equal(validateMarkBody("a".repeat(MARK_MAX_CHARS + 1)).ok, false);
  });

  it("coordinates validated and clamped into canvas band", () => {
    assert.deepEqual(validateMarkPosition(10, 20), {
      ok: true,
      leftPct: 10,
      topPct: 20,
    });
    assert.equal(validateMarkPosition(-1, 50).ok, false);
    assert.equal(validateMarkPosition(50, 101).ok, false);
    assert.equal(validateMarkPosition(NaN, 50).ok, false);
    const clamped = validateMarkPosition(2, 98);
    assert.equal(clamped.ok, true);
    if (clamped.ok) {
      assert.equal(clamped.leftPct, 5);
      assert.equal(clamped.topPct, 95);
    }
  });

  it("expiresAt is exactly 24h after createdAt", () => {
    const created = new Date("2026-08-13T12:00:00.000Z");
    const expires = markExpiresAtFromCreated(created);
    assert.equal(expires.getTime() - created.getTime(), MARK_TTL_MS);
    assert.equal(MARK_TTL_MS, 24 * 60 * 60 * 1000);
  });

  it("parseCreateMarkInput rejects bad session/body/position; ignores client timestamps", () => {
    const ok = parseCreateMarkInput({
      ownerSessionId: SESSION_A,
      ownerDisplayName: "Alex",
      ownerColour: COLOUR,
      body: "hi",
      leftPct: 40,
      topPct: 50,
      createdAt: "2000-01-01T00:00:00.000Z",
      expiresAt: "2000-01-02T00:00:00.000Z",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.body, "hi");
      assert.equal(
        Object.prototype.hasOwnProperty.call(ok, "createdAt"),
        false,
      );
    }
    assert.equal(
      parseCreateMarkInput({
        ownerSessionId: "not-uuid",
        ownerDisplayName: "Alex",
        ownerColour: COLOUR,
        body: "hi",
        leftPct: 40,
        topPct: 50,
      }).ok,
      false,
    );
  });

  it("normalize rejects malformed marks", () => {
    assert.equal(normalizeCanvasMark(null), null);
    assert.equal(
      normalizeCanvasMark({
        ...sampleMark(),
        body: "",
      }),
      null,
    );
    assert.equal(
      normalizeCanvasMark({
        ...sampleMark(),
        leftPct: 200,
      }),
      null,
    );
  });

  it("one mark per session helpers + prune at expiry", () => {
    const mark = sampleMark();
    const now = Date.parse(mark.createdAt) + 1000;
    assert.equal(sessionHasMark([mark], SESSION_A, now), true);
    assert.equal(sessionHasMark([mark], SESSION_B, now), false);
    assert.equal(isMarkActive(mark, Date.parse(mark.expiresAt)), false);
    assert.deepEqual(
      pruneExpiredMarks([mark], Date.parse(mark.expiresAt)),
      [],
    );
    const next = upsertCanvasMark([], mark);
    assert.equal(next.length, 1);
  });
});

describe("Social 6 MARK server create", () => {
  it("lets DB stamp timestamps and rejects duplicate session (unique)", async () => {
    const createdIso = "2026-08-13T01:00:00.000Z";
    const expiresIso = "2026-08-14T01:00:00.000Z";
    let insertCount = 0;
    let lastInsertPayload: Record<string, unknown> | null = null;

    const supabase = {
      from() {
        return {
          insert(payload: Record<string, unknown>) {
            insertCount += 1;
            lastInsertPayload = payload;
            if (insertCount === 1) {
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: {
                          id: "770e8400-e29b-41d4-a716-446655440000",
                          chain_id: 4663,
                          owner_session_id: SESSION_A,
                          owner_display_name: "Alex",
                          owner_colour: COLOUR,
                          body: "first",
                          left_pct: 40,
                          top_pct: 50,
                          created_at: createdIso,
                          expires_at: expiresIso,
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
                      error: { code: "23505", message: "duplicate" },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const first = await createCanvasMark(supabase as never, {
      ownerSessionId: SESSION_A,
      ownerDisplayName: "Alex",
      ownerColour: COLOUR,
      body: "first",
      leftPct: 40,
      topPct: 50,
    });
    assert.equal(first.ok, true);
    assert.ok(lastInsertPayload);
    assert.equal(
      Object.prototype.hasOwnProperty.call(lastInsertPayload, "created_at"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(lastInsertPayload, "expires_at"),
      false,
    );
    if (first.ok) {
      assert.equal(first.mark.createdAt, createdIso);
      assert.equal(first.mark.expiresAt, expiresIso);
      assert.equal(
        Date.parse(first.mark.expiresAt) - Date.parse(first.mark.createdAt),
        MARK_TTL_MS,
      );
    }

    const second = await createCanvasMark(supabase as never, {
      ownerSessionId: SESSION_A,
      ownerDisplayName: "Alex",
      ownerColour: COLOUR,
      body: "second",
      leftPct: 40,
      topPct: 50,
    });
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.error, "mark_exists");
      assert.equal(second.status, 409);
    }
  });

  it("loadActiveCanvasMarks filters expires_at > now", async () => {
    const { loadActiveCanvasMarks } = await import(
      "@/lib/social/marks-server"
    );
    const now = new Date("2026-08-13T12:00:00.000Z");
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  gt(_col: string, value: string) {
                    assert.equal(value, now.toISOString());
                    return {
                      order() {
                        return Promise.resolve({
                          data: [
                            {
                              id: "880e8400-e29b-41d4-a716-446655440000",
                              chain_id: 4663,
                              owner_session_id: SESSION_B,
                              owner_display_name: "Bob",
                              owner_colour: colourFromSessionId(SESSION_B),
                              body: "late join",
                              left_pct: 30,
                              top_pct: 40,
                              created_at: "2026-08-13T11:00:00.000Z",
                              expires_at: "2026-08-14T11:00:00.000Z",
                            },
                          ],
                          error: null,
                        });
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

    const result = await loadActiveCanvasMarks(supabase as never, now);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.marks.length, 1);
      assert.equal(result.marks[0]!.body, "late join");
    }
  });
});
