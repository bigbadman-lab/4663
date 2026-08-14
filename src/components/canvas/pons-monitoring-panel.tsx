"use client";

/**
 * RADAR panel — today's continuation-qualified tokens + on-demand detail.
 */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PonsAddressCopyControl } from "@/components/canvas/pons-address-copy-control";
import {
  robinhoodChainAddressExplorerUrl,
  robinhoodChainBlockExplorerUrl,
  robinhoodChainTokenExplorerUrl,
  robinhoodChainTxExplorerUrl,
} from "@/lib/canvas/blockscout";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { formatShortAddress } from "@/lib/canvas/format-address";
import { formatRelativeTimeAgo } from "@/lib/canvas/format-relative-time";
import { OFFICIAL_CONTRACT_COPIED_MS } from "@/lib/token/official";
import {
  continuationWhyCopy,
  type ContinuationWatchlistToken,
} from "@/lib/events/continuation-watchlist";
import type {
  RadarTimelineEntry,
  RadarTokenDetail,
} from "@/lib/events/radar-token-detail";

type PonsMonitoringPanelProps = {
  tokens: readonly ContinuationWatchlistToken[];
  onClose: () => void;
  /** When set, open directly to this token's detail. */
  initialTokenAddress?: string | null;
  onClearSelection?: () => void;
  nowMs?: number;
};

