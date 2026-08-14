/**
 * Stage 8D / 8A.5 — presence copy formatting + summary poller.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPresenceLocationGroups,
  formatPresenceCount,
  formatPresenceLine,
  formatPresencePlaces,
  PRESENCE_PLACE_LIMIT_DESKTOP,
  PRESENCE_PLACE_LIMIT_NARROW,
  PRESENCE_SUMMARY_POLL_MS,
} from "@/lib/presence/format-presence";
import { startPresenceSummaryPolling } from "@/lib/presence/use-presence-summary";
import type { PresenceSummaryResponse } from "@/lib/presence/summary";

const base = (
  partial: Partial<PresenceSummaryResponse>,
): PresenceSummaryResponse => ({
  liveUsers: 0,
  byCountry: {},
  byCity: [],
  totalLocations: 0,
  ...partial,
});

describe("formatPresenceCount", () => {
  it("1. 0 → 0 ONLINE", () => {
    assert.equal(formatPresenceCount(0), "0 ONLINE");
  });

  it("2. 1 → 1 ONLINE", () => {
    assert.equal(formatPresenceCount(1), "1 ONLINE");
  });

  it("3. n >= 2 → {n} ONLINE", () => {
    assert.equal(formatPresenceCount(2), "2 ONLINE");
    assert.equal(formatPresenceCount(100), "100 ONLINE");
  });

  it("loading → …", () => {
    assert.equal(formatPresenceCount(null), "…");
  });
});

describe("formatPresencePlaces / aggregation", () => {
  it("sorts by count desc then label; collapses duplicates via aggregates", () => {
    const groups = buildPresenceLocationGroups(
      base({
        byCity: [
          { city: "London", countryCode: "GB", count: 28 },
          { city: "Dorset", countryCode: "GB", count: 9 },
          { city: "New York", countryCode: "US", count: 16 },
          { city: "Berlin", countryCode: "DE", count: 7 },
        ],
        totalLocations: 4,
      }),
    );
    assert.deepEqual(
      groups.map((g) => `${g.label}:${g.count}`),
      ["London:28", "New York:16", "Dorset:9", "Berlin:7"],
    );
  });

  it("desktop bounds locations and adds +N MORE", () => {
    assert.equal(
      formatPresencePlaces(
        base({
          byCity: [
            { city: "London", countryCode: "GB", count: 28 },
            { city: "New York", countryCode: "US", count: 16 },
            { city: "Dorset", countryCode: "GB", count: 9 },
            { city: "Berlin", countryCode: "DE", count: 7 },
            { city: "Paris", countryCode: "FR", count: 5 },
            { city: "Tokyo", countryCode: "JP", count: 4 },
          ],
        }),
        { maxPlaces: PRESENCE_PLACE_LIMIT_DESKTOP },
      ),
      "LONDON 28 · NEW YORK 16 · DORSET 9 · BERLIN 7 · +2 MORE",
    );
  });

  it("narrow layout shows fewer groups", () => {
    assert.equal(
      formatPresencePlaces(
        base({
          byCity: [
            { city: "London", countryCode: "GB", count: 28 },
            { city: "New York", countryCode: "US", count: 16 },
            { city: "Dorset", countryCode: "GB", count: 9 },
          ],
        }),
        { maxPlaces: PRESENCE_PLACE_LIMIT_NARROW },
      ),
      "LONDON 28 · NEW YORK 16 · +1 MORE",
    );
  });

  it("maxPlaces 0 degrades to location count", () => {
    assert.equal(
      formatPresencePlaces(
        base({
          byCity: [
            { city: "London", countryCode: "GB", count: 1 },
            { city: "Texas", countryCode: "US", count: 2 },
          ],
        }),
        { maxPlaces: 0 },
      ),
      "2 LOCATIONS",
    );
  });

  it("countries used when cities absent", () => {
    assert.equal(
      formatPresencePlaces(
        base({
          byCountry: { US: 3, GB: 2, DE: 1, FR: 1 },
        }),
      ),
      "US 3 · GB 2 · DE 1 · FR 1",
    );
  });

  it("no geo → empty places", () => {
    assert.equal(formatPresencePlaces(base({})), "");
    assert.equal(formatPresencePlaces(null), "");
  });

  it("single-line combines count + places; online count leads", () => {
    assert.equal(
      formatPresenceLine(
        base({
          liveUsers: 100,
          byCity: [
            { city: "London", countryCode: "GB", count: 28 },
            { city: "New York", countryCode: "US", count: 16 },
          ],
          totalLocations: 2,
        }),
        { maxPlaces: 4 },
      ),
      "100 ONLINE · LONDON 28 · NEW YORK 16",
    );
    assert.equal(formatPresenceLine(null), "…");
    assert.equal(formatPresenceLine(base({ liveUsers: 3 })), "3 ONLINE");
  });
});

function createPresenceVisibilityEnv(opts?: {
  visibility?: DocumentVisibilityState;
}) {
  let visibility: DocumentVisibilityState = opts?.visibility ?? "visible";
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const timers = new Map<number, () => void>();
  let nextId = 1;
  let intervalMsSeen: number | null = null;

  return {
    get visibility() {
      return visibility;
    },
    get timerCount() {
      return timers.size;
    },
    get intervalMsSeen() {
      return intervalMsSeen;
    },
    getVisibilityState: () => visibility,
    setIntervalFn: (fn: () => void, ms: number) => {
      intervalMsSeen = ms;
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    clearIntervalFn: (id: unknown) => {
      timers.delete(id as number);
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
    fireInterval() {
      const tick = [...timers.values()][0];
      tick?.();
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
    get listenerCount() {
      return listeners.get("visibilitychange")?.size ?? 0;
    },
  };
}

describe("startPresenceSummaryPolling", () => {
  it("8. failed poll retains last good snapshot", async () => {
    const updates: (PresenceSummaryResponse | null)[] = [];
    let calls = 0;
    const env = createPresenceVisibilityEnv();

    const poller = startPresenceSummaryPolling({
      fetchSummary: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            liveUsers: 2,
            byCountry: { GB: 2 },
            byCity: [],
            totalLocations: 1,
          };
        }
        throw new Error("network");
      },
      setIntervalFn: env.setIntervalFn,
      clearIntervalFn: env.clearIntervalFn,
      getVisibilityState: env.getVisibilityState,
      addEventListener: env.addEventListener,
      removeEventListener: env.removeEventListener,
      intervalMs: 1000,
      onUpdate: (s) => updates.push(s),
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(updates.at(-1)?.liveUsers, 2);

    env.fireInterval();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(updates.at(-1)?.liveUsers, 2);
    poller.stop();
  });

  it("9. polling does not overlap requests", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    const env = createPresenceVisibilityEnv();

    const poller = startPresenceSummaryPolling({
      fetchSummary: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => {
          releases.push(() => {
            inFlight -= 1;
            resolve();
          });
        });
        return {
          liveUsers: 1,
          byCountry: {},
          byCity: [],
          totalLocations: 0,
        };
      },
      setIntervalFn: env.setIntervalFn,
      clearIntervalFn: env.clearIntervalFn,
      getVisibilityState: env.getVisibilityState,
      addEventListener: env.addEventListener,
      removeEventListener: env.removeEventListener,
      intervalMs: 1000,
      onUpdate: () => {},
    });

    await Promise.resolve();
    env.fireInterval();
    env.fireInterval();
    assert.equal(maxInFlight, 1);
    assert.equal(releases.length, 1);
    releases[0]!();
    await Promise.resolve();
    poller.stop();
  });

  it("10. unmount clears polling interval", () => {
    const env = createPresenceVisibilityEnv();
    const poller = startPresenceSummaryPolling({
      fetchSummary: async () => ({
        liveUsers: 0,
        byCountry: {},
        byCity: [],
        totalLocations: 0,
      }),
      setIntervalFn: (fn, ms) => {
        assert.equal(ms, PRESENCE_SUMMARY_POLL_MS);
        return env.setIntervalFn(fn, ms);
      },
      clearIntervalFn: env.clearIntervalFn,
      getVisibilityState: env.getVisibilityState,
      addEventListener: env.addEventListener,
      removeEventListener: env.removeEventListener,
      onUpdate: () => {},
    });
    assert.equal(env.timerCount, 1);
    poller.stop();
    assert.equal(env.timerCount, 0);
    assert.equal(env.listenerCount, 0);
  });

  it("11. Health 1 — hidden pauses; visible resume fetches immediately", async () => {
    let calls = 0;
    const updates: (PresenceSummaryResponse | null)[] = [];
    const env = createPresenceVisibilityEnv();

    const poller = startPresenceSummaryPolling({
      fetchSummary: async () => {
        calls += 1;
        return {
          liveUsers: calls,
          byCountry: {},
          byCity: [],
          totalLocations: 0,
        };
      },
      setIntervalFn: env.setIntervalFn,
      clearIntervalFn: env.clearIntervalFn,
      getVisibilityState: env.getVisibilityState,
      addEventListener: env.addEventListener,
      removeEventListener: env.removeEventListener,
      intervalMs: 1000,
      onUpdate: (s) => updates.push(s),
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 1);
    assert.equal(env.timerCount, 1);
    assert.equal(updates.at(-1)?.liveUsers, 1);

    env.setVisibility("hidden");
    assert.equal(env.timerCount, 0);
    assert.equal(calls, 1);
    assert.equal(updates.at(-1)?.liveUsers, 1);

    env.setVisibility("visible");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 2);
    assert.equal(env.timerCount, 1);
    assert.equal(updates.at(-1)?.liveUsers, 2);

    env.fireInterval();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 3);
    poller.stop();
  });
});
