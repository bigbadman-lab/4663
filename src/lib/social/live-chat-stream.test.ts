/**
 * Live chat Realtime stream controller.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colourFromSessionId } from "@/lib/social/colour";
import type { ChatMessage } from "@/lib/social/chat-message";
import type {
  ChatRealtimeClient,
  ChatRealtimeStatus,
} from "@/lib/social/chat-realtime";
import {
  LiveChatStreamController,
  LIVE_CHAT_FETCH_RETRY_MS,
} from "@/lib/social/live-chat-stream";

const SESSION = "550e8400-e29b-41d4-a716-446655440000";
const COLOUR = colourFromSessionId(SESSION);

function msg(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, "id">,
): ChatMessage {
  return {
    ownerSessionId: SESSION,
    displayName: "Alex",
    colour: COLOUR,
    body: "hello",
    createdAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "660e8400-e29b-41d4-a716-446655440000",
    owner_session_id: SESSION,
    display_name: "Alex",
    colour: COLOUR,
    body: "hello",
    created_at: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("LiveChatStreamController", () => {
  it("loads history on SUBSCRIBED; appends INSERT; ignores duplicate id", async () => {
    let onInsert: ((row: unknown) => void) | null = null;
    let onStatus: ((status: ChatRealtimeStatus) => void) | null = null;
    let unsubscribed = false;
    const realtime: ChatRealtimeClient = {
      subscribeInserts(handlers) {
        onInsert = handlers.onInsert;
        onStatus = handlers.onStatus;
        return {
          unsubscribe: () => {
            unsubscribed = true;
          },
        };
      },
    };

    const snapshots: ChatMessage[][] = [];
    const statuses: string[] = [];
    let fetchCount = 0;

    const controller = new LiveChatStreamController({
      realtime,
      fetchRecent: async () => {
        fetchCount += 1;
        return [
          msg({
            id: "660e8400-e29b-41d4-a716-446655440000",
            createdAt: "2026-08-14T00:00:00.000Z",
          }),
        ];
      },
      onMessages: (next) => snapshots.push([...next]),
      onStatus: (s) => statuses.push(s),
    });

    controller.start();
    assert.deepEqual(statuses, ["connecting"]);
    onStatus!("SUBSCRIBED");
    await Promise.resolve();
    await Promise.resolve();

    assert.ok(fetchCount >= 1);
    assert.equal(snapshots.at(-1)?.length, 1);

    onInsert!(
      dbRow({
        id: "660e8400-e29b-41d4-a716-446655440001",
        body: "second",
        created_at: "2026-08-14T00:00:01.000Z",
      }),
    );
    assert.equal(snapshots.at(-1)?.length, 2);
    assert.deepEqual(
      snapshots.at(-1)?.map((m) => m.body),
      ["hello", "second"],
    );

    // duplicate id ignored
    onInsert!(
      dbRow({
        id: "660e8400-e29b-41d4-a716-446655440001",
        body: "second-dup",
        created_at: "2026-08-14T00:00:01.000Z",
      }),
    );
    assert.equal(snapshots.at(-1)?.length, 2);
    assert.equal(snapshots.at(-1)?.[1]?.body, "second");

    controller.stop();
    assert.equal(unsubscribed, true);
  });

  it("reconnect SUBSCRIBED refetches; CLOSED goes connecting", async () => {
    let onStatus: ((status: ChatRealtimeStatus) => void) | null = null;
    let fetchCount = 0;
    const realtime: ChatRealtimeClient = {
      subscribeInserts(handlers) {
        onStatus = handlers.onStatus;
        return { unsubscribe: () => {} };
      },
    };

    const statuses: string[] = [];
    const controller = new LiveChatStreamController({
      realtime,
      fetchRecent: async () => {
        fetchCount += 1;
        return [];
      },
      onMessages: () => {},
      onStatus: (s) => statuses.push(s),
    });

    controller.start();
    onStatus!("SUBSCRIBED");
    await Promise.resolve();
    await Promise.resolve();
    const afterFirst = fetchCount;

    onStatus!("CLOSED");
    assert.ok(statuses.includes("connecting"));

    onStatus!("SUBSCRIBED");
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(fetchCount > afterFirst);
    assert.ok(LIVE_CHAT_FETCH_RETRY_MS > 0);

    controller.stop();
  });
});
