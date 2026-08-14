/**
 * Small visibility-aware interval poller.
 * While visible: immediate tick + interval (same cadence as a plain setInterval poller).
 * While hidden: clear interval; keep caller state untouched.
 * On hidden→visible: one fresh tick, then restart the same interval.
 */

export type VisibilityIntervalPollDeps = {
  intervalMs: number;
  /** Invoked on start (if visible), each interval tick, and on resume. */
  tick: () => void | Promise<void>;
  getVisibilityState: () => DocumentVisibilityState;
  setIntervalFn: (handler: () => void, ms: number) => unknown;
  clearIntervalFn: (id: unknown) => void;
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => void;
};

export type VisibilityIntervalPollHandle = {
  stop: () => void;
};

/**
 * Starts visibility-aware polling. Call stop() on unmount.
 * Does not clear caller-owned last-good state.
 */
export function startVisibilityIntervalPolling(
  deps: VisibilityIntervalPollDeps,
): VisibilityIntervalPollHandle {
  let stopped = false;
  let timer: unknown = null;

  const clearTimer = () => {
    if (timer !== null) {
      deps.clearIntervalFn(timer);
      timer = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timer = deps.setIntervalFn(() => {
      void deps.tick();
    }, deps.intervalMs);
  };

  const onVisibility = () => {
    if (stopped) return;
    if (deps.getVisibilityState() === "visible") {
      void deps.tick();
      startTimer();
    } else {
      clearTimer();
    }
  };

  deps.addEventListener("visibilitychange", onVisibility);

  if (deps.getVisibilityState() === "visible") {
    void deps.tick();
    startTimer();
  }

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearTimer();
      deps.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

/** Browser defaults for React hooks (window / document). */
export function browserVisibilityIntervalDeps(): Pick<
  VisibilityIntervalPollDeps,
  | "getVisibilityState"
  | "setIntervalFn"
  | "clearIntervalFn"
  | "addEventListener"
  | "removeEventListener"
> {
  return {
    getVisibilityState: () =>
      typeof document === "undefined" ? "visible" : document.visibilityState,
    setIntervalFn: (handler, ms) => window.setInterval(handler, ms),
    clearIntervalFn: (id) => window.clearInterval(id as number),
    addEventListener: (type, listener) =>
      window.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener),
  };
}
