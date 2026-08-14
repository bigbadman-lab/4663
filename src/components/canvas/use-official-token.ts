"use client";

/**
 * LAUNCH1 — fetch official 4663 token; poll while inactive.
 * Health 1: pauses while document is hidden; resumes with an immediate fetch.
 */

import { useEffect, useState } from "react";
import type { OfficialTokenPublicState } from "@/lib/token/official";
import {
  fetchOfficialTokenJson,
  startOfficialTokenPolling,
} from "@/lib/token/official-token-poll";

export function useOfficialToken(): OfficialTokenPublicState | null {
  const [state, setState] = useState<OfficialTokenPublicState | null>(null);

  useEffect(() => {
    const poller = startOfficialTokenPolling({
      fetchOfficial: () => fetchOfficialTokenJson(),
      getVisibilityState: () => document.visibilityState,
      setTimeoutFn: (handler, ms) => window.setTimeout(handler, ms),
      clearTimeoutFn: (id) => window.clearTimeout(id as number),
      addEventListener: (type, listener) =>
        window.addEventListener(type, listener),
      removeEventListener: (type, listener) =>
        window.removeEventListener(type, listener),
      onState: setState,
    });
    return () => {
      poller.stop();
    };
  }, []);

  return state;
}
