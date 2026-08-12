"use client";

/**
 * React hook + provider for Social 1B named participation.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createBrowserSupabase } from "@/lib/events/supabase-browser";
import { ParticipationController } from "@/lib/social/participation-controller";
import { createParticipationPresenceClient } from "@/lib/social/participation-realtime";
import type {
  ParticipationPresencePayload,
  ParticipationSession,
  ParticipationStatus,
} from "@/lib/social/types";

export type UseParticipationResult = {
  status: ParticipationStatus;
  self: ParticipationSession | null;
  participants: ParticipationPresencePayload[];
  isParticipating: boolean;
  enter: (displayName: string) => { ok: true } | { ok: false; error: string };
  leave: () => void;
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
  const controllerRef = useRef<ParticipationController | null>(null);

  useEffect(() => {
    let active: ParticipationController | null = null;

    try {
      const supabase = createBrowserSupabase();
      active = new ParticipationController({
        storage: window.sessionStorage,
        presence: createParticipationPresenceClient(supabase),
        onSelf: setSelf,
        onParticipants: setParticipants,
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
    },
  };
}
