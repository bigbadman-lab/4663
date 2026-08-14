"use client";

/**
 * Client poll for live PONS monitoring terminal snapshot.
 * Health 1: pauses while document is hidden; resumes with an immediate fetch.
 */

import { useEffect, useState } from "react";
import {
  browserVisibilityIntervalDeps,
  startVisibilityIntervalPolling,
} from "@/lib/browser/visibility-interval-poll";
import type {
  PonsMonitorItem,
  PonsMonitorResponse,
} from "@/lib/pons/monitor";

/** 8s — within the 5–10s terminal poll band; calmer than worker tick noise. */
export const PONS_MONITOR_POLL_MS = 8_000 as const;

export type UsePonsMonitorResult = {
  items: readonly PonsMonitorItem[];
  activeCount: number;
  chainId: number | null;
  chainHead: number | null;
  generatedAt: string | null;
  status: "loading" | "ready" | "error";
};

function parseMonitorBody(raw: unknown): PonsMonitorResponse | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.generatedAt !== "string") return null;
  if (typeof body.chainId !== "number") return null;
  if (typeof body.activeCount !== "number") return null;
  if (!Array.isArray(body.items)) return null;
  return {
    generatedAt: body.generatedAt,
    chainId: body.chainId,
    chainHead:
      typeof body.chainHead === "number"
        ? body.chainHead
        : body.chainHead === null
          ? null
          : null,
    activeCount: body.activeCount,
    items: body.items as PonsMonitorItem[],
  };
}

export function usePonsMonitor(): UsePonsMonitorResult {
  const [items, setItems] = useState<PonsMonitorItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [chainId, setChainId] = useState<number | null>(null);
  const [chainHead, setChainHead] = useState<number | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [status, setStatus] =
    useState<UsePonsMonitorResult["status"]>("loading");

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let lastGood: PonsMonitorResponse | null = null;

    const apply = (body: PonsMonitorResponse) => {
      setItems(body.items);
      setActiveCount(body.activeCount);
      setChainId(body.chainId);
      setChainHead(body.chainHead);
      setGeneratedAt(body.generatedAt);
      setStatus("ready");
    };

    const load = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/pons/monitor", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) {
            if (lastGood) apply(lastGood);
            else setStatus("error");
          }
          return;
        }
        const parsed = parseMonitorBody(await response.json());
        if (!parsed) {
          if (!cancelled) {
            if (lastGood) apply(lastGood);
            else setStatus("error");
          }
          return;
        }
        lastGood = parsed;
        if (!cancelled) apply(parsed);
      } catch {
        if (!cancelled) {
          if (lastGood) apply(lastGood);
          else setStatus("error");
        }
      } finally {
        inFlight = false;
      }
    };

    const poller = startVisibilityIntervalPolling({
      ...browserVisibilityIntervalDeps(),
      intervalMs: PONS_MONITOR_POLL_MS,
      tick: load,
    });

    return () => {
      cancelled = true;
      poller.stop();
    };
  }, []);

  return { items, activeCount, chainId, chainHead, generatedAt, status };
}
