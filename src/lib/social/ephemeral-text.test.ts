/**
 * Social 2A — ephemeral TEXT helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEphemeralTextObject,
  EPHEMERAL_TEXT_MAX_LENGTH,
  normalizeEphemeralTextObject,
  normalizeEphemeralTextsPageData,
  playhtmlTextElementId,
  removeEphemeralText,
  removeEphemeralTextsByOwner,
  retainEphemeralTextsForPresentOwners,
  upsertEphemeralText,
  validateTextBody,
} from "@/lib/social/ephemeral-text";

const OWNER_A = "550e8400-e29b-41d4-a716-446655440000";
const OWNER_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const TEXT_A = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("Social 2A ephemeral text helpers", () => {
  it("rejects blank / whitespace-only bodies", () => {
    assert.equal(validateTextBody("").ok, false);
    assert.equal(validateTextBody("   ").ok, false);
  });

  it("accepts 200 chars and rejects more", () => {
    const exact = "a".repeat(EPHEMERAL_TEXT_MAX_LENGTH);
    assert.deepEqual(validateTextBody(exact), { ok: true, body: exact });
    assert.equal(
      validateTextBody("a".repeat(EPHEMERAL_TEXT_MAX_LENGTH + 1)).ok,
      false,
    );
  });

  it("publish creates stable text id from UUID", () => {
    const created = createEphemeralTextObject({
      body: "  hello from alex ",
      ownerSessionId: OWNER_A,
      leftPct: 40,
      topPct: 50,
      randomUUID: () => TEXT_A,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.text.textId, TEXT_A);
    assert.equal(created.text.body, "hello from alex");
    assert.equal(created.text.ownerSessionId, OWNER_A);
    assert.equal(playhtmlTextElementId(created.text.textId), `4663-text-${TEXT_A}`);
  });

  it("published body is fixed in object (no edit field)", () => {
    const created = createEphemeralTextObject({
      body: "fixed",
      ownerSessionId: OWNER_A,
      leftPct: 10,
      topPct: 20,
      randomUUID: () => TEXT_A,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.deepEqual(Object.keys(created.text).sort(), [
      "body",
      "createdAt",
      "leftPct",
      "ownerSessionId",
      "textId",
      "topPct",
    ]);
  });

  it("ignores malformed realtime/page payloads", () => {
    assert.equal(normalizeEphemeralTextObject(null), null);
    assert.equal(
      normalizeEphemeralTextObject({
        textId: "bad",
        ownerSessionId: OWNER_A,
        body: "hi",
        leftPct: 10,
        topPct: 10,
        createdAt: "2026-08-13T00:00:00.000Z",
      }),
      null,
    );
    assert.equal(
      normalizeEphemeralTextObject({
        textId: TEXT_A,
        ownerSessionId: OWNER_A,
        body: "<script>alert(1)</script>",
        leftPct: 10,
        topPct: 10,
        createdAt: "2026-08-13T00:00:00.000Z",
      })?.body,
      "<script>alert(1)</script>",
    );
    assert.deepEqual(normalizeEphemeralTextsPageData({ texts: [null, 1, {}] }), {
      texts: [],
    });
  });

  it("HTML-like text remains plain string content", () => {
    const created = createEphemeralTextObject({
      body: "<b>hi</b>",
      ownerSessionId: OWNER_A,
      leftPct: 10,
      topPct: 10,
      randomUUID: () => TEXT_A,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.text.body, "<b>hi</b>");
  });

  it("delete / leave / presence retain semantics", () => {
    const a = createEphemeralTextObject({
      body: "alex",
      ownerSessionId: OWNER_A,
      leftPct: 10,
      topPct: 10,
      randomUUID: () => TEXT_A,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    const bId = "8c9e6679-7425-40de-944b-e07fc1f90ae8";
    const b = createEphemeralTextObject({
      body: "bob",
      ownerSessionId: OWNER_B,
      leftPct: 20,
      topPct: 20,
      randomUUID: () => bId,
      now: () => new Date("2026-08-13T00:01:00.000Z"),
    });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;

    let data = upsertEphemeralText({ texts: [] }, a.text);
    data = upsertEphemeralText(data, b.text);
    assert.equal(data.texts.length, 2);

    data = removeEphemeralText(data, TEXT_A);
    assert.equal(data.texts.length, 1);
    assert.equal(data.texts[0]?.ownerSessionId, OWNER_B);

    data = upsertEphemeralText(data, a.text);
    data = removeEphemeralTextsByOwner(data, OWNER_A);
    assert.equal(data.texts.length, 1);
    assert.equal(data.texts[0]?.body, "bob");

    data = upsertEphemeralText(data, a.text);
    data = retainEphemeralTextsForPresentOwners(
      data,
      new Set([OWNER_B]),
    );
    assert.equal(data.texts.length, 1);
    assert.equal(data.texts[0]?.ownerSessionId, OWNER_B);

    // Another participant leaving does not remove my text
    data = upsertEphemeralText(data, a.text);
    data = retainEphemeralTextsForPresentOwners(
      data,
      new Set([OWNER_A]),
    );
    assert.equal(data.texts.length, 1);
    assert.equal(data.texts[0]?.ownerSessionId, OWNER_A);
  });

  it("late-join snapshot is the current page-data texts collection", () => {
    const created = createEphemeralTextObject({
      body: "already here",
      ownerSessionId: OWNER_A,
      leftPct: 33,
      topPct: 44,
      randomUUID: () => TEXT_A,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const room = upsertEphemeralText({ texts: [] }, created.text);
    const joined = normalizeEphemeralTextsPageData(room);
    assert.equal(joined.texts.length, 1);
    assert.equal(joined.texts[0]?.body, "already here");
  });
});
