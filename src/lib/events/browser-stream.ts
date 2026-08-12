/**
 * Browser public events stream controller (injectable for tests).
 * Subscribe first → fetch recent on SUBSCRIBED → merge by id.
 */

import { fetchRecentPublicEvents } from "@/lib/events/fetch-recent";
import { mergePublicEvents } from "@/lib/events/merge";
import { normalizePublicEvent } from "@/lib/events/normalize";
import type { EventsRealtimeClient } from "@/lib/events/realtime-client";
import type { PublicEvent } from "@/lib/events/types";

export type PublicEventsStreamStatus = "connecting" | "live" | "error";

export const PUBLIC_EVENTS_FETCH_RETRY_MS = 3_000 as const;

export type PublicEventsStreamDeps = {
  realtime: EventsRealtimeClient;
  fetchRecent: (
    signal?: AbortSignal,
  ) => Promise<PublicEvent[]>;
  onEvents: (events: PublicEvent[]) => void;
  onStatus: (status: PublicEventsStreamStatus) => void;
  onError?: (error: unknown) => void;
  setTimeoutFn?: (handler: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
};

export class PublicEventsStreamController {
  private stopped = true;
  private events: PublicEvent[] = [];
  private subscription: { unsubscribe: () => void } | null = null;
  private abort: AbortController | null = null;
  private fetchGeneration = 0;
  private retryTimer: unknown = null;
  private readonly setTimeoutFn: (handler: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (id: unknown) => void;

  constructor(private readonly deps: PublicEventsStreamDeps) {
    this.setTimeoutFn =
      deps.setTimeoutFn ?? ((handler, ms) => setTimeout(handler, ms));
    this.clearTimeoutFn =
      deps.clearTimeoutFn ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  getEvents(): PublicEvent[] {
    return this.events;
  }

  /** Mount: open one Realtime channel. Idempotent — no duplicate channels. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.deps.onStatus("connecting");

    this.subscription = this.deps.realtime.subscribeInserts({
      onInsert: (row) => {
        if (this.stopped) return;
        try {
          const dto = normalizePublicEvent(row);
          if (!dto) return;
          this.applyIncoming([dto]);
        } catch (error) {
          this.deps.onError?.(error);
        }
      },
      onStatus: (status) => {
        if (this.stopped) return;
        if (status === "SUBSCRIBED") {
          this.deps.onStatus("live");
          void this.refetchRecent({ allowRetry: true });
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.deps.onStatus("error");
          return;
        }
        if (status === "CLOSED") {
          this.deps.onStatus("connecting");
        }
      },
    });
  }

  /** Unmount: abort fetch, clear retry, remove channel. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearRetry();
    this.abort?.abort();
    this.abort = null;
    this.fetchGeneration += 1;
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private applyIncoming(incoming: readonly PublicEvent[]): void {
    this.events = mergePublicEvents(this.events, incoming);
    this.deps.onEvents(this.events);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      this.clearTimeoutFn(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async refetchRecent(opts: { allowRetry: boolean }): Promise<void> {
    this.clearRetry();
    this.abort?.abort();
    const ac = new AbortController();
    this.abort = ac;
    const generation = ++this.fetchGeneration;

    try {
      const recent = await this.deps.fetchRecent(ac.signal);
      if (this.stopped || generation !== this.fetchGeneration) return;
      this.applyIncoming(recent);
    } catch (error) {
      if (ac.signal.aborted || this.stopped) return;
      this.deps.onError?.(error);
      if (opts.allowRetry && !this.stopped) {
        this.retryTimer = this.setTimeoutFn(() => {
          this.retryTimer = null;
          if (this.stopped) return;
          void this.refetchRecent({ allowRetry: false });
        }, PUBLIC_EVENTS_FETCH_RETRY_MS);
      }
    }
  }
}

/** Default browser wiring helper for the React hook. */
export function createDefaultFetchRecent(): (
  signal?: AbortSignal,
) => Promise<PublicEvent[]> {
  return (signal) => fetchRecentPublicEvents(fetch, signal);
}
