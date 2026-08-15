/**
 * Idempotent PlayHTML deep-observer registry protocol tests.
 * Locks the semantics mirrored by the playhtml patch-package patch.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  bindDeepObserverIdempotent,
  playhtmlObserverKey,
  unbindDeepObserverIdempotent,
  type DeepObserver,
  type ObserverRegistry,
  type YDeepObservable,
} from "@/lib/canvas/playhtml-observer-registry";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function mockYType(): YDeepObservable & {
  observers: DeepObserver[];
  observeCalls: DeepObserver[];
  unobserveCalls: DeepObserver[];
} {
  const observers: DeepObserver[] = [];
  const observeCalls: DeepObserver[] = [];
  const unobserveCalls: DeepObserver[] = [];
  return {
    observers,
    observeCalls,
    unobserveCalls,
    observeDeep(fn) {
      observeCalls.push(fn);
      observers.push(fn);
    },
    unobserveDeep(fn) {
      unobserveCalls.push(fn);
      const idx = observers.indexOf(fn);
      if (idx === -1) {
        throw new Error(
          "[yjs] Tried to remove event handler that doesn't exist.",
        );
      }
      observers.splice(idx, 1);
    },
  };
}

describe("playhtml observer registry protocol", () => {
  it("1. setup → teardown calls unobserveDeep exactly once", () => {
    const registry: ObserverRegistry = new Map();
    const yType = mockYType();
    const key = playhtmlObserverKey("can-move", "4663-event-a");
    const a: DeepObserver = () => {};

    bindDeepObserverIdempotent({ registry, key, yType, next: a });
    assert.equal(yType.observeCalls.length, 1);
    assert.equal(yType.unobserveCalls.length, 0);

    const first = unbindDeepObserverIdempotent({ registry, key, yType });
    assert.equal(first.unbound, a);
    assert.equal(yType.unobserveCalls.length, 1);
    assert.equal(yType.unobserveCalls[0], a);
    assert.equal(registry.has(key), false);
  });

  it("2. teardown → teardown does not call unobserveDeep twice", () => {
    const registry: ObserverRegistry = new Map();
    const yType = mockYType();
    const key = playhtmlObserverKey("can-move", "4663-event-b");
    const a: DeepObserver = () => {};

    bindDeepObserverIdempotent({ registry, key, yType, next: a });
    unbindDeepObserverIdempotent({ registry, key, yType });
    assert.doesNotThrow(() => {
      const second = unbindDeepObserverIdempotent({ registry, key, yType });
      assert.equal(second.unbound, null);
    });
    assert.equal(yType.unobserveCalls.length, 1);
  });

  it("3. setup A → rebind B unobserves A once and observes B", () => {
    const registry: ObserverRegistry = new Map();
    const yType = mockYType();
    const key = playhtmlObserverKey("can-move", "4663-logo");
    const a: DeepObserver = () => {};
    const b: DeepObserver = () => {};

    bindDeepObserverIdempotent({ registry, key, yType, next: a });
    const rebound = bindDeepObserverIdempotent({
      registry,
      key,
      yType,
      next: b,
    });
    assert.equal(rebound.unbound, a);
    assert.equal(rebound.bound, b);
    assert.equal(yType.unobserveCalls.length, 1);
    assert.equal(yType.unobserveCalls[0], a);
    assert.equal(yType.observeCalls.length, 2);
    assert.equal(yType.observeCalls[1], b);
    assert.equal(registry.get(key), b);
  });

  it("4. teardown after rebind removes B once", () => {
    const registry: ObserverRegistry = new Map();
    const yType = mockYType();
    const key = playhtmlObserverKey("can-move", "4663-hero-title");
    const a: DeepObserver = () => {};
    const b: DeepObserver = () => {};

    bindDeepObserverIdempotent({ registry, key, yType, next: a });
    bindDeepObserverIdempotent({ registry, key, yType, next: b });
    const torn = unbindDeepObserverIdempotent({ registry, key, yType });
    assert.equal(torn.unbound, b);
    assert.deepEqual(yType.unobserveCalls, [a, b]);
    assert.equal(yType.observers.length, 0);
  });

  it("5. setup again after teardown works", () => {
    const registry: ObserverRegistry = new Map();
    const yType = mockYType();
    const key = playhtmlObserverKey("can-move", "4663-control-palette");
    const a: DeepObserver = () => {};
    const b: DeepObserver = () => {};

    bindDeepObserverIdempotent({ registry, key, yType, next: a });
    unbindDeepObserverIdempotent({ registry, key, yType });
    bindDeepObserverIdempotent({ registry, key, yType, next: b });
    assert.equal(registry.get(key), b);
    assert.equal(yType.observers.includes(b), true);
    assert.equal(yType.observers.includes(a), false);
  });

  it("concurrent claim: registry delete-before-unobserve prevents double remove", () => {
    const registry: ObserverRegistry = new Map();
    const yType = mockYType();
    const key = playhtmlObserverKey("can-move", "race");
    const a: DeepObserver = () => {};

    bindDeepObserverIdempotent({ registry, key, yType, next: a });

    // Simulate Bn and a second teardown both seeing the entry: first claims.
    const first = unbindDeepObserverIdempotent({ registry, key, yType });
    const second = unbindDeepObserverIdempotent({ registry, key, yType });
    assert.equal(first.unbound, a);
    assert.equal(second.unbound, null);
    assert.equal(yType.unobserveCalls.length, 1);
  });
});

describe("playhtml durable patch", () => {
  it("patch-package patch exists and claims Ge before unobserveDeep", () => {
    const patchPath = path.join(root, "patches/playhtml+2.14.1.patch");
    const patch = readFileSync(patchPath, "utf8");
    assert.ok(patch.includes("index-DlJfxvdB.js"));
    assert.ok(patch.includes("Ge.delete(n)"));
    assert.ok(patch.includes("Ge.delete(i)"));
    assert.ok(patch.includes("unobserveDeep"));
    // Old order (unobserve then delete) should not remain as the sole teardown.
    assert.ok(patch.includes("Idempotent"));
    assert.ok(patch.includes("unpkg.com/playhtml@latest/dist/style.css"));
  });

  it("@playhtml/react setup effect deps were not patched", () => {
    const reactPkg = readFileSync(
      path.join(root, "node_modules/@playhtml/react/package.json"),
      "utf8",
    );
    assert.ok(reactPkg.includes('"version": "2.1.0"'));
    const names = readdirSync(path.join(root, "patches"));
    assert.equal(
      names.some((n: string) => n.startsWith("@playhtml+react")),
      false,
    );
  });
});
