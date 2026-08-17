/**
 * Temporary heartbeat during continuous-mode startup catch-up.
 * Ops-only wall-clock liveness; no product/chain semantics.
 * A fresh last_heartbeat_at does not imply latest_chain_block or cursors moved.
 */

export type CatchUpHeartbeatHandle = {
  /** Idempotent: safe to call more than once. */
  clear: () => void;
};

export type StartCatchUpHeartbeatInput = {
  /** When false (once mode), no interval is created. */
  enabled: boolean;
  intervalMs: number;
  write: () => Promise<void>;
  onError?: (error: unknown) => void;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

/**
 * Start a repeating heartbeat interval for the duration of startup catch-up.
 * Caller must clear() in finally. Does not write immediately — caller writes first.
 */
export function startCatchUpHeartbeat(
  input: StartCatchUpHeartbeatInput,
): CatchUpHeartbeatHandle {
  if (!input.enabled) {
    return { clear: () => {} };
  }

  const setIntervalFn = input.setIntervalFn ?? setInterval;
  const clearIntervalFn = input.clearIntervalFn ?? clearInterval;

  let cleared = false;
  let inFlight = false;

  const timer = setIntervalFn(() => {
    if (cleared || inFlight) return;
    inFlight = true;
    void input
      .write()
      .catch((error: unknown) => {
        input.onError?.(error);
      })
      .finally(() => {
        inFlight = false;
      });
  }, input.intervalMs);

  return {
    clear: () => {
      if (cleared) return;
      cleared = true;
      clearIntervalFn(timer);
    },
  };
}

/**
 * Continuous startup catch-up heartbeat lifecycle:
 * optional immediate write → interval → always clear in finally.
 * Extracted for deterministic tests; worker wires real writeHeartbeat.
 */
export async function withCatchUpHeartbeat<T>(input: {
  once: boolean;
  intervalMs: number;
  writeHeartbeat: () => Promise<void>;
  onHeartbeatError?: (error: unknown) => void;
  runCatchUp: () => Promise<T>;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}): Promise<T> {
  const enabled = !input.once;

  if (enabled) {
    try {
      await input.writeHeartbeat();
    } catch (error) {
      input.onHeartbeatError?.(error);
    }
  }

  const handle = startCatchUpHeartbeat({
    enabled,
    intervalMs: input.intervalMs,
    write: input.writeHeartbeat,
    onError: input.onHeartbeatError,
    setIntervalFn: input.setIntervalFn,
    clearIntervalFn: input.clearIntervalFn,
  });

  try {
    return await input.runCatchUp();
  } finally {
    handle.clear();
  }
}
