"use client";

/**
 * Live chat object content — global room UI (not canvas TEXT).
 * Soft shared conversation window (humans), distinct from PONS terminal (machine).
 * IC3.6 — input / send / ENTER / EVM copy use interactive-control protection.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { LiveChatResizeHandle } from "@/components/canvas/live-chat-resize-handle";
import { PonsAddressCopyControl } from "@/components/canvas/pons-address-copy-control";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { DESKTOP_CHROME_MEDIA_QUERY } from "@/lib/canvas/canvas-chrome-layout";
import { splitTextWithEvmAddresses } from "@/lib/canvas/format-address";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  MOBILE_SAFE_COMPOSER_INPUT_CLASS,
  worldScaleCounterScale,
} from "@/lib/canvas/mobile-form-control";
import {
  LIVE_CHAT_DEFAULT_SIZE,
  clampLiveChatSize,
  readLiveChatSize,
  writeLiveChatSize,
  type LiveChatSize,
  type LiveChatViewport,
} from "@/lib/social/live-chat-size";
import {
  formatPresenceHereLabel,
} from "@/lib/presence/format-presence";
import type { PresenceSummaryResponse } from "@/lib/presence/summary";
import {
  fetchPresenceSummaryJson,
  startPresenceSummaryPolling,
} from "@/lib/presence/use-presence-summary";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from "@/lib/social/chat-message";
import { requestParticipationEnter } from "@/lib/social/request-participation-enter";
import { useLiveChat } from "@/lib/social/use-live-chat";
import { useParticipation } from "@/lib/social/use-participation";

/** Stable PlayHTML / DOM id. */
export const LIVE_CHAT_ELEMENT_ID = "4663-live-chat" as const;

/**
 * Default home-region CSS origin.
 * Clear of watchlist (22%/32%), monitor terminal (48%/36%),
 * hero/brand, SUMMON/palette, and viewport chrome/footer.
 */
export const LIVE_CHAT_DEFAULT_STYLE = {
  left: "74%",
  top: "42%",
} as const;

export type LiveChatObjectProps = {
  movableChrome?: boolean;
};

export function liveChatHostClassName(movableChrome: boolean): string {
  return movableChrome
    ? "pointer-events-auto absolute z-[15] -translate-x-1/2 -translate-y-1/2 touch-manipulation select-none"
    : "absolute z-[15] -translate-x-1/2 -translate-y-1/2 select-none";
}

function ChatMessageBody({ body }: { body: string }) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const segments = splitTextWithEvmAddresses(body);

  async function onCopyAddress(address: string): Promise<void> {
    const ok = await copyTextQuiet(address);
    if (!ok) return;
    setCopiedAddress(address);
    window.setTimeout(() => {
      setCopiedAddress((current) => (current === address ? null : current));
    }, 1200);
  }

  return (
    <p
      className="mt-0.5 min-w-0 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-neutral-700 sm:text-[12px]"
      data-4663-live-chat-body
    >
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }
        return (
          <span
            key={`a-${index}-${segment.value}`}
            className="pointer-events-auto inline-flex max-w-full flex-col items-start align-baseline opacity-80"
            data-4663-live-chat-address
          >
            <PonsAddressCopyControl
              variant="inline"
              tokenAddress={segment.value}
              onCopy={() => {
                void onCopyAddress(segment.value);
              }}
            />
            {copiedAddress === segment.value ? (
              <span className="text-[9px] tracking-wide text-neutral-400">
                copied
              </span>
            ) : null}
          </span>
        );
      })}
    </p>
  );
}

function ChatMessageRow({ message }: { message: ChatMessage }) {
  return (
    <li className="min-w-0" data-4663-live-chat-row={message.id}>
      <span
        className="block max-w-full truncate text-[10px] leading-none tracking-wide sm:text-[11px]"
        style={{ color: message.colour }}
        data-4663-live-chat-name
      >
        {message.displayName}
      </span>
      <ChatMessageBody body={message.body} />
    </li>
  );
}

function ChatEnterPrompt() {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="min-h-11 w-full touch-manipulation text-left font-mono text-[11px] tracking-wide text-neutral-500 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:min-h-0 sm:text-[12px]"
      data-4663-live-chat-enter-prompt
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        requestParticipationEnter();
      }}
    >
      enter a name to speak
    </button>
  );
}

