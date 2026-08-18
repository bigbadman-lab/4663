/**
 * TOKEN preview copy + error mapping.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenPreviewErrorMessage } from "@/lib/social/token-preview";

describe("TOKEN preview error copy", () => {
  it("Solana is not-enabled, not junk invalid", () => {
    assert.equal(
      tokenPreviewErrorMessage("solana_not_enabled"),
      "Solana tokens are not enabled yet.",
    );
  });

  it("URLs are directed to LINK", () => {
    assert.equal(tokenPreviewErrorMessage("url"), "Use LINK for URLs.");
  });

  it("EOA vs invalid address are distinct", () => {
    assert.equal(
      tokenPreviewErrorMessage("not_a_contract"),
      "That address is not a token contract.",
    );
    assert.equal(
      tokenPreviewErrorMessage("invalid_address"),
      "That is not a token address.",
    );
  });
});
