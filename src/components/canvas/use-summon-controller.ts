"use client";

/**
 * Social 5 — SUMMON controller via PlayHTML page data (late-join + mutex).
 * Lifetime is owner-session-bound (no fixed timer).
 * IC3.5 — local feedback hooks + local HOME after successful write.
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
  shouldDismissActiveSummonOnClick,
  type ActiveSummonPageData,
  type ActiveSummonState,
} from "@/lib/canvas/active-summon";
import type { ControlNoticeKind } from "@/lib/canvas/control-notice";
import { requestLocalHomeView } from "@/lib/canvas/local-home-view";
import {
  assignSummonSlots,
  canDispatchSummon,
  resolveSummonEvents,
  selectSummonEventIds,
  SUMMON_COOLDOWN_MS,
  suppressLiveDuplicates,
} from "@/lib/canvas/summon";
import { isEventVisibleByAge } from "@/lib/canvas/visible-events";
import { fetchSummonHistoryEvents } from "@/lib/events/fetch-summon-history";
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
  summonInFlight: boolean;
  summonCoolingDown: boolean;
  /** Toggle: OFF→ON summons; ON→OFF (owner) clears active set without re-fetch. */
  onSummon: () => void;
};

export type UseSummonControllerOptions = {
  /** Local-only dock notice (empty history / fetch error). */
  onControlNotice?: (kind: ControlNoticeKind) => void;
};

export function useSummonController(
  events: readonly PublicEvent[],
  nowMs: number,
  options: UseSummonControllerOptions = {},
): UseSummonControllerResult {
  const { onControlNotice } = options;
  const { self, isParticipating, participants, status } = useParticipation();
  const [pageData, setPageData] = usePageData<ActiveSummonPageData>(
    ACTIVE_SUMMON_PAGE_DATA_NAME,
    EMPTY_ACTIVE_SUMMON_PAGE_DATA,
  );
  const [resolved, setResolved] = useState<PublicEvent[]>([]);
  const [summonInFlight, setSummonInFlight] = useState(false);
  /** Forces a re-render when local cooldown elapses so the dock re-enables. */
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);

  const pageDataRef = useRef(pageData);
  const setPageDataRef = useRef(setPageData);
  pageDataRef.current = pageData;
  setPageDataRef.current = setPageData;

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const lastDispatchAtRef = useRef<number | null>(null);
  const summonInFlightRef = useRef(false);
  const onControlNoticeRef = useRef(onControlNotice);
  onControlNoticeRef.current = onControlNotice;

  const normalized = useMemo(
    () => normalizeActiveSummonPageData(pageData),
    [pageData],
  );
  const active = normalized.active;
  // Stable identity for effects — normalize() allocates a new active object each call.
  const activeSummonId = active?.summonId ?? null;

  const writePageData = (next: ActiveSummonPageData) => {
    setPageDataRef.current(normalizeActiveSummonPageData(next));
  };

  useEffect(() => {
    if (cooldownUntilMs === null) return;
    const remaining = cooldownUntilMs - Date.now();
    if (remaining <= 0) {
      setCooldownUntilMs(null);
      return;
    }
    const timer = setTimeout(() => {
      setCooldownUntilMs(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [cooldownUntilMs]);

  // Resolve active event ids (with optional recovery fetch).
  useEffect(() => {
    if (!activeSummonId) {
      setResolved((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const state = normalizeActiveSummonPageData(pageDataRef.current).active;
    if (!state || state.summonId !== activeSummonId) {
      setResolved((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    let cancelled = false;

    async function resolveActive(current: ActiveSummonState): Promise<void> {
      const local = eventsRef.current;
      let next = resolveSummonEvents(current.eventIds, local);
      const missing = current.eventIds.some(
        (id) =>
          !next.some(
            (event) => event.id === id || event.id.toLowerCase() === id,
          ),
      );
      if (missing) {
        try {
          const recovered = await fetchSummonHistoryEvents();
          next = resolveSummonEvents(current.eventIds, local, recovered);
        } catch {
          // keep partial
        }
      }
      if (cancelled) return;
      setResolved((prev) => {
        if (
          prev.length === next.length &&
          prev.every((event, i) => event.id === next[i]?.id)
        ) {
          return prev;
        }
        return next;
      });
    }

    void resolveActive(state);
    return () => {
      cancelled = true;
    };
  }, [activeSummonId]);

  // Re-resolve when the public event stream updates, without depending on a
  // freshly allocated `active` object each render.
  useEffect(() => {
    if (!activeSummonId) return;
    const state = normalizeActiveSummonPageData(pageDataRef.current).active;
    if (!state || state.summonId !== activeSummonId) return;
    const next = resolveSummonEvents(state.eventIds, events);
    setResolved((prev) => {
      if (
        prev.length === next.length &&
        prev.every((event, i) => event.id === next[i]?.id)
      ) {
        return prev;
      }
      return next;
    });
  }, [events, activeSummonId]);

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
  const nowWall = Date.now();
  const summonCoolingDown =
    !active &&
    cooldownUntilMs !== null &&
    nowWall < cooldownUntilMs;
  const canSummon =
    isParticipating &&
    !!self &&
    mutexFree &&
    !summonInFlight &&
    canDispatchSummon(lastDispatchAtRef.current, nowWall, SUMMON_COOLDOWN_MS);

  function dismissIfOwner(): void {
    if (!self) return;
    const current = normalizeActiveSummonPageData(pageDataRef.current);
    const next = clearActiveSummonIfOwner(current, self.sessionId);
    if (next.active !== current.active) {
      writePageData(next);
    }
  }

  function onSummon(): void {
    if (!isParticipating || !self) return;

    // ON → OFF: clear owned active set only (no selection / recovery fetch / HOME).
    const current = normalizeActiveSummonPageData(pageDataRef.current);
    if (shouldDismissActiveSummonOnClick(current, self.sessionId)) {
      dismissIfOwner();
      return;
    }

    const now = Date.now();
    if (!canDispatchSummon(lastDispatchAtRef.current, now, SUMMON_COOLDOWN_MS)) {
      return;
    }

    const present = new Set(participants.map((p) => p.sessionId));
    present.add(self.sessionId);
    if (!canClaimActiveSummon(current, present)) return;
    if (summonInFlightRef.current) return;

    const ownerSessionId = self.sessionId;
    summonInFlightRef.current = true;
    setSummonInFlight(true);
    void (async () => {
      try {
        const history = await fetchSummonHistoryEvents();
        // Owner may have left / toggled off while the history request was in flight.
        const latest = normalizeActiveSummonPageData(pageDataRef.current);
        if (shouldDismissActiveSummonOnClick(latest, ownerSessionId)) return;
        if (!canClaimActiveSummon(latest, present)) return;

        const eventIds = selectSummonEventIds(history, Date.now());
        const state = createActiveSummonState({
          ownerSessionId,
          eventIds,
        });
        if (!state) {
          // Empty / integrity-zero history — local feedback only; no cooldown / HOME.
          onControlNoticeRef.current?.("summon-empty");
          return;
        }

        // Preferred order: write shared state → mark cooldown → local HOME.
        writePageData({ active: state });
        lastDispatchAtRef.current = now;
        setCooldownUntilMs(now + SUMMON_COOLDOWN_MS);
        requestLocalHomeView();
      } catch {
        onControlNoticeRef.current?.("summon-error");
      } finally {
        summonInFlightRef.current = false;
        setSummonInFlight(false);
      }
    })();
  }

  return {
    summonId: active?.summonId ?? null,
    items,
    active,
    isOwner,
    canSummon,
    summonInFlight,
    summonCoolingDown,
    onSummon,
  };
}
