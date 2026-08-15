/**
 * RADAR panel store snapshot identity (useSyncExternalStore hydration).
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getPonsMonitoringPanelSnapshotsForTests,
  openPonsMonitoringPanel,
  resetPonsMonitoringPanelOpenForTests,
} from "@/components/canvas/pons-monitoring-panel-state";

afterEach(() => {
  resetPonsMonitoringPanelOpenForTests();
});

describe("RADAR panel store snapshot identity", () => {
  it("getServerSnapshot returns a cached reference", () => {
    const { getServerSnapshot } = getPonsMonitoringPanelSnapshotsForTests();
    const a = getServerSnapshot();
    const b = getServerSnapshot();
    assert.equal(a, b);
    assert.equal(a.open, false);
    assert.equal(a.selectedTokenAddress, null);
  });

  it("client getSnapshot is stable until the store changes", () => {
    const { getSnapshot } = getPonsMonitoringPanelSnapshotsForTests();
    const a = getSnapshot();
    const b = getSnapshot();
    assert.equal(a, b);
    openPonsMonitoringPanel();
    const c = getSnapshot();
    assert.notEqual(c, a);
    assert.equal(c.open, true);
    assert.equal(getSnapshot(), c);
  });
});
