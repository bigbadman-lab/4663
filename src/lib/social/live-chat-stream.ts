/**
 * Live chat stream controller (injectable for tests).
 * Subscribe → fetch recent on SUBSCRIBED → merge/dedupe by id → chronological.
 */

import type { ChatRealtimeClient } from "@/lib/social/chat-realtime";
import {
  chatMessageFromRow,
  mergeChatMessages,
  type ChatMessage,
} from "@/lib/social/chat-message";

export type LiveChatStreamStatus = "connecting" | "live" | "error";

export const LIVE_CHAT_FETCH_RETRY_MS = 3_000 as const;

export type LiveChatStreamDeps = {
  realtime: ChatRealtimeClient;
  fetchRecent: (signal?: AbortSignal) => Promise<ChatMessage[]>;
  onMessages: (messages: ChatMessage[]) => void;
  onStatus: (status: LiveChatStreamStatus) => void;
  onError?: (error: unknown) => void;
  setTimeoutFn?: (handler: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
};

export class LiveChatStreamController {
  private stopped = true;
  private messages: ChatMessage[] = [];
  private subscription: { unsubscribe: () => void } | null = null;
  private abort: AbortController | null = null;
  private fetchGeneration = 0;
  private retryTimer: unknown = null;
  private readonly setTimeoutFn: (handler: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (id: unknown) => void;

  constructor(private readonly deps: LiveChatStreamDeps) {
    this.setTimeoutFn =
      deps.setTimeoutFn ?? ((handler, ms) => setTimeout(handler, ms));
    this.clearTimeoutFn =
      deps.clearTimeoutFn ??
      ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.deps.onStatus("connecting");

    this.subscription = this.deps.realtime.subscribeInserts({
      onInsert: (row) => {
        if (this.stopped) return;
        try {
          const message = chatMessageFromRow(row);
          if (!message) return;
          this.applyIncoming([message]);
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

  /** Optimistic / POST-accepted local merge. */
  applyLocalMessage(message: ChatMessage): void {
    if (this.stopped) return;
    this.applyIncoming([message]);
  }

  private applyIncoming(incoming: readonly ChatMessage[]): void {
    this.messages = mergeChatMessages(this.messages, incoming);
    this.deps.onMessages(this.messages);
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
      if (opts.allowRetry) {
        this.retryTimer = this.setTimeoutFn(() => {
          void this.refetchRecent({ allowRetry: true });
        }, LIVE_CHAT_FETCH_RETRY_MS);
      }
    }
  }
}