function ChatComposer({
  sending,
  sendError,
  onSend,
  onClearError,
}: {
  sending: boolean;
  sendError: string | null;
  onSend: (body: string) => Promise<boolean>;
  onClearError: () => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useInteractiveControlProtection<HTMLInputElement>();
  const sendRef = useInteractiveControlProtection<HTMLButtonElement>();
  const canSend = draft.trim().length > 0 && !sending;

  // IC3.7 — chat lives under #4663-world scale; counter-scale + ≥16px mobile type.
  const counterScale = useMemo(() => {
    const scale = getCanvasPlacementSnapshot()?.camera.scale ?? 1;
    return worldScaleCounterScale(scale);
  }, []);

  async function submit(): Promise<void> {
    const body = draft.trim();
    if (!body || sending) return;
    const ok = await onSend(body);
    if (ok) setDraft("");
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form
      className="flex flex-col gap-1"
      data-4663-live-chat-composer
      data-4663-live-chat-composer-counter-scale={String(counterScale)}
      style={{
        transform: `scale(${counterScale})`,
        transformOrigin: "left bottom",
      }}
      onSubmit={onSubmit}
      onPointerDown={stopPlayhtmlMoveStart}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          placeholder="say something..."
          disabled={sending}
          autoComplete="off"
          spellCheck={false}
          className={`min-h-11 min-w-0 flex-1 border-0 bg-transparent p-0 font-mono ${MOBILE_SAFE_COMPOSER_INPUT_CLASS} leading-snug tracking-wide text-neutral-800 outline-none placeholder:text-neutral-400 focus-visible:outline-none sm:min-h-0`}
          data-4663-live-chat-input
          onChange={(event) => {
            onClearError();
            setDraft(event.target.value.slice(0, CHAT_MESSAGE_MAX_LENGTH));
          }}
          onKeyDown={onKeyDown}
          onPointerDown={stopPlayhtmlMoveStart}
          onMouseDown={stopPlayhtmlMoveStart}
          onTouchStart={stopPlayhtmlMoveStart}
        />
        <button
          ref={sendRef}
          type="submit"
          disabled={!canSend}
          className="min-h-11 shrink-0 touch-manipulation px-1 font-mono text-[11px] tracking-wide text-neutral-500 enabled:hover:text-neutral-800 disabled:text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:min-h-0 sm:text-[12px]"
          data-4663-live-chat-send
          aria-label="Send message"
          onPointerDown={stopPlayhtmlMoveStart}
          onMouseDown={stopPlayhtmlMoveStart}
          onTouchStart={stopPlayhtmlMoveStart}
        >
          SEND
        </button>
      </div>
      {sendError ? (
        <span
          className="text-[10px] tracking-wide text-neutral-400"
          data-4663-live-chat-send-error
        >
          {sendError}
        </span>
      ) : null}
    </form>
  );
}

function viewportFromWindow(): LiveChatViewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function useDesktopCanvasChrome(): boolean {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(DESKTOP_CHROME_MEDIA_QUERY);
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return desktop;
}

function useDesktopLiveChatSize(desktopChrome: boolean): {
  size: LiveChatSize;
  onResize: (next: LiveChatSize) => void;
  viewport: () => LiveChatViewport;
} {
  const [size, setSize] = useState<LiveChatSize>(LIVE_CHAT_DEFAULT_SIZE);

  const viewport = useCallback((): LiveChatViewport => viewportFromWindow(), []);

  useEffect(() => {
    if (!desktopChrome) return;
    setSize(readLiveChatSize(window.sessionStorage, viewportFromWindow()));
  }, [desktopChrome]);

  useEffect(() => {
    if (!desktopChrome) return;
    const onWindowResize = () => {
      const nextViewport = viewportFromWindow();
      setSize((current) => {
        const next = clampLiveChatSize(current, nextViewport);
        writeLiveChatSize(next, window.sessionStorage, nextViewport);
        return next;
      });
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, [desktopChrome]);

  const onResize = useCallback((next: LiveChatSize) => {
    setSize(next);
  }, []);

  return { size, onResize, viewport };
}

function useChatHereLabel(): string {
  const [summary, setSummary] = useState<PresenceSummaryResponse | null>(null);

  useEffect(() => {
    const poller = startPresenceSummaryPolling({
      fetchSummary: () => fetchPresenceSummaryJson(),
      setIntervalFn: (handler, ms) => window.setInterval(handler, ms),
      clearIntervalFn: (id) => window.clearInterval(id as number),
      onUpdate: setSummary,
    });
    return () => {
      poller.stop();
    };
  }, []);

  return formatPresenceHereLabel(summary ? summary.liveUsers : null);
}

export function LiveChatContent() {
  const { isParticipating, self } = useParticipation();
  const { messages, sending, sendError, send, clearSendError } = useLiveChat();
  const hereLabel = useChatHereLabel();
  const desktopChrome = useDesktopCanvasChrome();
  const { size, onResize, viewport } = useDesktopLiveChatSize(desktopChrome);
  const listRef = useInteractiveControlProtection<HTMLUListElement>();
  const bodyRef = useInteractiveControlProtection<HTMLDivElement>();
  const stickToBottomRef = useRef(true);
  const named = isParticipating && self !== null;

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, listRef]);

  return (
    <section
      className="pointer-events-auto relative flex h-[15rem] w-[min(22.5rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-sm border border-neutral-300/70 bg-[color:color-mix(in_srgb,var(--canvas-bg,#ffffff)_88%,#171717_12%)] font-mono text-neutral-800 sm:h-[16rem] sm:w-[23rem]"
      data-4663-live-chat
      aria-label="4663 live chat"
      style={
        desktopChrome
          ? { width: `${size.width}px`, height: `${size.height}px` }
          : undefined
      }
    >
      <header
        className="flex shrink-0 cursor-grab items-baseline justify-between gap-3 px-3 pb-2 pt-2.5 active:cursor-grabbing"
        data-4663-live-chat-header
        data-4663-live-chat-drag
      >
        <span
          className="text-[11px] tracking-wide text-neutral-800 sm:text-[12px]"
          data-4663-live-chat-title
        >
          CHAT
        </span>
        <span
          className="text-[10px] tracking-wide text-neutral-400 sm:text-[11px]"
          data-4663-live-chat-here
        >
          {hereLabel}
        </span>
      </header>

      <div
        ref={bodyRef}
        className="flex min-h-0 flex-1 flex-col px-3 pb-2.5"
        data-4663-live-chat-body
        onPointerDown={stopPlayhtmlMoveStart}
        onMouseDown={stopPlayhtmlMoveStart}
        onTouchStart={stopPlayhtmlMoveStart}
      >
        <ul
        ref={listRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain border-t border-neutral-300/50 pt-2.5 [scrollbar-width:thin] [scrollbar-color:rgb(212_212_212)_transparent]"
        data-4663-live-chat-list
        onScroll={(event) => {
          const el = event.currentTarget;
          const distance =
            el.scrollHeight - el.scrollTop - el.clientHeight;
          stickToBottomRef.current = distance < 24;
        }}
        onPointerDown={stopPlayhtmlMoveStart}
        onMouseDown={stopPlayhtmlMoveStart}
        onTouchStart={stopPlayhtmlMoveStart}
      >
        {messages.length === 0 ? (
          <li
            className="py-4 text-[11px] tracking-wide text-neutral-400 sm:text-[12px]"
            data-4663-live-chat-empty
          >
            No messages yet.
          </li>
        ) : (
          messages.map((message) => (
            <ChatMessageRow key={message.id} message={message} />
          ))
        )}
      </ul>

      <div
        className="mt-2 shrink-0 border-t border-neutral-300/50 pt-2 desktop-chrome:pr-6"
        data-4663-live-chat-footer
      >
        {named && self ? (
          <ChatComposer
            sending={sending}
            sendError={sendError}
            onClearError={clearSendError}
            onSend={async (body) => {
              const result = await send({
                sessionId: self.sessionId,
                displayName: self.displayName,
                colour: self.colour,
                body,
              });
              return result.ok;
            }}
          />
        ) : (
          <ChatEnterPrompt />
        )}
      </div>
      </div>
      {desktopChrome ? (
        <LiveChatResizeHandle
          size={size}
          onResize={onResize}
          viewport={viewport}
        />
      ) : null}
    </section>
  );
}

export function LiveChatObject({ movableChrome = false }: LiveChatObjectProps) {
  return (
    <div
      id={LIVE_CHAT_ELEMENT_ID}
      className={liveChatHostClassName(movableChrome)}
      style={LIVE_CHAT_DEFAULT_STYLE}
      data-4663-live-chat-host
    >
      <LiveChatContent />
    </div>
  );
}
