/**
 * RADAR modal scroll stability — poll refresh must not jump to top.
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

describe("RADAR modal scroll stability", () => {
  it("focus runs once on mount with preventScroll — not on onClose identity churn", () => {
    const panel = readSrc("src/components/canvas/pons-monitoring-panel.tsx");

    assert.ok(
      panel.includes("focus({ preventScroll: true })"),
      "open focus must use preventScroll so CLOSE focus cannot scroll dialog",
    );
    assert.ok(
      panel.includes("onCloseRef"),
      "Escape must read latest onClose via ref",
    );
    // Focus CLOSE once portal exists — depends on mounted only.
    const focusOnMounted = panel.slice(
      panel.indexOf("// Focus CLOSE once the dialog portal exists"),
      panel.indexOf("if (!mounted) return null;"),
    );
    assert.ok(
      focusOnMounted.includes(
        "closeRef.current?.focus({ preventScroll: true })",
      ),
    );
    assert.ok(focusOnMounted.includes("}, [mounted]);"));
    assert.equal(focusOnMounted.includes("onClose"), false);
  });

  it("parent passes stable closePanel — not an inline onClose arrow", () => {
    const monitoring = readSrc(
      "src/components/canvas/pons-monitoring-object.tsx",
    );
    assert.ok(monitoring.includes("closePanel"));
    assert.ok(monitoring.includes("onClose={closePanel}"));
    assert.equal(
      monitoring.includes("onClose={() => setOpen(false)}"),
      false,
    );
    assert.equal(monitoring.includes("onClose={() =>"), false);
  });

  it("scroll container is not keyed by poll payload / generatedAt", () => {
    const panel = readSrc("src/components/canvas/pons-monitoring-panel.tsx");
    assert.equal(panel.includes("key={generatedAt"), false);
    assert.equal(panel.includes("key={`${generatedAt"), false);
    assert.ok(panel.includes("data-4663-pons-monitoring-panel"));
    // Detail remount on deliberate token change is intentional (starts at top).
    assert.ok(panel.includes("key={selectedToken}"));
  });

  it("panel mounts only while open — close/reopen is a fresh instance at top", () => {
    const monitoring = readSrc(
      "src/components/canvas/pons-monitoring-object.tsx",
    );
    assert.ok(monitoring.includes("{open ? ("));
    assert.ok(monitoring.includes("<PonsMonitoringPanel"));
    assert.ok(monitoring.includes(") : null}"));
  });

  it("watchlist poll still updates tokens without remounting panel host", () => {
    const hook = readSrc(
      "src/components/canvas/use-continuation-watchlist.ts",
    );
    assert.ok(hook.includes("CONTINUATION_WATCHLIST_POLL_MS"));
    assert.ok(hook.includes("45_000"));
    assert.ok(hook.includes("startVisibilityIntervalPolling"));

    const monitoring = readSrc(
      "src/components/canvas/pons-monitoring-object.tsx",
    );
    // tokens prop may change; panel element itself has no refresh key.
    assert.ok(monitoring.includes("tokens={tokens}"));
    assert.equal(monitoring.includes("key={tokens"), false);
    assert.equal(monitoring.includes("key={generatedAt"), false);
  });
});
