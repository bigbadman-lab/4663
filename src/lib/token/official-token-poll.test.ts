/**
 * Official token poller — Health 1 visibility behaviour.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OFFICIAL_TOKEN_POLL_INACTIVE_MS } from "@/lib/token/official";
import {
  startOfficialTokenPolling,
  type OfficialTokenFetchResult,
} from "@/lib/token/official-token-poll";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function createEnv(opts?: { visibility?: DocumentVisibilityState }) {
  let visibility: DocumentVisibilityState = opts?.visibility ?? "visible";
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const timeouts = new Map<number, { ms: number; fn: () => void }>();
  let nextId = 1;
  const states: unknown[] = [];
  let fetches = 0;

  return {
    get fetches() {
      return fetches;
    },
    get timeoutCount() {
      return timeouts.size;
    },
    get timeoutMs() {
      return [...timeouts.values()][0]?.ms ?? null;
    },
    get listenerCount() {
      return listeners.get("visibilitychange")?.size ?? 0;
    },
    states,
    getVisibilityState: () => visibility,
    setTimeoutFn: (fn: () => void, ms: number) => {
      const id = nextId++;
      timeouts.set(id, { ms, fn });
      return id;
    },
    clearTimeoutFn: (id: unknown) => {
      timeouts.delete(id as number);
    },
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.get(type)?.delete(listener);
    },
    setVisibility(next: DocumentVisibilityState) {
      visibility = next;
      const set = listeners.get("visibilitychange");
      if (!set) return;
      for (const l of set) {
        if (typeof l === "function") l(new Event("visibilitychange"));
        else l.handleEvent(new Event("visibilitychange"));
      }
    },
    fireTimeout() {
      const entry = [...timeouts.entries()][0];
      if (!entry) return;
      timeouts.delete(entry[0]);
      entry[1].fn();
    },
    bumpFetch: () => {
      fetches += 1;
    },
  };
}

describe("startOfficialTokenPolling", () => {
  it("visible: immediate fetch + schedules inactive poll ms", async () => {
    const env = createEnv();
    const poller = startOfficialTokenPolling({
      fetchOfficial: async (): Promise<OfficialTokenFetchResult> => {
        env.bumpFetch();
        return { ok: true, state: { active: false } };
      },
      getVisibilityState: env.getVisibilityState,
      setTimeoutFn: env.setTimeoutFn,
      clearTimeoutFn: env.clearTimeoutFn,
      addEventListener: env.addEventListener,
      removeEventListener: env.removeEventListener,
      onState: (s) => env.states.push(s),
      pollMs: OFFICIAL_TOKEN_POLL_INACTIVE_MS,
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.fetches, 1);
    assert.equal(env.timeoutCount, 1);
    assert.equal(env.timeoutMs, OFFICIAL_TOKEN_POLL_INACTIVE_MS);
    assert.deepEqual(env.states.at(-1), { active: false });

    env.fireTimeout();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.fetches, 2);
    poller.stop();
  });

  it("hidden: stops timeouts; resume: immediate fetch", async () => {
    const env = createEnv();
    const poller = startOfficialTokenPolling({
      fetchOfficial: async (): Promise<OfficialTokenFetchResult> => {
        env.bumpFetch();
        return { ok: true, state: { active: false } };
      },
      getVisibilityState: env.getVisibilityState,
      setTimeoutFn: env.setTimeoutFn,
      clearTimeoutFn: env.clearTimeoutFn,
      addEventListener: env.addEventListener,
      removeEventListener: env.removeEventListener,
      onState: (s) => env.states.push(s),
      pollMs: 1000,
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.fetches, 1);

    env.setVisibility("hidden");
    assert.equal(env.timeoutCount, 0);
    assert.equal(env.fetches, 1);

    env.setVisibility("visible");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.fetches, 2);
    assert.equal(env.timeoutCount, 1);
    poller.stop();
  });

  it("active token stops further polling", async () => {
    const env = createEnv();
    let n = 0;
    const poller = startOfficialTokenPolling({
      fetchOfficial: async (): Promise<OfficialTokenFetchResult> => {
        env.bumpFetch();
        n += 1;
        if (n === 1) return { ok: true, state: { active: false } };
        return {
          ok: true,
          state: {
            active: true,
            chainId: 4663,
            contractAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
          },
        };
      },
      getVisibilityState: env.getVisibilityState,
      setTimeoutFn: env.setTimeoutFn,
      clearTimeoutFn: env.clearTimeoutFn,
      addEventListener: env.addEventListener,
      removeEventListener: env.removeEventListener,
      onState: (s) => env.states.push(s),
      pollMs: 1000,
    });

    await Promise.resolve();
    await Promise.resolve();
    env.fireTimeout();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.fetches, 2);
    assert.equal(env.timeoutCount, 0);

    env.setVisibility("hidden");
    env.setVisibility("visible");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.fetches, 2);
    poller.stop();
  });

  it("cleanup removes listener and timer", async () => {
    const env = createEnv();
    const poller = startOfficialTokenPolling({
      fetchOfficial: async () => {
        env.bumpFetch();
        return { ok: true, state: { active: false } };
      },
      getVisibilityState: env.getVisibilityState,
      setTimeoutFn: env.setTimeoutFn,
      clearTimeoutFn: env.clearTimeoutFn,
      addEventListener: env.addEventListener,
      removeEventListener: env.removeEventListener,
      onState: () => {},
      pollMs: 1000,
    });
    await Promise.resolve();
    assert.equal(env.listenerCount, 1);
    poller.stop();
    assert.equal(env.timeoutCount, 0);
    assert.equal(env.listenerCount, 0);
  });

  it("hook wires shared poller; inactive poll ms unchanged", () => {
    const hook = readSrc("src/components/canvas/use-official-token.ts");
    assert.ok(hook.includes("startOfficialTokenPolling"));
    assert.ok(hook.includes("fetchOfficialTokenJson"));
    const poll = readSrc("src/lib/token/official-token-poll.ts");
    assert.ok(poll.includes("OFFICIAL_TOKEN_POLL_INACTIVE_MS"));
    assert.ok(poll.includes("visibilitychange"));
  });
});
