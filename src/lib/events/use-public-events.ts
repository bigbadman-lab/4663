"use client";

/**
 * Stage 9C — public live events stream for Stage 10 consumers.
 */

import { useEffect, useState } from "react";
import {
  createDefaultFetchRecent,
  PublicEventsStreamController,
  type PublicEventsStreamStatus,
} from "@/lib/events/browser-stream";
import { createEventsRealtimeClient } from "@/lib/events/realtime-client";
import { createBrowserSupabase } from "@/lib/events/supabase-browser";
import type { PublicEvent } from "@/lib/events/types";

export type UsePublicEventsResult = {
  events: PublicEvent[];
  status: PublicEventsStreamStatus;
};

export function usePublicEvents(): UsePublicEventsResult {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [status, setStatus] =
    useState<PublicEventsStreamStatus>("connecting");

  useEffect(() => {
    let controller: PublicEventsStreamController | null = null;

    try {
      const supabase = createBrowserSupabase();
      controller = new PublicEventsStreamController({
        realtime: createEventsRealtimeClient(supabase),
        fetchRecent: createDefaultFetchRecent(),
        onEvents: (next) => setEvents(next),
        onStatus: (next) => setStatus(next),
        onError: (error) => {
          if (process.env.NODE_ENV === "development") {
            console.debug("[4663-events] stream error", error);
          }
        },
        setTimeoutFn: (handler, ms) => window.setTimeout(handler, ms),
        clearTimeoutFn: (id) => window.clearTimeout(id as number),
      });
      controller.start();
    } catch (error) {
      queueMicrotask(() => setStatus("error"));
      if (process.env.NODE_ENV === "development") {
        console.debug("[4663-events] stream failed to start", error);
      }
    }

    return () => {
      controller?.stop();
    };
  }, []);

  return { events, status };
}
