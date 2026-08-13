"use client";

/**
 * LAUNCH1 — fetch official 4663 token; poll while inactive.
 */

import { useEffect, useRef, useState } from "react";
import {
  OFFICIAL_TOKEN_POLL_INACTIVE_MS,
  type OfficialTokenPublicState,
} from "@/lib/token/official";

type FetchResult =
  | { ok: true; state: OfficialTokenPublicState }
  | { ok: false };

async function fetchOfficialToken(): Promise<FetchResult> {
  try {
    const res = await fetch("/api/token/official", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as {
      active?: boolean;
      chainId?: number;
      contractAddress?: string;
    };
    if (body.active === true && typeof body.contractAddress === "string") {
      return {
        ok: true,
        state: {
          active: true,
          chainId: 4663,
          contractAddress: body.contractAddress,
        },
      };
    }
    return { ok: true, state: { active: false } };
  } catch {
    return { ok: false };
  }
}

export function useOfficialToken(): OfficialTokenPublicState | null {
  const [state, setState] = useState<OfficialTokenPublicState | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      const result = await fetchOfficialToken();
      if (cancelled) return;

      if (result.ok) {
        if (result.state.active) {
          activeRef.current = true;
          setState(result.state);
          return; // stop polling — immutable once active
        }
        // Inactive: only clear if we never held an active value this session.
        if (!activeRef.current) {
          setState({ active: false });
        }
      } else if (!activeRef.current) {
        // Transient failure before first success — keep hidden.
        setState((prev) => prev ?? null);
      }
      // If we already have active in session, keep it on failed polls.

      timer = window.setTimeout(tick, OFFICIAL_TOKEN_POLL_INACTIVE_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return state;
}
