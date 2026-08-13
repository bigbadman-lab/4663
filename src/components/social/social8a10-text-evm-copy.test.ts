/**
 * Stage 8A.10 — EVM addresses inside published user TEXT are copyable
 * via the existing PONS address control.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatShortAddress,
  isEvmAddress,
  splitTextWithEvmAddresses,
} from "@/lib/canvas/format-address";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const ADDR = "0x1234567890123456789012345678901234567890";
const ADDR_B = "0xabcdefABCDEF0123456789abcdefABCDEF012345";
const TX =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

describe("Stage 8A.10 user TEXT EVM address copy", () => {
  it("1. plain TEXT remains a single text segment", () => {
    assert.deepEqual(splitTextWithEvmAddresses("hello canvas"), [
      { type: "text", value: "hello canvas" },
    ]);
    assert.deepEqual(splitTextWithEvmAddresses(""), [
      { type: "text", value: "" },
    ]);
  });

  it("2–3. one valid address / mixed prose splits correctly", () => {
    assert.equal(isEvmAddress(ADDR), true);
    assert.deepEqual(splitTextWithEvmAddresses(`check ${ADDR}`), [
      { type: "text", value: "check " },
      { type: "address", value: ADDR },
    ]);
    assert.deepEqual(
      splitTextWithEvmAddresses(`hi ${ADDR} please`),
      [
        { type: "text", value: "hi " },
        { type: "address", value: ADDR },
        { type: "text", value: " please" },
      ],
    );
  });

  it("4. multiple addresses are independent segments", () => {
    const segments = splitTextWithEvmAddresses(`${ADDR} and ${ADDR_B}`);
    assert.deepEqual(segments, [
      { type: "address", value: ADDR },
      { type: "text", value: " and " },
      { type: "address", value: ADDR_B },
    ]);
  });

  it("5–6. invalid address and tx hash stay plain text", () => {
    assert.equal(isEvmAddress("0x1234"), false);
    assert.equal(isEvmAddress(TX), false);
    assert.deepEqual(splitTextWithEvmAddresses("see 0x1234 later"), [
      { type: "text", value: "see 0x1234 later" },
    ]);
    assert.deepEqual(splitTextWithEvmAddresses(`tx ${TX}`), [
      { type: "text", value: `tx ${TX}` },
    ]);
    // Leading 40 hex of a 64-char hash must not be carved out.
    assert.equal(
      splitTextWithEvmAddresses(TX).every((s) => s.type === "text"),
      true,
    );
  });

  it("7. TEXT object reuses PonsAddressCopyControl + clipboard helper", () => {
    const object = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(object.includes("PonsAddressCopyControl"));
    assert.ok(object.includes('variant="inline"'));
    assert.ok(object.includes("copyTextQuiet"));
    assert.ok(object.includes("splitTextWithEvmAddresses"));
    assert.equal(object.includes("formatShortAddress"), false); // via control
    assert.equal(
      formatShortAddress(ADDR),
      "0x1234…7890",
    );

    const control = readSrc(
      "src/components/canvas/pons-address-copy-control.tsx",
    );
    assert.ok(control.includes('variant?: "block" | "inline"'));
    assert.ok(control.includes("data-4663-event-address"));
    assert.ok(control.includes("data-4663-copy-glyph"));
  });

  it("8–10. address click stops move/pan; TEXT stays movable; touch-safe", () => {
    const object = readSrc("src/components/social/ephemeral-text-object.tsx");
    assert.ok(object.includes("stopMoveStart"));
    assert.ok(object.includes("CanMoveElement"));
    assert.ok(object.includes("touch-manipulation"));
    assert.ok(object.includes("pointer-events-auto"));
    assert.ok(object.includes("stopPropagation"));

    const control = readSrc(
      "src/components/canvas/pons-address-copy-control.tsx",
    );
    assert.ok(control.includes("onPointerDown={stopMoveStart}"));
    assert.ok(control.includes("onTouchStart={stopMoveStart}"));
    assert.ok(control.includes("event.stopPropagation()"));
  });

  it("11. no page-data / shared-state changes; PONS path unchanged", () => {
    const textLib = readSrc("src/lib/social/ephemeral-text.ts");
    assert.ok(textLib.includes("EPHEMERAL_TEXTS_PAGE_DATA_NAME"));
    assert.equal(textLib.includes("splitTextWithEvmAddresses"), false);
    assert.equal(textLib.includes("PonsAddressCopyControl"), false);

    const pons = readSrc(
      "src/components/canvas/pons-buying-activity-object.tsx",
    );
    assert.ok(pons.includes("PonsAddressCopyControl"));
    assert.equal(pons.includes('variant="inline"'), false);
    assert.ok(pons.includes("copyTextQuiet(event.tokenAddress)"));
  });
});
