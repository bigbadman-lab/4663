/**
 * Social 2B — live TEXT draft helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTextDraft,
  createTextDraftId,
  createThrottledSender,
  draftsForRemoteView,
  normalizeTextDraft,
  normalizeTextDraftCleared,
  pruneStaleTextDrafts,
  removeTextDraft,
  removeTextDraftsByOwner,
  retainTextDraftsForPresentOwners,
  TEXT_DRAFT_STALE_MS,
  TEXT_DRAFT_THROTTLE_MS,
  upsertTextDraft,
  EPHEMERAL_TEXT_MAX_LENGTH,
} from "@/lib/social/text-draft";
import {
  SOCIAL_BROADCAST_CHANNEL_NAME,
  TEXT_DRAFT_CLEARED_EVENT,
  TEXT_DRAFT_UPDATED_EVENT,
} from "@/lib/social/text-draft";

const OWNER_A = "550e8400-e29b-41d4-a716-446655440000";
const OWNER_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const DRAFT_A = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("Social 2B text draft helpers", () => {
  it("creates draft ids and builds drafts", () => {
    assert.equal(createTextDraftId(() => DRAFT_A), DRAFT_A);
    const draft = buildTextDraft({
      draftId: DRAFT_A,
      ownerSessionId: OWNER_A,
      body: "hello",
      leftPct: 40,
      topPct: 50,
      now: () => new Date("2026-08-13T01:00:00.000Z"),
    });
    assert.equal(draft?.body, "hello");
    assert.equal(draft?.draftId, DRAFT_A);
  });

  it("enforces max 200 on normalize; ignores malformed", () => {
    assert.equal(
      normalizeTextDraft({
        draftId: DRAFT_A,
        ownerSessionId: OWNER_A,
        body: "a".repeat(EPHEMERAL_TEXT_MAX_LENGTH + 1),
        leftPct: 10,
        topPct: 10,
        updatedAt: "2026-08-13T01:00:00.000Z",
      }),
      null,
    );
    assert.equal(normalizeTextDraft({ draftId: "bad" }), null);
    assert.equal(
      normalizeTextDraftCleared({
        draftId: DRAFT_A,
        ownerSessionId: OWNER_A,
      })?.draftId,
      DRAFT_A,
    );
  });

  it("upsert replaces per owner; remote view suppresses self", () => {
    const a = buildTextDraft({
      draftId: DRAFT_A,
      ownerSessionId: OWNER_A,
      body: "hi",
      leftPct: 1,
      topPct: 2,
      now: () => new Date("2026-08-13T01:00:00.000Z"),
    })!;
    const b = buildTextDraft({
      draftId: "8c9e6679-7425-40de-944b-e07fc1f90ae8",
      ownerSessionId: OWNER_B,
      body: "yo",
      leftPct: 3,
      topPct: 4,
      now: () => new Date("2026-08-13T01:00:00.000Z"),
    })!;
    let list = upsertTextDraft([], a);
    list = upsertTextDraft(list, b);
    assert.equal(list.length, 2);
    assert.equal(draftsForRemoteView(list, OWNER_A).length, 1);
    assert.equal(draftsForRemoteView(list, OWNER_A)[0]?.ownerSessionId, OWNER_B);

    list = removeTextDraftsByOwner(list, OWNER_A);
    assert.equal(list.length, 1);
    list = retainTextDraftsForPresentOwners(list, new Set([OWNER_B]));
    assert.equal(list.length, 1);
    list = removeTextDraft(list, b.draftId);
    assert.equal(list.length, 0);
  });

  it("throttle sends leading + trailing latest value", () => {
    const sent: string[] = [];
    let now = 1_000;
    const timers = new Map<unknown, () => void>();
    let nextId = 1;
    const originalNow = Date.now;
    Date.now = () => now;

    const sender = createThrottledSender<string>(
      (v) => {
        sent.push(v);
      },
      100,
      {
        setTimeoutFn: (handler) => {
          const id = nextId++;
          timers.set(id, handler);
          return id;
        },
        clearTimeoutFn: (id) => {
          timers.delete(id);
        },
      },
    );

    try {
      sender.push("a");
      assert.deepEqual(sent, ["a"]);

      sender.push("ab");
      sender.push("abc");
      assert.deepEqual(sent, ["a"]);
      now = 1_100;
      for (const fn of [...timers.values()]) fn();
      timers.clear();
      assert.deepEqual(sent, ["a", "abc"]);

      now = 1_250;
      sender.push("x");
      assert.deepEqual(sent, ["a", "abc", "x"]);
      sender.push("xy");
      sender.flush();
      assert.deepEqual(sent, ["a", "abc", "x", "xy"]);

      now = 1_400;
      sender.push("z");
      sender.push("zz");
      sender.cancel();
      assert.deepEqual(sent, ["a", "abc", "x", "xy", "z"]);
    } finally {
      Date.now = originalNow;
    }

    assert.equal(TEXT_DRAFT_THROTTLE_MS, 100);
  });

  it("prunes stale drafts", () => {
    const fresh = buildTextDraft({
      draftId: DRAFT_A,
      ownerSessionId: OWNER_A,
      body: "hi",
      leftPct: 1,
      topPct: 1,
      now: () => new Date(1_000_000),
    })!;
    const stale = {
      ...fresh,
      draftId: "8c9e6679-7425-40de-944b-e07fc1f90ae8",
      updatedAt: new Date(1_000_000 - TEXT_DRAFT_STALE_MS - 1).toISOString(),
    };
    const next = pruneStaleTextDrafts([fresh, stale], 1_000_000);
    assert.equal(next.length, 1);
    assert.equal(next[0]?.draftId, DRAFT_A);
  });

  it("channel event names are stable", () => {
    assert.equal(SOCIAL_BROADCAST_CHANNEL_NAME, "4663-social-broadcast");
    assert.equal(TEXT_DRAFT_UPDATED_EVENT, "text-draft-updated");
    assert.equal(TEXT_DRAFT_CLEARED_EVENT, "text-draft-cleared");
  });
});
