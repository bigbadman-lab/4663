/**
 * Social 1B — display name validation tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISPLAY_NAME_MAX_LENGTH,
  validateDisplayName,
} from "@/lib/social/display-name";

describe("Social 1B display name", () => {
  it("trims whitespace and accepts human-readable names", () => {
    const result = validateDisplayName("  Alex  ");
    assert.deepEqual(result, { ok: true, name: "Alex" });
  });

  it("rejects empty / whitespace-only names", () => {
    assert.equal(validateDisplayName("").ok, false);
    assert.equal(validateDisplayName("   ").ok, false);
    assert.equal(validateDisplayName(null).ok, false);
  });

  it("rejects over-limit names", () => {
    const tooLong = "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1);
    const result = validateDisplayName(tooLong);
    assert.equal(result.ok, false);
  });

  it("accepts max-length names", () => {
    const exact = "a".repeat(DISPLAY_NAME_MAX_LENGTH);
    assert.deepEqual(validateDisplayName(exact), { ok: true, name: exact });
  });

  it("rejects control characters", () => {
    assert.equal(validateDisplayName("Alex\u0000").ok, false);
    assert.equal(validateDisplayName("Alex\nBob").ok, false);
    assert.equal(validateDisplayName("Hi\tthere").ok, false);
  });

  it("does not silently mutate beyond trim", () => {
    const result = validateDisplayName("  Café-4663  ");
    assert.deepEqual(result, { ok: true, name: "Café-4663" });
  });
});
