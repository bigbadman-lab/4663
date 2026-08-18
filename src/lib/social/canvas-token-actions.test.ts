/**
 * TOKEN named-participant gate — guests open ENTER, never the composer.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beginTokenIfNamed } from "@/lib/social/canvas-token-actions";

describe("TOKEN participation gate", () => {
  it("guest cannot enter TOKEN composer and invokes ENTER", () => {
    let entered = false;
    let opened = false;
    const result = beginTokenIfNamed({
      isNamedParticipant: false,
      onOpen: () => {
        opened = true;
      },
      requestEnter: () => {
        entered = true;
      },
    });
    assert.equal(result, "enter");
    assert.equal(entered, true);
    assert.equal(opened, false);
  });

  it("named participant can open TOKEN", () => {
    let entered = false;
    let opened = false;
    const result = beginTokenIfNamed({
      isNamedParticipant: true,
      onOpen: () => {
        opened = true;
      },
      requestEnter: () => {
        entered = true;
      },
    });
    assert.equal(result, "compose");
    assert.equal(opened, true);
    assert.equal(entered, false);
  });
});
