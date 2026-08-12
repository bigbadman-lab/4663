/**
 * Browser presence heartbeat controller (injectable for tests).
 * Never throws into UI; skips overlapping in-flight requests.
 */

import { PRESENCE_SESSION_STORAGE_KEY } from "@/lib/presence/browser-session";

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000 as const;
export const PRESENCE_HEARTBEAT_PATH = "/api/presence/heartbeat" as const;

export type PresenceHeartbeatDeps = {
  getSessionId: () => string;
  /** POST heartbeat; may reject — controller swallows */
  sendHeartbeat: (sessionId: string) => Promise<void>;
  getVisibilityState: () => DocumentVisibilityState;
  setIntervalFn: typeof setInterval;
  clearIntervalFn: typeof clearInterval;
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
  onError?: (error: unknown) => void;
};

/**
 * Default fetch-based sender for the browser.
 */
export async function postPresenceHeartbeat(
  sessionId: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchFn(PRESENCE_HEARTBEAT_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    throw new Error(`presence heartbeat HTTP ${res.status}`);
  }
}

export class PresenceHeartbeatController {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private stopped = true;
  private readonly onVisibility: () => void;
  private readonly onOnline: () => void;

  constructor(private readonly deps: PresenceHeartbeatDeps) {
    this.onVisibility = () => {
      if (this.stopped) return;
      if (this.deps.getVisibilityState() === "visible") {
        void this.beat();
        this.startVisibleInterval();
      } else {
        this.clearVisibleInterval();
      }
    };
    this.onOnline = () => {
      if (this.stopped) return;
      void this.beat();
    };
  }

  /** Mount: immediate beat; interval only while visible. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;

    this.deps.addEventListener("visibilitychange", this.onVisibility);
    this.deps.addEventListener("online", this.onOnline);

    void this.beat();
    if (this.deps.getVisibilityState() === "visible") {
      this.startVisibleInterval();
    }
  }

  /** Unmount: clear timer + listeners. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearVisibleInterval();
    this.deps.removeEventListener("visibilitychange", this.onVisibility);
    this.deps.removeEventListener("online", this.onOnline);
  }

  private startVisibleInterval(): void {
    this.clearVisibleInterval();
    this.timer = this.deps.setIntervalFn(() => {
      void this.beat();
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);
  }

  private clearVisibleInterval(): void {
    if (this.timer !== null) {
      this.deps.clearIntervalFn(this.timer);
      this.timer = null;
    }
  }

  private async beat(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    this.inFlight = true;
    try {
      const sessionId = this.deps.getSessionId();
      await this.deps.sendHeartbeat(sessionId);
    } catch (error) {
      this.deps.onError?.(error);
    } finally {
      this.inFlight = false;
    }
  }
}

/** Re-export storage key for callers that need the constant near the controller. */
export { PRESENCE_SESSION_STORAGE_KEY };
