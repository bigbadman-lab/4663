/**
 * Observation 1C — activate-observation operator plan/guard tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildObservationActivationPlan,
  describeWorkerHeartbeatStatus,
  evaluateActivationGuards,
  parseActivateObservationArgs,
  shouldMutateObservationActivation,
  verifyObservationActivationReadback,
  WORKER_HEARTBEAT_STALE_AFTER_MS,
} from "@/lib/worker/activate-observation-plan";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/worker/constants";

const B = 34_002_666;
const F = 34_560_217;
const T = 34_481_194;
const HEAD = 34_862_591;

function baseGuards(
  overrides: Partial<Parameters<typeof evaluateActivationGuards>[0]> = {},
) {
  return evaluateActivationGuards({
    configuredChainId: 4663,
    productionStartBlock: B,
    observationStartBlock: null,
    factoryCursor: F,
    transferCursor: T,
    proposedX: HEAD,
    currentHead: HEAD,
    workerHeartbeatAt: new Date(1_700_000_000_000).toISOString(),
    nowMs: 1_700_000_000_000 + WORKER_HEARTBEAT_STALE_AFTER_MS + 1,
    ...overrides,
  });
}

describe("Observation 1C parseActivateObservationArgs", () => {
  it("1. no args → dry-run shape (block null, confirm false)", () => {
    const p = parseActivateObservationArgs([]);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.block, null);
    assert.equal(p.confirm, false);
    assert.equal(shouldMutateObservationActivation(p), false);
  });

  it("2. --block X alone → still no mutation", () => {
    const p = parseActivateObservationArgs(["--block", String(HEAD)]);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.block, HEAD);
    assert.equal(p.confirm, false);
    assert.equal(shouldMutateObservationActivation(p), false);
  });

  it("3. --confirm alone → refuse (block required)", () => {
    const p = parseActivateObservationArgs(["--confirm"]);
    assert.equal(p.ok, false);
    if (p.ok) return;
    assert.match(p.error, /--block/);
  });

  it("4. --block X --confirm → mutate eligible", () => {
    const p = parseActivateObservationArgs([
      "--block",
      String(HEAD),
      "--confirm",
    ]);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(shouldMutateObservationActivation(p), true);
  });

  it("5. invalid block refused", () => {
    assert.equal(parseActivateObservationArgs(["--block", "0"]).ok, false);
    assert.equal(parseActivateObservationArgs(["--block", "1.5"]).ok, false);
    assert.equal(parseActivateObservationArgs(["--block"]).ok, false);
    assert.equal(parseActivateObservationArgs(["--nope"]).ok, false);
  });
});

describe("Observation 1C activation guards", () => {
  it("6. wrong chain refused", () => {
    const g = baseGuards({ configuredChainId: 1 });
    assert.equal(g.ok, false);
    if (g.ok) return;
    assert.match(g.reason, /wrong chain/);
  });

  it("7. already-active refused", () => {
    const g = baseGuards({ observationStartBlock: HEAD });
    assert.equal(g.ok, false);
    if (g.ok) return;
    assert.match(g.reason, /already active/);
  });

  it("8. X <= B refused", () => {
    const g = baseGuards({ proposedX: B });
    assert.equal(g.ok, false);
    if (g.ok) return;
    assert.match(g.reason, /invalid_boundary/);
  });

  it("9. X > head refused", () => {
    const g = baseGuards({ proposedX: HEAD + 10, currentHead: HEAD });
    assert.equal(g.ok, false);
    if (g.ok) return;
    assert.match(g.reason, /beyond current RPC head/);
  });

  it("10. recent heartbeat refused", () => {
    const now = 1_700_000_000_000;
    const g = baseGuards({
      workerHeartbeatAt: new Date(now - 1_000).toISOString(),
      nowMs: now,
    });
    assert.equal(g.ok, false);
    if (g.ok) return;
    assert.match(g.reason, /heartbeat is recent/);
    assert.equal(
      WORKER_HEARTBEAT_STALE_AFTER_MS,
      HEARTBEAT_INTERVAL_MS * 4,
    );
  });

  it("11. stale heartbeat permits planning", () => {
    const g = baseGuards();
    assert.equal(g.ok, true);
  });

  it("12. missing cursor refused", () => {
    const g = baseGuards({ factoryCursor: null });
    assert.equal(g.ok, false);
    if (g.ok) return;
    assert.match(g.reason, /missing_cursors/);
  });

  it("missing production / missing heartbeat refused", () => {
    assert.equal(baseGuards({ productionStartBlock: null }).ok, false);
    assert.equal(baseGuards({ workerHeartbeatAt: null }).ok, false);
  });

  it("stale X behind head warns but allows", () => {
    const g = baseGuards({ proposedX: HEAD - 100, currentHead: HEAD });
    assert.equal(g.ok, true);
    if (!g.ok) return;
    assert.ok(g.warnings.some((w) => /behind head/.test(w)));
  });
});

describe("Observation 1C plan + verification", () => {
  it("13. activation plan maps X → cursors X-1", () => {
    const plan = buildObservationActivationPlan(HEAD);
    assert.equal(plan.observationStartBlock, HEAD);
    assert.equal(plan.proposedFactoryCursor, HEAD - 1);
    assert.equal(plan.proposedTransferCursor, HEAD - 1);
    assert.match(plan.launchEligibility, new RegExp(`>= ${HEAD}`));
    assert.ok(plan.mutations.some((m) => /activate_forward_observation/.test(m)));
  });

  it("14. post-activation verification success/failure", () => {
    const ok = verifyObservationActivationReadback({
      productionStartBlockBefore: B,
      observationStartBlock: HEAD,
      factoryCursor: HEAD - 1,
      transferCursor: HEAD - 1,
      expectedX: HEAD,
      productionStartBlockAfter: B,
    });
    assert.equal(ok.ok, true);

    const bad = verifyObservationActivationReadback({
      productionStartBlockBefore: B,
      observationStartBlock: HEAD,
      factoryCursor: F,
      transferCursor: HEAD - 1,
      expectedX: HEAD,
      productionStartBlockAfter: B + 1,
    });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.ok(bad.failures.some((f) => /pons_factories/.test(f)));
    assert.ok(bad.failures.some((f) => /production_start_block/.test(f)));
  });

  it("heartbeat status labels", () => {
    const now = 1_700_000_000_000;
    assert.equal(
      describeWorkerHeartbeatStatus({
        workerHeartbeatAt: null,
        nowMs: now,
      }),
      "unknown",
    );
    assert.equal(
      describeWorkerHeartbeatStatus({
        workerHeartbeatAt: new Date(now - 1_000).toISOString(),
        nowMs: now,
      }),
      "active-looking",
    );
    assert.equal(
      describeWorkerHeartbeatStatus({
        workerHeartbeatAt: new Date(
          now - WORKER_HEARTBEAT_STALE_AFTER_MS - 1,
        ).toISOString(),
        nowMs: now,
      }),
      "paused-looking",
    );
  });
});
