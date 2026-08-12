"use client";

/**
 * Shared SUMMON controller — PlayHTML ephemeral events + local resolve.
 * Mount only under PlayProvider.
 */

import { usePlayContext } from "@playhtml/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SummonLayerItem } from "@/components/canvas/summon-layer";
import {
  assignSummonSlots,
  canDispatchSummon,
  createSummonPayload,
  parseSummonPayload,
  PLAYHTML_SUMMON_EVENT_TYPE,
  resolveSummonEvents,
  selectSummonEventIds,
  shouldApplySummon,
  SUMMON_COOLDOWN_MS,
  SUMMON_LIFETIME_MS,
  suppressLiveDuplicates,
  type SummonPayload,
} from "@/lib/canvas/summon";
import { isEventVisibleByAge } from "@/lib/canvas/visible-events";
import { fetchRecentPublicEvents } from "@/lib/events/fetch-recent";
import type { PublicEvent } from "@/lib/events/types";

export type UseSummonControllerResult = {
  summonId: string | null;
  items: readonly SummonLayerItem[];
  onSummon: () => void;
};

type ActiveSummon = {
  summonId: string;
  startedAt: number;
  eventIds: string[];
  resolved: PublicEvent[];
};

export function useSummonController(
  events: readonly PublicEvent[],
  nowMs: number,
): UseSummonControllerResult {
  const { dispatchPlayEvent, registerPlayEventListener, removePlayEventListener } =
    usePlayContext();

  const [active, setActive] = useState<ActiveSummon | null>(null);

  const activeSummonIdRef = useRef<string | null>(null);
  const lastDispatchAtRef = useRef<number | null>(null);
  const eventsRef = useRef(events);
  const applyRef = useRef<(payload: SummonPayload) => void>(() => {});

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    async function applyPayload(payload: SummonPayload): Promise<void> {
      const nowMs = Date.now();
      const decision = shouldApplySummon({
        payload,
        activeSummonId: activeSummonIdRef.current,
        nowMs,
      });
      if (decision !== "apply") return;

      activeSummonIdRef.current = payload.summonId;

      const local = eventsRef.current;
      let resolved = resolveSummonEvents(payload.eventIds, local);
      const missing = payload.eventIds.some(
        (id) => !resolved.some((event) => event.id === id),
      );

      if (missing) {
        try {
          const recovered = await fetchRecentPublicEvents();
          resolved = resolveSummonEvents(payload.eventIds, local, recovered);
        } catch {
          // keep partial resolve
        }
      }

      const liveIds = new Set(
        local
          .filter((event) => isEventVisibleByAge(event, Date.now()))
          .map((event) => event.id),
      );
      resolved = suppressLiveDuplicates(resolved, liveIds);

      setActive({
        summonId: payload.summonId,
        startedAt: payload.startedAt,
        eventIds: payload.eventIds,
        resolved,
      });
    }

    applyRef.current = (payload) => {
      void applyPayload(payload);
    };

    const listenerId = registerPlayEventListener(PLAYHTML_SUMMON_EVENT_TYPE, {
      onEvent: (raw) => {
        const payload = parseSummonPayload(raw);
        if (!payload) return;
        void applyPayload(payload);
      },
    });

    return () => {
      removePlayEventListener(PLAYHTML_SUMMON_EVENT_TYPE, listenerId);
    };
  }, [registerPlayEventListener, removePlayEventListener]);

  useEffect(() => {
    if (!active) return;
    const remaining = Math.max(
      0,
      SUMMON_LIFETIME_MS - (Date.now() - active.startedAt),
    );
    const id = window.setTimeout(() => {
      if (activeSummonIdRef.current === active.summonId) {
        activeSummonIdRef.current = null;
      }
      setActive((current) =>
        current?.summonId === active.summonId ? null : current,
      );
    }, remaining);
    return () => window.clearTimeout(id);
  }, [active]);

  const liveIds = useMemo(() => {
    return new Set(
      events
        .filter((event) => isEventVisibleByAge(event, nowMs))
        .map((event) => event.id),
    );
  }, [events, nowMs]);

  const items = useMemo(() => {
    if (!active) return [];
    const visible = suppressLiveDuplicates(active.resolved, liveIds);
    return assignSummonSlots(visible);
  }, [active, liveIds]);

  function onSummon(): void {
    const nowMs = Date.now();
    if (!canDispatchSummon(lastDispatchAtRef.current, nowMs, SUMMON_COOLDOWN_MS)) {
      return;
    }

    const eventIds = selectSummonEventIds(eventsRef.current, nowMs);
    const payload = createSummonPayload(eventIds);
    if (!payload) return;

    lastDispatchAtRef.current = nowMs;

    try {
      dispatchPlayEvent({
        type: PLAYHTML_SUMMON_EVENT_TYPE,
        eventPayload: payload,
      });
    } catch {
      // fall through to local apply
    }

    // Initiator fallback if room does not echo to self — deduped by summonId.
    applyRef.current(payload);
  }

  return {
    summonId: active?.summonId ?? null,
    items,
    onSummon,
  };
}
