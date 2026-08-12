/**
 * Social 1D — session cleanup registry.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SessionCleanupRegistry,
  type SessionEndedContext,
} from "@/lib/social/session-cleanup";

describe("Social 1D session cleanup registry", () => {
  it("notifies registered handlers on session ended only", () => {
    const registry = new SessionCleanupRegistry();
    const seen: SessionEndedContext[] = [];
    const unregister = registry.register((ctx) => {
      seen.push(ctx);
    });

    assert.equal(registry.size(), 1);
    assert.equal(seen.length, 0);

    registry.notify({
      reason: "leave",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.reason, "leave");
    assert.equal(
      seen[0]?.sessionId,
      "550e8400-e29b-41d4-a716-446655440000",
    );

    unregister();
    assert.equal(registry.size(), 0);
    registry.notify({
      reason: "leave",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.equal(seen.length, 1);
  });

  it("does not invent handlers on construction", () => {
    const registry = new SessionCleanupRegistry();
    assert.equal(registry.size(), 0);
  });
});
