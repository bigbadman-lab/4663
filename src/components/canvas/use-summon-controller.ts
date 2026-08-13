"use client";

/**
 * Social 5 — SUMMON controller via PlayHTML page data (late-join + mutex).
 * Lifetime is owner-session-bound (no fixed timer).
 */

import { usePageData } from "@playhtml/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SummonLayerItem } from "@/components/canvas/summon-layer";
import {
  ACTIVE_SUMMON_PAGE_DATA_NAME,
  canClaimActiveSummon,
  clearActiveSummonIfOwner,
  createActiveSummonState,
  EMPTY_ACTIVE_SUMMON_PAGE_DATA,
  normalizeActiveSummonPageData,
  retainActiveSummonForPresentOwner,
  type ActiveSummonPageData,
  type ActiveSummonState,
} from "@/lib/canvas/active-summon";
import {
  assignSummonSlots,
  canDispatchSummon,
  resolveSummonEvents,
  selectSummonEventIds,
  SUMMON_COOLDOWN_MS,
  suppressLiveDuplicates,
} from "@/lib/canvas/summon";
import { isEventVisibleByAge } from "@/lib/canvas/visible-events";
import { fetchRecentPublicEvents } from "@/lib/events/fetch-recent";
import type { PublicEvent } from "@/lib/events/types";
import { registerSessionContentResetHandler } from "@/lib/social/session-content-reset";
import { registerSessionEndedHandler } from "@/lib/social/session-cleanup";
import { useParticipation } from "@/lib/social/use-participation";

export type UseSummonControllerResult = {
  summonId: string | null;
  items: readonly SummonLayerItem[];
  active: ActiveSummonState | null;
  isOwner: boolean;
  canSummon: boolean;
  onSummon: () => void;
  onDismiss: () => void;
};

export function useSummonController(
  events: readonly PublicEvent[],
  nowMs: number,
): UseSummonControllerResult {
  const { self, isParticipating, participants, status } = useParticipation();
  const [pageData, setPageData] = usePageData<ActiveSummonPageData>(
    ACTIVE_SUMMON_PAGE_DATA_NAME,
    EMPTY_ACTIVE_SUMMON_PAGE_DATA,
  );
  const [resolved, setResolved] = useState<PublicEvent[]>([]);

  const pageDataRef = useRef(pageData);
  const setPageDataRef = useRef(setPageData);
  pageDataRef.current = pageData;
  setPageDataRef.current = setPageData;

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const lastDispatchAtRef = useRef<number | null>(null);

  const normalized = normalizeActiveSummonPageData(pageData);
  const active = normalized.active;

  const writePageData = (next: ActiveSummonPageData) => {
    setPageDataRef.current(normalizeActiveSummonPageData(next));
  };

  // Resolve active event ids (with optional recovery fetch).
  useEffect(() => {
    if (!active) {
      setResolved([]);
      return;
    }

    let cancelled = false;

    async function resolveActive(state: ActiveSummonState): Promise<void> {
      const local = eventsRef.current;
      let next = resolveSummonEvents(state.eventIds, local);
      const missing = state.eventIds.some(
        (id) => !next.some((event) => event.id === id || event.id.toLowerCase() === id),
      );
      if (missing) {
        try {
          const recovered = await fetchRecentPublicEvents();
          next = resolveSummonEvents(state.eventIds, local, recovered);
        } catch {
          // keep partial
        }
      }
      if (!cancelled) setResolved(next);
    }

    void resolveActive(active);
    return () => {
      cancelled = true;
    };
  }, [active]);

  // LEAVE: owner clears active SUMMON.
  useEffect(() => {
    return registerSessionEndedHandler(({ sessionId }) => {
      const current = normalizeActiveSummonPageData(pageDataRef.current);
      const next = clearActiveSummonIfOwner(current, sessionId);
      if (next.active !== current.active) {
        writePageData(next);
      }
    });
  }, []);

  // RESET: owner clears active SUMMON only.
  useEffect(() => {
    return registerSessionContentResetHandler(({ sessionId }) => {
      const current = normalizeActiveSummonPageData(pageDataRef.current);
      const next = clearActiveSummonIfOwner(current, sessionId);
      if (next.active !== current.active) {
        writePageData(next);
      }
    });
  }, []);

  // Presence-loss: clear when owner is no longer present.
  useEffect(() => {
    if (status === "connecting" || status === "error") return;

    const present = new Set(participants.map((p) => p.sessionId));
    if (self) present.add(self.sessionId);

    const current = normalizeActiveSummonPageData(pageDataRef.current);
    const next = retainActiveSummonForPresentOwner(current, present);
    if ((next.active?.summonId ?? null) !== (current.active?.summonId ?? null)) {
      writePageData(next);
    }
  }, [participants, self, status]);

  const liveIds = useMemo(() => {
    return new Set(
      events
        .filter((event) => isEventVisibleByAge(event, nowMs))
        .map((event) => event.id),
    );
  }, [events, nowMs]);

  const items = useMemo(() => {
    if (!active) return [];
    const visible = suppressLiveDuplicates(resolved, liveIds);
    // Preserve shared eventIds order for stable slots.
    const byId = new Map(visible.map((e) => [e.id.toLowerCase(), e]));
    const ordered: PublicEvent[] = [];
    for (const id of active.eventIds) {
      const event = byId.get(id);
      if (event) ordered.push(event);
    }
    return assignSummonSlots(ordered);
  }, [active, resolved, liveIds]);

  const presentIds = useMemo(() => {
    const set = new Set(participants.map((p) => p.sessionId));
    if (self) set.add(self.sessionId);
    return set;
  }, [participants, self]);

  const mutexFree = canClaimActiveSummon(normalized, presentIds);
  const isOwner =
    !!self && !!active && active.ownerSessionId === self.sessionId;
  const canSummon =
    isParticipating &&
    !!self &&
    mutexFree &&
    canDispatchSummon(lastDispatchAtRef.current, Date.now(), SUMMON_COOLDOWN_MS);

  function onSummon(): void {
    if (!isParticipating || !self) return;
    const now = Date.now();
    if (!canDispatchSummon(lastDispatchAtRef.current, now, SUMMON_COOLDOWN_MS)) {
      return;
    }

    const current = normalizeActiveSummonPageData(pageDataRef.current);
    const present = new Set(participants.map((p) => p.sessionId));
    present.add(self.sessionId);
    if (!canClaimActiveSummon(current, present)) return;

    const eventIds = selectSummonEventIds(eventsRef.current, now);
    const state = createActiveSummonState({
      ownerSessionId: self.sessionId,
      eventIds,
    });
    if (!state) return;

    lastDispatchAtRef.current = now;
    writePageData({ active: state });
  }

  function onDismiss(): void {
    if (!self) return;
    const current = normalizeActiveSummonPageData(pageDataRef.current);
    const next = clearActiveSummonIfOwner(current, self.sessionId);
    if (next.active !== current.active) {
      writePageData(next);
    }
  }

  return {
    summonId: active?.summonId ?? null,
    items,
    active,
    isOwner,
    canSummon,
    onSummon,
    onDismiss,
  };
}
