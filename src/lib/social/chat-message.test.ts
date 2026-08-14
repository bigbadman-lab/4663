/**
 * Live chat — validation, merge, rate limit, server helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colourFromSessionId } from "@/lib/social/colour";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGE_TTL_MS,
  CHAT_MESSAGES_GET_LIMIT,
  chatExpiresAtFromCreated,
  chatMessageFromRow,
  mergeChatMessages,
  normalizeChatMessage,
  parseCreateChatInput,
  upsertChatMessage,
  validateChatBody,
  type ChatMessage,
} from "@/lib/social/chat-message";
import {
  createChatMessage,
  evaluateChatRateLimit,
  loadRecentChatMessages,
} from "@/lib/social/chat-server";

const SESSION_A = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_B = "550e8400-e29b-41d4-a716-446655440001";
const COLOUR_A = colourFromSessionId(SESSION_A);
const COLOUR_B = colourFromSessionId(SESSION_B);

function sampleMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "660e8400-e29b-41d4-a716-446655440000",
    ownerSessionId: SESSION_A,
    displayName: "Alex",
    colour: COLOUR_A,
    body: "anyone watching?",
    createdAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("Live chat validation", () => {
  it("body: trim, nonempty, 200 ok, >200 rejected, blank rejected", () => {
    assert.deepEqual(validateChatBody("  hello  "), {
      ok: true,
      body: "hello",
    });
    assert.equal(validateChatBody("x".repeat(CHAT_MESSAGE_MAX_LENGTH)).ok, true);
    assert.equal(
      validateChatBody("x".repeat(CHAT_MESSAGE_MAX_LENGTH + 1)).ok,
      false,
    );
    assert.equal(validateChatBody("   ").ok, false);
    assert.equal(validateChatBody("").ok, false);
    assert.equal(validateChatBody(null).ok, false);
  });

  it("parseCreateChatInput rejects bad session / name / colour / body", () => {
    assert.equal(
      parseCreateChatInput({
        sessionId: "not-a-uuid",
        displayName: "Alex",
        colour: COLOUR_A,
        body: "hi",
      }).ok,
      false,
    );
    assert.equal(
      parseCreateChatInput({
        sessionId: SESSION_A,
        displayName: "",
        colour: COLOUR_A,
        body: "hi",
      }).ok,
      false,
    );
    assert.equal(
      parseCreateChatInput({
        sessionId: SESSION_A,
        displayName: "Alex",
        colour: "#ffffff",
        body: "hi",
      }).ok,
      false,
    );
    assert.equal(
      parseCreateChatInput({
        sessionId: SESSION_A,
        displayName: "Alex",
        colour: COLOUR_B,
        body: "hi",
      }).ok,
      false,
    );
    assert.equal(
      parseCreateChatInput({
        sessionId: SESSION_A,
        displayName: "Alex",
        colour: COLOUR_A,
        body: "   ",
      }).ok,
      false,
    );
    const ok = parseCreateChatInput({
      sessionId: SESSION_A,
      displayName: "  Alex  ",
      colour: COLOUR_A,
      body: "  hi  ",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.displayName, "Alex");
      assert.equal(ok.body, "hi");
      assert.equal(ok.sessionId, SESSION_A);
    }
  });

  it("expiresAt is exactly 24h after createdAt", () => {
    const created = new Date("2026-08-14T00:00:00.000Z");
    const expires = chatExpiresAtFromCreated(created);
    assert.equal(expires.getTime() - created.getTime(), CHAT_MESSAGE_TTL_MS);
  });

  it("normalize / row mapping; merge dedupes and orders chronologically", () => {
    const a = sampleMessage({
      id: "770e8400-e29b-41d4-a716-446655440001",
      createdAt: "2026-08-14T00:01:00.000Z",
    });
    const b = sampleMessage({
      id: "770e8400-e29b-41d4-a716-446655440002",
      createdAt: "2026-08-14T00:00:00.000Z",
      ownerSessionId: SESSION_B,
      colour: COLOUR_B,
      displayName: "Mia",
    });
    const merged = mergeChatMessages([a], [b, a]);
    assert.deepEqual(
      merged.map((m) => m.id),
      [b.id, a.id],
    );

    const fromRow = chatMessageFromRow({
      id: a.id,
      owner_session_id: a.ownerSessionId,
      display_name: a.displayName,
      colour: a.colour,
      body: a.body,
      created_at: a.createdAt,
    });
    assert.deepEqual(fromRow, a);
    assert.equal(normalizeChatMessage({ ...a, body: "" }), null);
  });

  it("upsert caps at GET limit", () => {
    let messages: ChatMessage[] = [];
    for (let i = 0; i < CHAT_MESSAGES_GET_LIMIT + 5; i += 1) {
      const id = `880e8400-e29b-41d4-a716-44665544${String(i).padStart(4, "0")}`;
      messages = upsertChatMessage(
        messages,
        sampleMessage({
          id,
          createdAt: new Date(Date.UTC(2026, 7, 14, 0, 0, i)).toISOString(),
        }),
      );
    }
    assert.equal(messages.length, CHAT_MESSAGES_GET_LIMIT);
  });
});

describe("Live chat rate limit", () => {
  it("allows first send; rejects under 2s interval", () => {
    const now = Date.parse("2026-08-14T12:00:05.000Z");
    assert.equal(evaluateChatRateLimit([], now).ok, true);
    assert.equal(
      evaluateChatRateLimit(["2026-08-14T12:00:04.000Z"], now).ok,
      false,
    );
    assert.equal(
      evaluateChatRateLimit(["2026-08-14T12:00:02.000Z"], now).ok,
      true,
    );
  });

  it("burst: 5 in 15s window rejects sixth", () => {
    const now = Date.parse("2026-08-14T12:00:20.000Z");
    const recent = [
      "2026-08-14T12:00:18.000Z",
      "2026-08-14T12:00:15.000Z",
      "2026-08-14T12:00:12.000Z",
      "2026-08-14T12:00:09.000Z",
      "2026-08-14T12:00:06.000Z",
    ];
    assert.equal(evaluateChatRateLimit(recent, now).ok, false);
    assert.equal(evaluateChatRateLimit(recent.slice(1), now).ok, true);
  });
});

describe("Live chat server create / load", () => {
  it("inserts with 24h expires_at and returns public message", async () => {
    const now = new Date("2026-08-14T01:00:00.000Z");
    let lastInsert: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        assert.equal(table, "chat_messages");
        return {
          select() {
            return {
              eq() {
                return this;
              },
              gte() {
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            lastInsert = payload;
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: "990e8400-e29b-41d4-a716-446655440000",
                        chain_id: 4663,
                        owner_session_id: SESSION_A,
                        display_name: "Alex",
                        colour: COLOUR_A,
                        body: "hello",
                        created_at: now.toISOString(),
                        expires_at: new Date(
                          now.getTime() + CHAT_MESSAGE_TTL_MS,
                        ).toISOString(),
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

    const result = await createChatMessage(
      supabase as never,
      {
        sessionId: SESSION_A,
        displayName: "Alex",
        colour: COLOUR_A,
        body: "hello",
      },
      now,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.message.body, "hello");
      assert.equal(result.status, 201);
    }
    assert.ok(lastInsert);
    assert.equal(
      (lastInsert as Record<string, unknown>).expires_at,
      new Date(now.getTime() + CHAT_MESSAGE_TTL_MS).toISOString(),
    );
  });

  it("rate limit returns 429 before insert", async () => {
    let insertCalled = false;
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              gte() {
                return this;
              },
              order() {
                return this;
              },
              async limit() {
                return {
                  data: [{ created_at: "2026-08-14T01:00:00.500Z" }],
                  error: null,
                };
              },
            };
          },
          insert() {
            insertCalled = true;
            return {
              select() {
                return {
                  async single() {
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    const result = await createChatMessage(
      supabase as never,
      {
        sessionId: SESSION_A,
        displayName: "Alex",
        colour: COLOUR_A,
        body: "too fast",
      },
      new Date("2026-08-14T01:00:01.000Z"),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "rate_limited");
      assert.equal(result.status, 429);
    }
    assert.equal(insertCalled, false);
  });

  it("GET load excludes expired and returns oldest→newest capped", async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 3; i += 1) {
      rows.push({
        id: `aa0e8400-e29b-41d4-a716-44665544000${i}`,
        chain_id: 4663,
        owner_session_id: SESSION_A,
        display_name: "Alex",
        colour: COLOUR_A,
        body: `m${i}`,
        created_at: new Date(
          Date.UTC(2026, 7, 14, 0, 0, 10 - i),
        ).toISOString(),
        expires_at: "2026-08-15T00:00:00.000Z",
      });
    }

    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              gt() {
                return this;
              },
              order() {
                return this;
              },
              async limit(n: number) {
                assert.equal(n, CHAT_MESSAGES_GET_LIMIT);
                // newest first as DB would return
                return { data: rows, error: null };
              },
            };
          },
        };
      },
    };

    const result = await loadRecentChatMessages(
      supabase as never,
      new Date("2026-08-14T12:00:00.000Z"),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(
        result.messages.map((m) => m.body),
        ["m2", "m1", "m0"],
      );
    }
  });
});
