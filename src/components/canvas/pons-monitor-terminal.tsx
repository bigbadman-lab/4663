"use client";

/**
 * Live PONS monitoring terminal — telemetry only.
 * Separate from the curated continuation watchlist object.
 */

import { usePonsMonitor } from "@/components/canvas/use-pons-monitor";
import { formatShortAddress } from "@/lib/canvas/format-address";
import { CHAIN_ID } from "@/lib/pons/constants";
import type { PonsMonitorItem } from "@/lib/pons/monitor";

/** Stable PlayHTML / DOM id — distinct from the watchlist object id. */
export const PONS_MONITOR_TERMINAL_ELEMENT_ID =
  "4663-pons-monitor-terminal" as const;

/** Default home-region CSS origin (clear of watchlist object at 22%/32%). */
export const PONS_MONITOR_TERMINAL_DEFAULT_STYLE = {
  left: "48%",
  top: "36%",
} as const;

export type PonsMonitorTerminalProps = {
  movableChrome?: boolean;
};

export function ponsMonitorTerminalHostClassName(
  movableChrome: boolean,
): string {
  return movableChrome
    ? "pointer-events-auto absolute z-[15] cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "absolute z-[15] select-none";
}

function formatUtcClock(iso: string | null): string {
  if (!iso) return "--:--:--";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "--:--:--";
  return new Date(ms).toISOString().slice(11, 19);
}

function formatHead(chainHead: number | null): string {
  if (chainHead === null) return "—";
  return String(chainHead);
}

function statusLabel(status: PonsMonitorItem["status"]): string {
  return status === "activity" ? "ACTIVITY" : "WATCHING";
}

export function PonsMonitorTerminalContent() {
  const { items, activeCount, chainHead, status } = usePonsMonitor();
  const live = status !== "error" || items.length > 0;

  return (
    <section
      className="pointer-events-none flex h-[13.5rem] w-[20rem] flex-col overflow-hidden rounded-md border border-neutral-700/80 bg-neutral-950/90 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-neutral-200 shadow-sm backdrop-blur-[1px] sm:h-[14rem] sm:w-[21rem] sm:text-[11px]"
      data-4663-pons-monitor-terminal
      aria-label="4663 PONS live monitor"
    >
      <header className="flex shrink-0 items-baseline justify-between gap-2 border-b border-neutral-800 pb-1.5 tracking-wide">
        <span className="text-neutral-100" data-4663-pons-monitor-title>
          4663 / PONS MONITOR
        </span>
        <span className="text-neutral-500" data-4663-pons-monitor-chain>
          CHAIN {CHAIN_ID}
        </span>
      </header>

      <div className="mt-1.5 flex shrink-0 items-center gap-2 tracking-wide">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            live ? "bg-emerald-500/90" : "bg-neutral-500"
          }`}
          aria-hidden
          data-4663-pons-monitor-live-dot
        />
        <span
          className={live ? "text-neutral-300" : "text-neutral-500"}
          data-4663-pons-monitor-live-label
        >
          {live ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      <div
        className="mt-2 min-h-0 flex-1 overflow-hidden transition-opacity duration-300"
        data-4663-pons-monitor-rows
      >
        {items.length === 0 ? (
          <div
            className="flex h-full flex-col justify-center gap-1 text-neutral-500"
            data-4663-pons-monitor-empty
          >
            <span>NO ACTIVE LAUNCHES</span>
            <span>MONITORING PONS…</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li
                key={item.tokenAddress}
                className="flex items-baseline gap-2 tabular-nums text-neutral-300"
                data-4663-pons-monitor-row={item.tokenAddress}
                data-4663-pons-monitor-row-status={item.status}
              >
                <span className="w-[4.5rem] shrink-0 text-neutral-500">
                  {formatUtcClock(item.launchTimestamp)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {formatShortAddress(item.tokenAddress)}
                </span>
                <span className="shrink-0 text-neutral-400">
                  {statusLabel(item.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer
        className="mt-2 flex shrink-0 items-baseline justify-between gap-2 border-t border-neutral-800 pt-1.5 tracking-wide text-neutral-500"
        data-4663-pons-monitor-footer
      >
        <span data-4663-pons-monitor-count>
          WATCHING {activeCount}
        </span>
        <span data-4663-pons-monitor-head>
          HEAD {formatHead(chainHead)}
        </span>
      </footer>
    </section>
  );
}

/** Static (non-PlayHTML) host for fallback shell. */
export function PonsMonitorTerminal({
  movableChrome = false,
}: PonsMonitorTerminalProps) {
  return (
    <div
      id={PONS_MONITOR_TERMINAL_ELEMENT_ID}
      className={ponsMonitorTerminalHostClassName(movableChrome)}
      style={PONS_MONITOR_TERMINAL_DEFAULT_STYLE}
      data-4663-pons-monitor-terminal-host
    >
      <div className="-translate-x-1/2 -translate-y-1/2">
        <PonsMonitorTerminalContent />
      </div>
    </div>
  );
}
