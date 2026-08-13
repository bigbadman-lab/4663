"use client";

/**
 * React hook + provider for Social 1B named participation + Social 4 WATCH.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getBrowserSupabaseClient } from "@/lib/events/supabase-browser";
import { ParticipationController } from "@/lib/social/participation-controller";
import { createParticipationPresenceClient } from "@/lib/social/participation-realtime";
import type {
  ParticipationPresencePayload,
  ParticipationSession,
  ParticipationStatus,
} from "@/lib/social/types";
import { isWatchingEvent, watchCountForEvent } from "@/lib/social/watch";

export type UseParticipationResult = {
  status: ParticipationStatus;
  self: ParticipationSession | null;
  participants: ParticipationPresencePayload[];
  isParticipating: boolean;
  enter: (displayName: string) => { ok: true } | { ok: false; error: string };
  leave: () => void;
  isWatching: (eventId: string) => boolean;
  watch: (eventId: string) => { ok: true } | { ok: false; error: string };
  unwatch: (eventId: string) => { ok: true } | { ok: false; error: string };
  toggleWatch: (eventId: string) => { ok: true } | { ok: false; error: string };
  watchCount: (eventId: string) => number;
  pruneWatchedEvents: (liveEventIds: readonly string[]) => void;
};

const ParticipationContext = createContext<UseParticipationResult | null>(
  null,
);

export function ParticipationProvider({ children }: { children: ReactNode }) {
  const value = useParticipationController();
  return (
    <ParticipationContext.Provider value={value}>
      {children}
    </ParticipationContext.Provider>
  );
}

export function useParticipation(): UseParticipationResult {
  const ctx = useContext(ParticipationContext);
  if (!ctx) {
    throw new Error(
      "useParticipation must be used within ParticipationProvider",
    );
  }
  return ctx;
}

function useParticipationController(): UseParticipationResult {
  const [status, setStatus] = useState<ParticipationStatus>("anonymous");
  const [self, setSelf] = useState<ParticipationSession | null>(null);
  const [participants, setParticipants] = useState<
    ParticipationPresencePayload[]
  >([]);
  const [watchedEventIds, setWatchedEventIds] = useState<string[]>([]);
  const controllerRef = useRef<ParticipationController | null>(null);

  useEffect(() => {
    let active: ParticipationController | null = null;

    try {
      const supabase = getBrowserSupabaseClient();
      active = new ParticipationController({
        storage: window.sessionStorage,
        presence: createParticipationPresenceClient(supabase),
        onSelf: setSelf,
        onParticipants: (next) => {
          setParticipants(next);
          const session = active?.getSelf();
          if (session) {
            const mine = next.find((p) => p.sessionId === session.sessionId);
            setWatchedEventIds(
              mine?.watchedEventIds ?? [...active!.getWatchedEventIds()],
            );
          } else {
            setWatchedEventIds([]);
          }
        },
        onStatus: setStatus,
        onError: (error) => {
          if (process.env.NODE_ENV === "development") {
            console.debug("[4663-participation] error", error);
          }
        },
      });
      controllerRef.current = active;
      active.start();
    } catch (error) {
      queueMicrotask(() => setStatus("error"));
      if (process.env.NODE_ENV === "development") {
        console.debug("[4663-participation] failed to start", error);
      }
    }

    return () => {
      active?.stop();
      controllerRef.current = null;
    };
  }, []);

  const pruneWatchedEvents = useCallback((liveEventIds: readonly string[]) => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.pruneWatchedEvents(liveEventIds);
    setWatchedEventIds([...controller.getWatchedEventIds()]);
  }, []);

  return {
    status,
    self,
    participants,
    isParticipating: self !== null,
    enter: (displayName: string) => {
      const controller = controllerRef.current;
      if (!controller) {
        return { ok: false as const, error: "Participation is unavailable." };
      }
      return controller.enter(displayName);
    },
    leave: () => {
      controllerRef.current?.leave();
      setWatchedEventIds([]);
    },
    isWatching: (eventId: string) => isWatchingEvent(watchedEventIds, eventId),
    watch: (eventId: string) => {
      const controller = controllerRef.current;
      if (!controller) {
        return { ok: false as const, error: "Participation is unavailable." };
      }
      const result = controller.watch(eventId);
      setWatchedEventIds([...controller.getWatchedEventIds()]);
      return result;
    },
    unwatch: (eventId: string) => {
      const controller = controllerRef.current;
      if (!controller) {
        return { ok: false as const, error: "Participation is unavailable." };
      }
      const result = controller.unwatch(eventId);
      setWatchedEventIds([...controller.getWatchedEventIds()]);
      return result;
    },
    toggleWatch: (eventId: string) => {
      const controller = controllerRef.current;
      if (!controller) {
        return { ok: false as const, error: "Participation is unavailable." };
      }
      const result = controller.toggleWatch(eventId);
      setWatchedEventIds([...controller.getWatchedEventIds()]);
      return result;
    },
    watchCount: (eventId: string) =>
      watchCountForEvent(participants, eventId),
    pruneWatchedEvents,
  };
}