function ExternalLink({
  href,
  children,
  testId,
}: {
  href: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[11px] tracking-wide text-neutral-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      data-4663-radar-explorer={testId}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

function RadarList({
  tokens,
  relativeNow,
  onInvestigate,
}: {
  tokens: readonly ContinuationWatchlistToken[];
  relativeNow: number;
  onInvestigate: (tokenAddress: string) => void;
}) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedAddress) return;
    const id = window.setTimeout(
      () => setCopiedAddress(null),
      OFFICIAL_CONTRACT_COPIED_MS,
    );
    return () => window.clearTimeout(id);
  }, [copiedAddress]);

  const countLabel =
    tokens.length === 1
      ? "1 token currently on our radar."
      : `${tokens.length} tokens currently on our radar.`;

  return (
    <div data-4663-radar-list>
      <p className="font-mono text-sm font-semibold tracking-tight text-neutral-900">
        ON OUR RADAR
      </p>
      {tokens.length > 0 ? (
        <p className="mt-1 font-mono text-[11px] tracking-wide text-neutral-500">
          {countLabel}
        </p>
      ) : null}
      <p className="mt-2 font-mono text-[11px] leading-snug tracking-wide text-neutral-500">
        Not a signal to buy — something to investigate.
      </p>

      {tokens.length === 0 ? (
        <p
          className="mt-4 font-mono text-[12px] leading-relaxed tracking-wide text-neutral-600 sm:text-[13px]"
          data-4663-pons-monitoring-empty
        >
          Nothing has crossed our radar today yet.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4" data-4663-pons-monitoring-list>
          {tokens.map((token) => (
            <li
              key={token.eventId || token.tokenAddress}
              className="border-t border-neutral-200 pt-3 first:border-t-0 first:pt-0"
              data-4663-pons-monitoring-item={token.tokenAddress}
              data-4663-radar-event={token.eventId}
            >
              <p className="font-mono text-[10px] tracking-wide text-neutral-400">
                TOKEN / ADDRESS
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <PonsAddressCopyControl
                  tokenAddress={token.tokenAddress}
                  onCopy={() => {
                    void copyTextQuiet(token.tokenAddress).then((ok) => {
                      if (ok) setCopiedAddress(token.tokenAddress);
                    });
                  }}
                />
                {copiedAddress === token.tokenAddress ? (
                  <span
                    className="font-mono text-[10px] tracking-wide text-neutral-500"
                    data-4663-radar-copied
                  >
                    COPIED
                  </span>
                ) : null}
              </div>

              {token.launchTimestamp ? (
                <p className="mt-2 font-mono text-[11px] tracking-wide text-neutral-500">
                  LAUNCHED{" "}
                  <span className="text-neutral-800">
                    {formatRelativeTimeAgo(token.launchTimestamp, relativeNow)}
                  </span>
                </p>
              ) : null}

              <p className="mt-1 font-mono text-[11px] tracking-wide text-neutral-500">
                CONTINUATION{" "}
                <span className="text-neutral-800">
                  {token.continuationBuyerCount} new first buyers
                </span>
              </p>

              <p className="mt-2 font-mono text-[10px] tracking-wide text-neutral-400">
                WHY IT&apos;S ON OUR RADAR
              </p>
              <p className="mt-0.5 font-mono text-[11px] leading-snug tracking-wide text-neutral-600">
                {continuationWhyCopy(token.continuationBuyerCount)}
              </p>

              <button
                type="button"
                className="mt-3 inline-flex min-h-11 items-center font-mono text-[11px] tracking-wide text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
                data-4663-radar-investigate
                onClick={() => onInvestigate(token.tokenAddress)}
              >
                [ TAKE A CLOSER LOOK ]
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TimelineRow({ entry }: { entry: RadarTimelineEntry }) {
  return (
    <li
      className="border-t border-neutral-100 pt-2 first:border-t-0 first:pt-0"
      data-4663-radar-timeline-kind={entry.kind}
    >
      <p className="font-mono text-[10px] font-semibold tracking-wide text-neutral-800">
        {entry.label}
      </p>
      <p className="mt-0.5 break-all font-mono text-[10px] tracking-wide text-neutral-500">
        {entry.at}
        {entry.ageSeconds !== null ? ` · +${entry.ageSeconds}s` : ""}
      </p>
      {entry.walletAddress ? (
        <p className="mt-1 font-mono text-[11px] tracking-wide text-neutral-600">
          <ExternalLink
            href={robinhoodChainAddressExplorerUrl(entry.walletAddress)}
            testId="wallet"
          >
            {formatShortAddress(entry.walletAddress)}
          </ExternalLink>
        </p>
      ) : null}
      {entry.txHash ? (
        <p className="mt-1">
          <ExternalLink
            href={robinhoodChainTxExplorerUrl(entry.txHash)}
            testId="tx"
          >
            TX {formatShortAddress(entry.txHash)}
          </ExternalLink>
        </p>
      ) : null}
    </li>
  );
}

function RadarDetail({
  tokenAddress,
  onBack,
  relativeNow,
}: {
  tokenAddress: string;
  onBack: () => void;
  relativeNow: number;
}) {
  const [detail, setDetail] = useState<RadarTokenDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/pons/token/${encodeURIComponent(tokenAddress)}`,
          { method: "GET", cache: "no-store" },
        );
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setError(res.status === 404 ? "not_found" : "unavailable");
          return;
        }
        const body = (await res.json()) as RadarTokenDetail;
        if (cancelled) return;
        setDetail(body);
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), OFFICIAL_CONTRACT_COPIED_MS);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <div data-4663-radar-detail={tokenAddress}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center font-mono text-[11px] tracking-wide text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        data-4663-radar-back
        onClick={onBack}
      >
        [ BACK ]
      </button>

      {status === "loading" ? (
        <p className="mt-4 font-mono text-[12px] text-neutral-500">Loading…</p>
      ) : null}

      {status === "error" ? (
        <p className="mt-4 font-mono text-[12px] text-neutral-600">
          {error === "not_found"
            ? "This token is not on our radar."
            : "Couldn’t load investigation details."}
        </p>
      ) : null}

      {detail ? (
        <div className="mt-3 space-y-5 font-mono text-[12px] tracking-wide text-neutral-600">
          <section>
            <p className="text-[10px] text-neutral-400">TOKEN</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <PonsAddressCopyControl
                tokenAddress={detail.tokenAddress}
                onCopy={() => {
                  void copyTextQuiet(detail.tokenAddress).then((ok) => {
                    if (ok) setCopied(true);
                  });
                }}
              />
              {copied ? (
                <span className="text-[10px] text-neutral-500">COPIED</span>
              ) : null}
            </div>
            <p className="mt-2">
              <ExternalLink
                href={robinhoodChainTokenExplorerUrl(detail.tokenAddress)}
                testId="token"
              >
                Open on Blockscout
              </ExternalLink>
            </p>
          </section>

          <section>
            <p className="text-[10px] text-neutral-400">LAUNCH</p>
            {detail.launchTimestamp ? (
              <p className="mt-1 text-neutral-800">
                {formatRelativeTimeAgo(detail.launchTimestamp, relativeNow)}
                <span className="mt-0.5 block break-all text-[10px] text-neutral-500">
                  {detail.launchTimestamp}
                </span>
              </p>
            ) : (
              <p className="mt-1">Launch time unavailable.</p>
            )}
            {detail.launchBlockNumber !== null ? (
              <p className="mt-1">
                Block{" "}
                <ExternalLink
                  href={robinhoodChainBlockExplorerUrl(detail.launchBlockNumber)}
                  testId="block"
                >
                  {detail.launchBlockNumber}
                </ExternalLink>
              </p>
            ) : null}
            {detail.launchTxHash ? (
              <p className="mt-1">
                <ExternalLink
                  href={robinhoodChainTxExplorerUrl(detail.launchTxHash)}
                  testId="launch-tx"
                >
                  Launch TX {formatShortAddress(detail.launchTxHash)}
                </ExternalLink>
              </p>
            ) : null}
            {detail.marketAddress ? (
              <p className="mt-1 break-all">
                Market{" "}
                <ExternalLink
                  href={robinhoodChainAddressExplorerUrl(detail.marketAddress)}
                  testId="market"
                >
                  {formatShortAddress(detail.marketAddress)}
                </ExternalLink>
              </p>
            ) : null}
            {detail.factoryVersion ? (
              <p className="mt-1 text-neutral-800">
                PONS {detail.factoryVersion.toUpperCase()}
              </p>
            ) : null}
          </section>

          <section>
            <p className="text-[10px] text-neutral-400">WHY IT&apos;S ON OUR RADAR</p>
            <p className="mt-1 text-neutral-800">
              {detail.pre3mFirstBuyers} first buyer
              {detail.pre3mFirstBuyers === 1 ? "" : "s"} before 3 minutes ·{" "}
              {detail.continuationFirstBuyers} in the 3–5 minute window
            </p>
            <p className="mt-1 break-all text-[10px] text-neutral-500">
              Qualified {formatRelativeTimeAgo(detail.continuationTimestamp, relativeNow)}
              <span className="mt-0.5 block">{detail.continuationTimestamp}</span>
            </p>
            <p className="mt-2 text-[11px] leading-snug text-neutral-500">
              Not a signal to buy — something to investigate.
            </p>
          </section>

          <section>
            <p className="text-[10px] text-neutral-400">FIRST-BUYER ACTIVITY</p>
            <ul className="mt-1 space-y-0.5 text-neutral-800">
              <li>Before 3 minutes: {detail.pre3mFirstBuyers}</li>
              <li>Continuation window: {detail.continuationFirstBuyers}</li>
              <li>Total observed: {detail.totalFirstBuyers}</li>
            </ul>
          </section>

          <section>
            <p className="text-[10px] text-neutral-400">TIMELINE</p>
            <ul className="mt-2 space-y-2" data-4663-radar-timeline>
              {detail.timeline.map((entry, index) => (
                <TimelineRow
                  key={`${entry.kind}:${entry.at}:${entry.txHash ?? index}`}
                  entry={entry}
                />
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function PonsMonitoringPanel({
  tokens,
  onClose,
  initialTokenAddress = null,
  onClearSelection,
  nowMs,
}: PonsMonitoringPanelProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [clockMs, setClockMs] = useState(0);
  const [selectedToken, setSelectedToken] = useState<string | null>(
    initialTokenAddress,
  );
  const lastInitialRef = useRef(initialTokenAddress);

  if (lastInitialRef.current !== initialTokenAddress) {
    lastInitialRef.current = initialTokenAddress;
    setSelectedToken(initialTokenAddress ?? null);
  }

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
      setClockMs(nowMs ?? Date.now());
    });
  }, [nowMs]);

  const relativeNow = nowMs ?? clockMs;
  useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  if (!mounted) return null;

  const showingDetail = selectedToken !== null;

  return createPortal(
    <div
      className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto overscroll-none bg-neutral-900/25 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] sm:p-6"
      data-4663-pons-monitoring-backdrop
      data-4663-radar-panel
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full max-w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-y-auto overscroll-contain border border-neutral-300 bg-white px-4 py-4 text-neutral-900 shadow-sm sm:max-h-[min(40rem,calc(100dvh-3rem))] sm:max-w-md sm:px-6 sm:py-6"
        data-4663-pons-monitoring-panel
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="font-mono text-sm font-semibold tracking-tight"
          >
            RADAR
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end font-mono text-[11px] tracking-wide text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            aria-label="Close"
            data-4663-pons-monitoring-close
          >
            [ CLOSE ]
          </button>
        </div>

        {showingDetail && selectedToken ? (
          <RadarDetail
            key={selectedToken}
            tokenAddress={selectedToken}
            relativeNow={relativeNow}
            onBack={() => {
              setSelectedToken(null);
              onClearSelection?.();
            }}
          />
        ) : (
          <RadarList
            tokens={tokens}
            relativeNow={relativeNow}
            onInvestigate={(address) => setSelectedToken(address)}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
