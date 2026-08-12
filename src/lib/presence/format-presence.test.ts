/**
 * Stage 8D — presence copy formatting + summary poller.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPresenceCount,
  formatPresencePlaces,
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
  ...partial,
});

describe("formatPresenceCount", () => {
  it("1. 0 → 0 people here", () => {
    assert.equal(formatPresenceCount(0), "0 people here");
  });

  it("2. 1 → 1 person here", () => {
    assert.equal(formatPresenceCount(1), "1 person here");
  });

  it("3. n >= 2 → {n} people here", () => {
    assert.equal(formatPresenceCount(2), "2 people here");
    assert.equal(formatPresenceCount(12), "12 people here");
  });

  it("loading → …", () => {
    assert.equal(formatPresenceCount(null), "…");
  });
});

describe("formatPresencePlaces", () => {
  it("4. cities preferred over countries", () => {
    assert.equal(
      formatPresencePlaces(
        base({
          byCity: [
            { city: "London", countryCode: "GB", count: 1 },
            { city: "Austin", countryCode: "US", count: 1 },
          ],
          byCountry: { GB: 1, US: 1, DE: 5 },
        }),
      ),
      "from London · Austin",
    );
  });

  it("5. maximum 3 locations", () => {
    assert.equal(
      formatPresencePlaces(
        base({
          byCity: [
            { city: "A", countryCode: "US", count: 3 },
            { city: "B", countryCode: "US", count: 2 },
            { city: "C", countryCode: "US", count: 1 },
            { city: "D", countryCode: "US", count: 1 },
          ],
        }),
      ),
      "from A · B · C",
    );
  });

  it("6. countries used when cities absent", () => {
    assert.equal(
      formatPresencePlaces(
        base({
          byCountry: { US: 3, GB: 2, DE: 1, FR: 1 },
        }),
      ),
      "from US · GB · DE",
    );
  });

  it("7. no geo → no second line", () => {
    assert.equal(formatPresencePlaces(base({})), "");
    assert.equal(formatPresencePlaces(null), "");
  });
});

describe("startPresenceSummaryPolling", () => {
  it("8. failed poll retains last good snapshot", async () => {
    const updates: (PresenceSummaryResponse | null)[] = [];
    let calls = 0;
    const timers = new Map<number, () => void>();
    let nextId = 1;

    const poller = startPresenceSummaryPolling({
      fetchSummary: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            liveUsers: 2,
            byCountry: { GB: 2 },
            byCity: [],
          };
        }
        throw new Error("network");
      },
      setIntervalFn: (fn) => {
        const id = nextId++;
        timers.set(id, fn);
        return id;
      },
      clearIntervalFn: (id) => {
        timers.delete(id as number);
      },
      intervalMs: 1000,
      onUpdate: (s) => updates.push(s),
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(updates.at(-1)?.liveUsers, 2);

    const tick = [...timers.values()][0]!;
    tick();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(updates.at(-1)?.liveUsers, 2);
    poller.stop();
  });

  it("9. polling does not overlap requests", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    const timers = new Map<number, () => void>();
    let nextId = 1;

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
        return { liveUsers: 1, byCountry: {}, byCity: [] };
      },
      setIntervalFn: (fn) => {
        const id = nextId++;
        timers.set(id, fn);
        return id;
      },
      clearIntervalFn: (id) => {
        timers.delete(id as number);
      },
      intervalMs: 1000,
      onUpdate: () => {},
    });

    await Promise.resolve();
    const tick = [...timers.values()][0]!;
    tick();
    tick();
    assert.equal(maxInFlight, 1);
    assert.equal(releases.length, 1);
    releases[0]!();
    await Promise.resolve();
    poller.stop();
  });

  it("10. unmount clears polling interval", () => {
    const timers = new Map<number, () => void>();
    let nextId = 1;
    const poller = startPresenceSummaryPolling({
      fetchSummary: async () => ({ liveUsers: 0, byCountry: {}, byCity: [] }),
      setIntervalFn: (fn, ms) => {
        assert.equal(ms, PRESENCE_SUMMARY_POLL_MS);
        const id = nextId++;
        timers.set(id, fn);
        return id;
      },
      clearIntervalFn: (id) => {
        timers.delete(id as number);
      },
      onUpdate: () => {},
    });
    assert.equal(timers.size, 1);
    poller.stop();
    assert.equal(timers.size, 0);
  });
});
