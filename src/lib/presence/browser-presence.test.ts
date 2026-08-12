/**
 * Stage 8B — browser presence session + heartbeat controller.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PresenceHeartbeatController,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  postPresenceHeartbeat,
} from "@/lib/presence/browser-heartbeat";
import {
  getOrCreatePresenceSessionId,
  PRESENCE_SESSION_STORAGE_KEY,
  type StorageLike,
} from "@/lib/presence/browser-session";

const VALID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  store: Record<string, string>;
} {
  const store = { ...initial };
  return {
    store,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]!
        : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
  };
}

type FakeTimer = {
  id: number;
  ms: number;
  fn: () => void;
};

function createEnv(opts?: { visibility?: DocumentVisibilityState }) {
  let visibility: DocumentVisibilityState = opts?.visibility ?? "visible";
  const boundListeners = new Map<
    string,
    Set<EventListenerOrEventListenerObject>
  >();
  const timers = new Map<number, FakeTimer>();
  let nextId = 1;
  const beats: string[] = [];
  const errors: unknown[] = [];
  let failNext = false;
  let holdEnabled = false;
  let holdResolve: (() => void) | null = null;

  const setIntervalFn = ((fn: () => void, ms: number) => {
    const id = nextId++;
    timers.set(id, { id, ms, fn });
    return id as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;

  const clearIntervalFn = ((id: ReturnType<typeof setInterval>) => {
    timers.delete(id as unknown as number);
  }) as typeof clearInterval;

  const controller = new PresenceHeartbeatController({
    getSessionId: () => VALID,
    sendHeartbeat: async (sessionId) => {
      if (failNext) {
        failNext = false;
        throw new Error("network");
      }
      if (holdEnabled && holdResolve === null) {
        await new Promise<void>((resolve) => {
          holdResolve = resolve;
        });
      }
      beats.push(sessionId);
    },
    getVisibilityState: () => visibility,
    setIntervalFn,
    clearIntervalFn,
    addEventListener: (type, listener) => {
      let set = boundListeners.get(type);
      if (!set) {
        set = new Set();
        boundListeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener: (type, listener) => {
      boundListeners.get(type)?.delete(listener);
    },
    onError: (e) => {
      errors.push(e);
    },
  });

  function emit(type: string) {
    const set = boundListeners.get(type);
    if (!set) return;
    for (const l of set) {
      if (typeof l === "function") l(new Event(type));
      else l.handleEvent(new Event(type));
    }
  }

  return {
    controller,
    beats,
    errors,
    get timerCount() {
      return timers.size;
    },
    get intervalMs() {
      return [...timers.values()][0]?.ms;
    },
    tickInterval() {
      for (const t of [...timers.values()]) t.fn();
    },
    setVisibility(next: DocumentVisibilityState) {
      visibility = next;
      emit("visibilitychange");
    },
    fireOnline() {
      emit("online");
    },
    get listenerCount() {
      let n = 0;
      for (const set of boundListeners.values()) n += set.size;
      return n;
    },
    enableHold() {
      holdEnabled = true;
    },
    releaseHold() {
      const r = holdResolve;
      holdResolve = null;
      holdEnabled = false;
      r?.();
    },
    failNextHeartbeat() {
      failNext = true;
    },
  };
}

describe("Stage 8B browser session ID", () => {
  it("1. missing localStorage ID → generate/store UUID", () => {
    const storage = memoryStorage();
    const id = getOrCreatePresenceSessionId(storage, () => VALID);
    assert.equal(id, VALID);
    assert.equal(storage.getItem(PRESENCE_SESSION_STORAGE_KEY), VALID);
  });

  it("2. valid stored UUID → reuse", () => {
    const storage = memoryStorage({
      [PRESENCE_SESSION_STORAGE_KEY]: VALID,
    });
    let generated = 0;
    const id = getOrCreatePresenceSessionId(storage, () => {
      generated += 1;
      return VALID_B;
    });
    assert.equal(id, VALID);
    assert.equal(generated, 0);
  });

  it("3. malformed stored value → replace", () => {
    const storage = memoryStorage({
      [PRESENCE_SESSION_STORAGE_KEY]: "not-a-uuid",
    });
    const id = getOrCreatePresenceSessionId(storage, () => VALID_B);
    assert.equal(id, VALID_B);
    assert.equal(storage.getItem(PRESENCE_SESSION_STORAGE_KEY), VALID_B);
  });

  it("normalizes uppercase stored UUID", () => {
    const storage = memoryStorage({
      [PRESENCE_SESSION_STORAGE_KEY]: VALID.toUpperCase(),
    });
    const id = getOrCreatePresenceSessionId(storage, () => VALID_B);
    assert.equal(id, VALID);
    assert.equal(storage.getItem(PRESENCE_SESSION_STORAGE_KEY), VALID);
  });
});

describe("Stage 8B PresenceHeartbeatController", () => {
  it("4. immediate heartbeat on mount", async () => {
    const env = createEnv();
    env.controller.start();
    await Promise.resolve();
    assert.equal(env.beats.length, 1);
    env.controller.stop();
  });

  it("5. visible state → heartbeat every 30s", async () => {
    const env = createEnv({ visibility: "visible" });
    env.controller.start();
    await Promise.resolve();
    assert.equal(env.timerCount, 1);
    assert.equal(env.intervalMs, PRESENCE_HEARTBEAT_INTERVAL_MS);
    env.tickInterval();
    await Promise.resolve();
    assert.equal(env.beats.length, 2);
    env.controller.stop();
  });

  it("6. hidden state → interval stops", async () => {
    const env = createEnv({ visibility: "visible" });
    env.controller.start();
    await Promise.resolve();
    assert.equal(env.timerCount, 1);
    env.setVisibility("hidden");
    assert.equal(env.timerCount, 0);
    env.controller.stop();
  });

  it("7. visible again → immediate heartbeat + interval restarts", async () => {
    const env = createEnv({ visibility: "visible" });
    env.controller.start();
    await Promise.resolve();
    env.setVisibility("hidden");
    assert.equal(env.timerCount, 0);
    const before = env.beats.length;
    env.setVisibility("visible");
    await Promise.resolve();
    assert.equal(env.beats.length, before + 1);
    assert.equal(env.timerCount, 1);
    env.controller.stop();
  });

  it("8. online event → immediate heartbeat", async () => {
    const env = createEnv();
    env.controller.start();
    await Promise.resolve();
    const before = env.beats.length;
    env.fireOnline();
    await Promise.resolve();
    assert.equal(env.beats.length, before + 1);
    env.controller.stop();
  });

  it("9. unmount clears timer/listeners", async () => {
    const env = createEnv();
    env.controller.start();
    await Promise.resolve();
    assert.ok(env.timerCount >= 1);
    assert.ok(env.listenerCount >= 2);
    env.controller.stop();
    assert.equal(env.timerCount, 0);
    assert.equal(env.listenerCount, 0);
  });

  it("10. no overlapping heartbeat request", async () => {
    const env = createEnv();
    env.enableHold();
    env.controller.start();
    // Allow first beat to enter hold
    await Promise.resolve();
    env.tickInterval();
    env.fireOnline();
    // Still held — overlapping beats skipped
    env.releaseHold();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.beats.length, 1);
    env.tickInterval();
    await Promise.resolve();
    assert.equal(env.beats.length, 2);
    env.controller.stop();
  });

  it("11. failed heartbeat does not throw into UI", async () => {
    const env = createEnv();
    env.failNextHeartbeat();
    env.controller.start();
    await Promise.resolve();
    assert.equal(env.errors.length, 1);
    env.tickInterval();
    await Promise.resolve();
    assert.equal(env.beats.length, 1);
    env.controller.stop();
  });

  it("postPresenceHeartbeat sends correct body", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    await postPresenceHeartbeat(VALID, fetchFn);
    assert.equal(calls[0]!.url, "/api/presence/heartbeat");
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal(
      (calls[0]!.init?.headers as Record<string, string>)["content-type"],
      "application/json",
    );
    assert.equal(calls[0]!.init?.body, JSON.stringify({ sessionId: VALID }));
  });
});
