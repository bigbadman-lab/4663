"use client";

/**
 * Invisible client island: anonymous presence heartbeat for the browser profile.
 */

import { useEffect } from "react";
import {
  PresenceHeartbeatController,
  postPresenceHeartbeat,
} from "@/lib/presence/browser-heartbeat";
import { getOrCreatePresenceSessionId } from "@/lib/presence/browser-session";

export function PresenceHeartbeat() {
  useEffect(() => {
    const controller = new PresenceHeartbeatController({
      getSessionId: () => getOrCreatePresenceSessionId(window.localStorage),
      sendHeartbeat: (sessionId) => postPresenceHeartbeat(sessionId),
      getVisibilityState: () => document.visibilityState,
      // Bind to window — bare setInterval/clearInterval refs throw Illegal invocation
      setIntervalFn: (handler: () => void, ms: number) =>
        window.setInterval(handler, ms),
      clearIntervalFn: (id: unknown) =>
        window.clearInterval(id as number),
      addEventListener: (type, listener) =>
        window.addEventListener(type, listener),
      removeEventListener: (type, listener) =>
        window.removeEventListener(type, listener),
      onError: (error) => {
        if (process.env.NODE_ENV === "development") {
          console.debug("[4663-presence] heartbeat failed", error);
        }
      },
    });

    controller.start();
    return () => {
      controller.stop();
    };
  }, []);

  return null;
}
