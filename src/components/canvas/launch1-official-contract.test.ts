/**
 * LAUNCH1 — OFFICIAL CONTRACT chrome control.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("LAUNCH1 OFFICIAL CONTRACT UI", () => {
  it("13–15. hidden until active; below WHAT CAN YOU DO; chrome order", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("useOfficialToken"));
    assert.ok(chrome.includes("OfficialContractControl"));
    assert.ok(chrome.includes("officialToken?.active"));

    const block = chrome.slice(
      chrome.indexOf("data-4663-chrome-top-right"),
      chrome.indexOf("data-4663-chrome-presence"),
    );
    assert.ok(block.includes("CanvasToneControl"));
    assert.ok(block.includes("CanvasIntroTrigger"));
    assert.ok(block.includes("CanvasGuideTrigger"));
    assert.ok(block.includes("OfficialContractControl"));
    assert.ok(
      block.indexOf("CanvasGuideTrigger") <
        block.indexOf("OfficialContractControl"),
    );
  });

  it("16–18. not in world; not PlayHTML; not draggable", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.equal(surface.includes("OfficialContractControl"), false);
    assert.equal(surface.includes("useOfficialToken"), false);

    const control = readSrc(
      "src/components/canvas/official-contract-control.tsx",
    );
    assert.equal(control.includes("CanMoveElement"), false);
    assert.equal(control.includes("@playhtml/react"), false);
    assert.ok(control.includes("pointer") || control.includes("onClick"));
    assert.ok(control.includes("stopPlayhtmlMoveStart"));
    assert.ok(control.includes("useInteractiveControlProtection"));
  });

  it("19–22. copy full address; COPIED feedback; no false COPIED", () => {
    const control = readSrc(
      "src/components/canvas/official-contract-control.tsx",
    );
    assert.ok(control.includes("copyTextQuiet(contractAddress)"));
    assert.ok(control.includes("[ OFFICIAL CONTRACT ]"));
    assert.ok(control.includes("[ COPIED ]"));
    assert.ok(control.includes("if (!ok) return"));
    assert.ok(control.includes("OFFICIAL_CONTRACT_COPIED_MS"));
    assert.ok(
      control.includes('aria-label="Copy official 4663 token contract"'),
    );
  });

  it("23–24. no camera mutation; WHAT IS THIS / WHAT CAN YOU DO unchanged", () => {
    const control = readSrc(
      "src/components/canvas/official-contract-control.tsx",
    );
    assert.equal(control.includes("homeCamera"), false);
    assert.equal(control.includes("setData"), false);

    const intro = readSrc("src/components/canvas/canvas-intro-trigger.tsx");
    assert.ok(intro.includes("[ WHAT IS THIS? ]"));
    const guide = readSrc("src/components/canvas/canvas-guide-trigger.tsx");
    assert.ok(guide.includes("[ WHAT CAN YOU DO? ]"));

    const hook = readSrc("src/components/canvas/use-official-token.ts");
    assert.ok(hook.includes("/api/token/official"));
    assert.ok(hook.includes("OFFICIAL_TOKEN_POLL_INACTIVE_MS"));
    assert.ok(hook.includes("stop polling") || hook.includes("immutable"));
  });

  it("polling + package scripts present", () => {
    const pkg = JSON.parse(readSrc("package.json")) as {
      scripts: Record<string, string>;
    };
    assert.ok(pkg.scripts["launch:activate-4663"]);
    assert.ok(pkg.scripts["launch:check-4663"]);
    assert.ok(
      readSrc("scripts/activate-4663.ts").includes("--contract"),
    );
    assert.ok(
      readSrc("scripts/activate-4663.ts").includes("getCode"),
    );
  });
});
