"use client";

/**
 * Live chat object content — global room UI (not canvas TEXT).
 * Presentation: compact retro BBS/IRC window (humans), distinct from PONS terminal (machine).
 * IC3.6 — input / send / ENTER / EVM copy use interactive-control protection.
 */

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PonsAddressCopyControl } from "@/components/canvas/pons-address-copy-control";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { splitTextWithEvmAddresses } from "@/lib/canvas/format-address";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
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
    ? "pointer-events-auto absolute z-[15] cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "absolute z-[15] select-none";
}

/** Compact UTC HH:MM from createdAt — presentation only. */
export function formatChatClock(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "--:--";
  return new Date(ms).toISOString().slice(11, 16);
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
    <span
      className="min-w-0 flex-1 whitespace-pre-wrap break-words text-neutral-300"
      data-4663-live-chat-body
    >
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }
        return (
          <span
            key={`a-${index}-${segment.value}`}
            className="pointer-events-auto inline-flex max-w-full flex-col items-start align-baseline"
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
              <span className="font-mono text-[9px] uppercase tracking-wide text-neutral-500">
                copied
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function ChatMessageRow({ message }: { message: ChatMessage }) {
  return (
    <li
      className="flex items-baseline gap-x-2 gap-y-0.5 leading-snug"
      data-4663-live-chat-row={message.id}
    >
      <span
        className="w-[2.75rem] shrink-0 tabular-nums tracking-wide text-neutral-600"
        data-4663-live-chat-time
      >
        {formatChatClock(message.createdAt)}
      </span>
      <span
        className="w-[4.75rem] shrink-0 truncate tracking-wide"
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
      className="flex w-full touch-manipulation items-baseline gap-2 text-left font-mono text-[10px] tracking-wide text-neutral-500 hover:text-neutral-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 sm:text-[11px]"
      data-4663-live-chat-enter-prompt
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        requestParticipationEnter();
      }}
    >
      <span className="shrink-0 text-neutral-600" aria-hidden>
        &gt;
      </span>
      <span>ENTER A NAME TO SPEAK</span>
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
      onSubmit={onSubmit}
      onPointerDown={stopPlayhtmlMoveStart}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-neutral-500" aria-hidden>
          &gt;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          placeholder="SAY SOMETHING..."
          disabled={sending}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[10px] tracking-wide text-neutral-200 outline-none placeholder:text-neutral-600 focus-visible:outline-none sm:text-[11px]"
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
          className="shrink-0 touch-manipulation font-mono text-[10px] tracking-wide text-neutral-400 enabled:hover:text-neutral-100 disabled:text-neutral-700 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 sm:text-[11px]"
          data-4663-live-chat-send
          aria-label="Send message"
          onPointerDown={stopPlayhtmlMoveStart}
          onMouseDown={stopPlayhtmlMoveStart}
          onTouchStart={stopPlayhtmlMoveStart}
        >
          [ SEND ]
        </button>
      </div>
      {sendError ? (
        <span
          className="pl-4 text-[10px] tracking-wide text-neutral-600"
          data-4663-live-chat-send-error
        >
          {sendError}
        </span>
      ) : null}
    </form>
  );
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
  const listRef = useInteractiveControlProtection<HTMLUListElement>();
  const stickToBottomRef = useRef(true);
  const named = isParticipating && self !== null;

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, listRef]);

  return (
    <section
      className="pointer-events-auto relative flex h-[15rem] w-[min(22.5rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-none border border-neutral-600/90 bg-[#0c0c0c]/92 px-2.5 py-2 font-mono text-[10px] leading-snug text-neutral-300 sm:h-[16rem] sm:w-[23rem] sm:text-[11px]"
      data-4663-live-chat
      aria-label="4663 live chat"
    >
      {/* Extremely faint horizontal scanlines — typography/layout carry the retro feel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)",
        }}
        data-4663-live-chat-scanlines
      />

      <header
        className="relative z-[1] flex shrink-0 cursor-grab items-baseline justify-between gap-2 border-b border-neutral-700 pb-1.5 uppercase tracking-[0.12em] active:cursor-grabbing"
        data-4663-live-chat-header
      >
        <span className="text-neutral-100" data-4663-live-chat-title>
          4663 // GLOBAL CHAT
        </span>
        <span className="text-neutral-500" data-4663-live-chat-here>
          {hereLabel}
        </span>
      </header>

      <p
        className="relative z-[1] mt-1.5 shrink-0 tracking-wide text-neutral-600"
        data-4663-live-chat-system
      >
        -- GLOBAL LINE OPEN --
      </p>

      <ul
        ref={listRef}
        className="relative z-[1] mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgb(64_64_64)_transparent]"
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
            className="py-3 tracking-wide text-neutral-700"
            data-4663-live-chat-empty
          >
            waiting for signal…
          </li>
        ) : (
          messages.map((message) => (
            <ChatMessageRow key={message.id} message={message} />
          ))
        )}
      </ul>

      <div
        className="relative z-[1] mt-1.5 shrink-0 border-t border-neutral-700 pt-1.5"
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
      <div className="-translate-x-1/2 -translate-y-1/2">
        <LiveChatContent />
      </div>
    </div>
  );
}
