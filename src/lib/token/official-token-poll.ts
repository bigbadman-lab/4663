/**
 * Official 4663 token client poll — injectable for tests.
 * Health 1: pauses while hidden; resumes with an immediate fetch.
 * Stops permanently once active.
 */

import {
  OFFICIAL_TOKEN_POLL_INACTIVE_MS,
  type OfficialTokenPublicState,
} from "@/lib/token/official";

export type OfficialTokenFetchResult =
  | { ok: true; state: OfficialTokenPublicState }
  | { ok: false };

export type OfficialTokenPollerDeps = {
  fetchOfficial: () => Promise<OfficialTokenFetchResult>;
  getVisibilityState: () => DocumentVisibilityState;
  setTimeoutFn: (handler: () => void, ms: number) => unknown;
  clearTimeoutFn: (id: unknown) => void;
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) => void;
  onState: (state: OfficialTokenPublicState | null) => void;
  pollMs?: number;
};

/**
 * Poll while inactive and visible. Call stop() on unmount.
 * Does not clear last-good active state on transient failures.
 */
export function startOfficialTokenPolling(
  deps: OfficialTokenPollerDeps,
): { stop: () => void } {
  let cancelled = false;
  let timer: unknown = null;
  let inFlight = false;
  let pendingImmediate = false;
  let heldActive = false;
  const pollMs = deps.pollMs ?? OFFICIAL_TOKEN_POLL_INACTIVE_MS;

  const clearTimer = () => {
    if (timer !== null) {
      deps.clearTimeoutFn(timer);
      timer = null;
    }
  };

  const scheduleNext = () => {
    clearTimer();
    if (cancelled || heldActive) return;
    if (deps.getVisibilityState() !== "visible") return;
    timer = deps.setTimeoutFn(() => {
      timer = null;
      void runTick();
    }, pollMs);
  };

  const applyResult = (result: OfficialTokenFetchResult) => {
    if (cancelled) return;
    if (result.ok) {
      if (result.state.active) {
        heldActive = true;
        deps.onState(result.state);
        clearTimer();
        return; // stop polling — immutable once active
      }
      if (!heldActive) deps.onState({ active: false });
    } else if (!heldActive) {
      // Transient failure before first success — keep prior (often null).
    }
  };

  const runTick = async () => {
    if (cancelled || heldActive) return;
    if (deps.getVisibilityState() !== "visible") return;
    if (inFlight) {
      pendingImmediate = true;
      return;
    }

    inFlight = true;
    try {
      const result = await deps.fetchOfficial();
      applyResult(result);
    } finally {
      inFlight = false;
    }

    if (cancelled || heldActive) return;

    if (pendingImmediate) {
      pendingImmediate = false;
      if (deps.getVisibilityState() === "visible") {
        void runTick();
        return;
      }
    }

    scheduleNext();
  };

  const onVisibility = () => {
    if (cancelled || heldActive) return;
    if (deps.getVisibilityState() === "visible") {
      void runTick();
    } else {
      clearTimer();
    }
  };

  deps.addEventListener("visibilitychange", onVisibility);
  if (deps.getVisibilityState() === "visible") {
    void runTick();
  }

  return {
    stop: () => {
      if (cancelled) return;
      cancelled = true;
      clearTimer();
      deps.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

export async function fetchOfficialTokenJson(
  fetchFn: typeof fetch = fetch,
): Promise<OfficialTokenFetchResult> {
  try {
    const res = await fetchFn("/api/token/official", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as {
      active?: boolean;
      chainId?: number;
      contractAddress?: string;
    };
    if (body.active === true && typeof body.contractAddress === "string") {
      return {
        ok: true,
        state: {
          active: true,
          chainId: 4663,
          contractAddress: body.contractAddress,
        },
      };
    }
    return { ok: true, state: { active: false } };
  } catch {
    return { ok: false };
  }
}
