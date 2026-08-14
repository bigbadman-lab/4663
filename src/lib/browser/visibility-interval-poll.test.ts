/**
 * Visibility-aware interval poller — Health 1.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  startVisibilityIntervalPolling,
  type VisibilityIntervalPollDeps,
} from "@/lib/browser/visibility-interval-poll";

type FakeTimer = {
  id: number;
  ms: number;
  fn: () => void;
};

function createHarness(opts?: { visibility?: DocumentVisibilityState }) {
  let visibility: DocumentVisibilityState = opts?.visibility ?? "visible";
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const timers = new Map<number, FakeTimer>();
  let nextId = 1;
  const ticks: number[] = [];

  const deps: VisibilityIntervalPollDeps = {
    intervalMs: 1000,
    tick: () => {
      ticks.push(Date.now());
    },
    getVisibilityState: () => visibility,
    setIntervalFn: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { id, ms, fn });
      return id;
    },
    clearIntervalFn: (id) => {
      timers.delete(id as number);
    },
    addEventListener: (type, listener) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
  };

  function emitVisibility() {
    const set = listeners.get("visibilitychange");
    if (!set) return;
    for (const l of set) {
      if (typeof l === "function") l(new Event("visibilitychange"));
      else l.handleEvent(new Event("visibilitychange"));
    }
  }

  return {
    deps,
    ticks,
    get timerCount() {
      return timers.size;
    },
    get intervalMs() {
      return [...timers.values()][0]?.ms;
    },
    get listenerCount() {
      return listeners.get("visibilitychange")?.size ?? 0;
    },
    setVisibility(next: DocumentVisibilityState) {
      visibility = next;
      emitVisibility();
    },
    fireInterval() {
      const timer = [...timers.values()][0];
      timer?.fn();
    },
  };
}

describe("startVisibilityIntervalPolling", () => {
  it("visible: immediate tick + interval at given ms", () => {
    const h = createHarness({ visibility: "visible" });
    const poller = startVisibilityIntervalPolling(h.deps);
    assert.equal(h.ticks.length, 1);
    assert.equal(h.timerCount, 1);
    assert.equal(h.intervalMs, 1000);
    h.fireInterval();
    assert.equal(h.ticks.length, 2);
    poller.stop();
  });

  it("hidden on start: no tick and no interval", () => {
    const h = createHarness({ visibility: "hidden" });
    const poller = startVisibilityIntervalPolling(h.deps);
    assert.equal(h.ticks.length, 0);
    assert.equal(h.timerCount, 0);
    poller.stop();
  });

  it("hidden: clears interval; resume: immediate tick + new interval", () => {
    const h = createHarness({ visibility: "visible" });
    const poller = startVisibilityIntervalPolling(h.deps);
    assert.equal(h.ticks.length, 1);
    assert.equal(h.timerCount, 1);

    h.setVisibility("hidden");
    assert.equal(h.timerCount, 0);
    assert.equal(h.ticks.length, 1);

    h.setVisibility("visible");
    assert.equal(h.ticks.length, 2);
    assert.equal(h.timerCount, 1);
    assert.equal(h.intervalMs, 1000);

    h.fireInterval();
    assert.equal(h.ticks.length, 3);
    poller.stop();
  });

  it("repeated visibility events do not stack intervals or listeners", () => {
    const h = createHarness({ visibility: "visible" });
    const poller = startVisibilityIntervalPolling(h.deps);
    assert.equal(h.listenerCount, 1);

    h.setVisibility("hidden");
    h.setVisibility("visible");
    h.setVisibility("hidden");
    h.setVisibility("visible");
    assert.equal(h.timerCount, 1);
    assert.equal(h.listenerCount, 1);
    poller.stop();
    assert.equal(h.timerCount, 0);
    assert.equal(h.listenerCount, 0);
  });

  it("stop is idempotent and prevents further ticks", () => {
    const h = createHarness({ visibility: "visible" });
    const poller = startVisibilityIntervalPolling(h.deps);
    poller.stop();
    poller.stop();
    assert.equal(h.timerCount, 0);
    assert.equal(h.listenerCount, 0);
    const before = h.ticks.length;
    h.setVisibility("hidden");
    h.setVisibility("visible");
    assert.equal(h.ticks.length, before);
  });
});
