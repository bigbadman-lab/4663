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
    assert.match(source, /CanvasPlayTree/);
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
    assert.equal(chrome.includes("the live canvas for robinhood chain"), false);
  });

  it("5. canvas surface exists even with zero events", () => {
    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.match(surface, /data-4663-canvas-surface/);
    assert.equal(surface.includes("usePublicEvents"), false);
  });

  it("6. live objects render only via LiveEventLayer from CanvasRoot stream", () => {
    const rootSource = readSrc("src/components/canvas/canvas-root.tsx");
    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    const page = readSrc("src/app/page.tsx");
    assert.ok(rootSource.includes("selectVisibleLiveEvents"));
    assert.ok(rootSource.includes("assignSlots"));
    assert.equal(chrome.includes("PonsBuyingActivityObject"), false);
    assert.equal(page.includes("usePublicEvents"), false);
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

    assert.throws(() => readSrc("src/components/public-events-stream.tsx"));
  });
});
