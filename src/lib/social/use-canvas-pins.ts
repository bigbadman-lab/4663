"use client";

/**
 * Social 7 — durable PIN client state (fetch + realtime INSERT + local expiry).
 * Not session-ephemeral: do not register with LEAVE/RESET/Presence cleanup.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/events/supabase-browser";
import {
  canvasPinFromRow,
  isPinActive,
  pinnedEventIdSet,
  pruneExpiredPins,
  upsertCanvasPin,
  type CanvasPin,
} from "@/lib/social/canvas-pin";
import {
  fetchActiveCanvasPins,
  postCanvasPin,
  type PostCanvasPinInput,
} from "@/lib/social/fetch-pins";
import { createPinsRealtimeClient } from "@/lib/social/pins-realtime";

const EXPIRY_TICK_MS = 5_000;

export type UseCanvasPinsResult = {
  pins: readonly CanvasPin[];
  pinnedEventIds: ReadonlySet<string>;
  isPinned: (eventId: string) => boolean;
  createPin: (
    input: PostCanvasPinInput,
  ) => Promise<{ ok: true; pin: CanvasPin } | { ok: false; error: string }>;
};

export function useCanvasPins(): UseCanvasPinsResult {
  const [pins, setPins] = useState<CanvasPin[]>([]);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  useEffect(() => {
    const ac = new AbortController();
    void fetchActiveCanvasPins(fetch, ac.signal)
      .then((next) => {
        if (!ac.signal.aborted) {
          setPins(pruneExpiredPins(next, Date.now()));
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      const supabase = getBrowserSupabaseClient();
      const client = createPinsRealtimeClient(supabase);
      const sub = client.subscribeInserts({
        onInsert: (row) => {
          const pin = canvasPinFromRow(row);
          if (!pin) return;
          if (!isPinActive(pin, Date.now())) return;
          setPins((prev) => upsertCanvasPin(prev, pin));
        },
        onStatus: () => {},
      });
      unsub = sub.unsubscribe;
    } catch {
      // env missing
    }
    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPins((prev) => {
        if (prev.length === 0) return prev;
        const next = pruneExpiredPins(prev, Date.now());
        return next.length === prev.length ? prev : next;
      });
    }, EXPIRY_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const active = useMemo(
    () => pruneExpiredPins(pins, Date.now()),
    [pins],
  );

  const pinnedEventIds = useMemo(
    () => pinnedEventIdSet(active, Date.now()),
    [active],
  );

  const isPinned = (eventId: string) => pinnedEventIds.has(eventId);

  const createPin = async (input: PostCanvasPinInput) => {
    if (pinnedEventIdSet(pinsRef.current).has(input.eventId)) {
      return { ok: false as const, error: "Already pinned." };
    }
    const result = await postCanvasPin(input);
    if (!result.ok) {
      if (result.error === "already_pinned") {
        return { ok: false as const, error: "Already pinned." };
      }
      if (result.error === "not_live") {
        return { ok: false as const, error: "Event is no longer live." };
      }
      return { ok: false as const, error: "Could not pin." };
    }
    setPins((prev) => upsertCanvasPin(prev, result.pin));
    return { ok: true as const, pin: result.pin };
  };

  return {
    pins: active,
    pinnedEventIds,
    isPinned,
    createPin,
  };
}
