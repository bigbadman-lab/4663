/**
 * LINK named-participant gate — guests open ENTER, never the composer.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beginLinkIfNamed } from "@/lib/social/canvas-link-actions";

describe("LINK participation gate", () => {
  it("guest cannot enter LINK composer and invokes ENTER", () => {
    let entered = false;
    let opened = false;
    const result = beginLinkIfNamed({
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

  it("named participant can open LINK", () => {
    let entered = false;
    let opened = false;
    const result = beginLinkIfNamed({
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
