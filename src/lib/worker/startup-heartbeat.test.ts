/**
 * Stage 7B — startup catch-up heartbeat (ops liveness only).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  startCatchUpHeartbeat,
  withCatchUpHeartbeat,
} from "@/lib/worker/startup-heartbeat";

function mockTimers() {
  const callbacks: Array<() => void> = [];
  const ids: number[] = [];
  let nextId = 1;
  const cleared: number[] = [];

  const setIntervalFn = ((fn: () => void) => {
    const id = nextId++;
    ids.push(id);
    callbacks.push(fn);
    return id as unknown as NodeJS.Timeout;
  }) as typeof setInterval;

  const clearIntervalFn = ((id: NodeJS.Timeout) => {
    cleared.push(id as unknown as number);
  }) as typeof clearInterval;

  return {
    setIntervalFn,
    clearIntervalFn,
    tickAll: () => {
      for (const cb of [...callbacks]) cb();
    },
    get createdCount() {
      return ids.length;
    },
    get clearedIds() {
      return cleared;
    },
    get activeIds() {
      return ids.filter((id) => !cleared.includes(id));
    },
  };
}

describe("Stage 7B startup catch-up heartbeat", () => {
  it("1. continuous: writes heartbeat before slow catch-up completes", async () => {
    const writes: number[] = [];
    let catchUpStarted = false;
    let sawWriteBeforeCatchUpDone = false;

    await withCatchUpHeartbeat({
      once: false,
      intervalMs: 30_000,
      writeHeartbeat: async () => {
        writes.push(Date.now());
        if (catchUpStarted) {
          // interval tick during catch-up also counts as before done
        } else {
          sawWriteBeforeCatchUpDone = true;
        }
      },
      setIntervalFn: mockTimers().setIntervalFn,
      clearIntervalFn: mockTimers().clearIntervalFn,
      runCatchUp: async () => {
        catchUpStarted = true;
        assert.equal(
          sawWriteBeforeCatchUpDone,
          true,
          "immediate heartbeat must run before catch-up body",
        );
        assert.ok(writes.length >= 1);
        await new Promise((r) => setTimeout(r, 5));
      },
    });

    assert.ok(writes.length >= 1);
  });

  it("2. temporary interval cleared after successful catch-up", async () => {
    const timers = mockTimers();
    await withCatchUpHeartbeat({
      once: false,
      intervalMs: 1000,
      writeHeartbeat: async () => {},
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
      runCatchUp: async () => "ok",
    });

    assert.equal(timers.createdCount, 1);
    assert.equal(timers.activeIds.length, 0);
    assert.equal(timers.clearedIds.length, 1);
  });

  it("3. interval cleared if catch-up throws", async () => {
    const timers = mockTimers();
    await assert.rejects(
      () =>
        withCatchUpHeartbeat({
          once: false,
          intervalMs: 1000,
          writeHeartbeat: async () => {},
          setIntervalFn: timers.setIntervalFn,
          clearIntervalFn: timers.clearIntervalFn,
          runCatchUp: async () => {
            throw new Error("catch-up boom");
          },
        }),
      /catch-up boom/,
    );

    assert.equal(timers.createdCount, 1);
    assert.equal(timers.activeIds.length, 0);
    assert.equal(timers.clearedIds.length, 1);
  });

  it("4. once mode does not leave a heartbeat interval running", async () => {
    const timers = mockTimers();
    let writes = 0;
    await withCatchUpHeartbeat({
      once: true,
      intervalMs: 1000,
      writeHeartbeat: async () => {
        writes += 1;
      },
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
      runCatchUp: async () => {},
    });

    assert.equal(timers.createdCount, 0);
    assert.equal(timers.clearedIds.length, 0);
    assert.equal(writes, 0, "once mode skips startup immediate/interval heartbeats");
  });

  it("5. steady-state heartbeat interval remains independently clearable", () => {
    // Models worker.ts: after catch-up clears startup handle, a new steady-state
    // setInterval is created and later cleared on shutdown — no overlap.
    const timers = mockTimers();
    const startup = startCatchUpHeartbeat({
      enabled: true,
      intervalMs: 30_000,
      write: async () => {},
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    assert.equal(timers.createdCount, 1);
    startup.clear();
    assert.equal(timers.activeIds.length, 0);

    const steadyId = timers.setIntervalFn(() => {}, 30_000);
    assert.equal(timers.createdCount, 2);
    assert.equal(timers.activeIds.length, 1);
    timers.clearIntervalFn(steadyId);
    assert.equal(timers.activeIds.length, 0);
  });

  it("startCatchUpHeartbeat clear is idempotent", () => {
    const timers = mockTimers();
    const handle = startCatchUpHeartbeat({
      enabled: true,
      intervalMs: 1000,
      write: async () => {},
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    handle.clear();
    handle.clear();
    assert.equal(timers.clearedIds.length, 1);
  });

  it("interval tick invokes write; write failure stays operational", async () => {
    const timers = mockTimers();
    let errors = 0;
    let writes = 0;
    startCatchUpHeartbeat({
      enabled: true,
      intervalMs: 1000,
      write: async () => {
        writes += 1;
        throw new Error("hb fail");
      },
      onError: () => {
        errors += 1;
      },
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
    timers.tickAll();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(writes, 1);
    assert.equal(errors, 1);
  });
});
