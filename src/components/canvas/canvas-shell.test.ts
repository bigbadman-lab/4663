/**
 * Stage 10A — structural ownership tests for canvas shell.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage 10A canvas ownership", () => {
  it("1. canvas root owns usePublicEvents() once", () => {
    const source = readSrc("src/components/canvas/canvas-root.tsx");
    const calls = source.match(/usePublicEvents\(\)/g) ?? [];
    assert.equal(calls.length, 1);
    assert.ok(source.includes('from "@/lib/events/use-public-events"'));
    assert.match(source, /CanvasChrome/);
    assert.match(source, /CanvasSurface/);
  });

  it("2. layout no longer mounts PublicEventsStream", () => {
    const layout = readSrc("src/app/layout.tsx");
    assert.equal(layout.includes("PublicEventsStream"), false);
    assert.equal(layout.includes("public-events-stream"), false);
  });

  it("3. PresenceHeartbeat remains mounted once", () => {
    const layout = readSrc("src/app/layout.tsx");
    const mounts = layout.match(/<PresenceHeartbeat\s*\/>/g) ?? [];
    assert.equal(mounts.length, 1);
  });

  it("4. visible PresenceStatus exists inside canvas chrome", () => {
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.match(chrome, /PresenceStatus/);
    assert.match(chrome, /4663/);
    assert.match(chrome, /live intelligence for robinhood chain/);
  });

  it("5. canvas surface exists even with zero events", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.match(surface, /data-4663-canvas-surface/);
    assert.equal(surface.includes("usePublicEvents"), false);
    assert.equal(surface.includes("events.map"), false);
  });

  it("6. no event objects are rendered in 10A", () => {
    const rootSource = readSrc("src/components/canvas/canvas-root.tsx");
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    const page = readSrc("src/app/page.tsx");
    for (const source of [rootSource, chrome, surface, page]) {
      assert.equal(source.includes("tokenAddress"), false);
      assert.equal(source.includes("newBuyers"), false);
      assert.equal(source.includes("pons_buying_activity"), false);
      assert.equal(source.includes("PonsBuying"), false);
    }
    // Root may call the hook but must not render events array
    assert.equal(rootSource.includes("events.map"), false);
    assert.equal(rootSource.includes(".events"), false);
  });

  it("7. no duplicate event subscription owner exists", () => {
    const layout = readSrc("src/app/layout.tsx");
    const page = readSrc("src/app/page.tsx");
    const rootSource = readSrc("src/components/canvas/canvas-root.tsx");
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");

    const owners = [layout, page, rootSource, chrome, surface].filter((s) =>
      s.includes("usePublicEvents"),
    );
    assert.equal(owners.length, 1);
    assert.equal(owners[0], rootSource);

    // Dead null-island component must be gone
    assert.throws(() => readSrc("src/components/public-events-stream.tsx"));
  });
});
