"use client";

/**
 * Social 6 — durable MARK client state (fetch + realtime INSERT + local expiry).
 * Not session-ephemeral: do not register with LEAVE/RESET/Presence cleanup.
 * Stage 8A.6: dormant when MARK_ENABLED is false (no fetch / realtime / render feed).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/events/supabase-browser";
import {
  canvasMarkFromRow,
  isMarkActive,
  MARK_ENABLED,
  pruneExpiredMarks,
  sessionHasMark,
  upsertCanvasMark,
  type CanvasMark,
} from "@/lib/social/canvas-mark";
import {
  fetchActiveCanvasMarks,
  postCanvasMark,
  type PostCanvasMarkInput,
} from "@/lib/social/fetch-marks";
import { createMarksRealtimeClient } from "@/lib/social/marks-realtime";

const EXPIRY_TICK_MS = 5_000;

export type UseCanvasMarksResult = {
  marks: readonly CanvasMark[];
  hasMarkForSession: (sessionId: string | null | undefined) => boolean;
  createMark: (
    input: PostCanvasMarkInput,
  ) => Promise<{ ok: true; mark: CanvasMark } | { ok: false; error: string }>;
};

export function useCanvasMarks(): UseCanvasMarksResult {
  const [marks, setMarks] = useState<CanvasMark[]>([]);
  const marksRef = useRef(marks);
  marksRef.current = marks;

  useEffect(() => {
    if (!MARK_ENABLED) {
      setMarks([]);
      return;
    }
    const ac = new AbortController();
    void fetchActiveCanvasMarks(fetch, ac.signal)
      .then((next) => {
        if (!ac.signal.aborted) {
          setMarks(pruneExpiredMarks(next, Date.now()));
        }
      })
      .catch(() => {
        // leave empty; realtime may still deliver
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!MARK_ENABLED) return;
    let unsub: (() => void) | null = null;
    try {
      const supabase = getBrowserSupabaseClient();
      const client = createMarksRealtimeClient(supabase);
      const sub = client.subscribeInserts({
        onInsert: (row) => {
          const mark = canvasMarkFromRow(row);
          if (!mark) return;
          if (!isMarkActive(mark, Date.now())) return;
          setMarks((prev) => upsertCanvasMark(prev, mark));
        },
        onStatus: () => {},
      });
      unsub = sub.unsubscribe;
    } catch {
      // env missing in tests / SSR edge
    }
    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (!MARK_ENABLED) return;
    const id = window.setInterval(() => {
      setMarks((prev) => {
        if (prev.length === 0) return prev;
        const next = pruneExpiredMarks(prev, Date.now());
        return next.length === prev.length ? prev : next;
      });
    }, EXPIRY_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const hasMarkForSession = useCallback(
    (sessionId: string | null | undefined) =>
      MARK_ENABLED
        ? sessionHasMark(marksRef.current, sessionId, Date.now())
        : false,
    [],
  );

  const createMark = useCallback(async (input: PostCanvasMarkInput) => {
    if (!MARK_ENABLED) {
      return { ok: false as const, error: "Mark is unavailable." };
    }
    if (sessionHasMark(marksRef.current, input.ownerSessionId, Date.now())) {
      return { ok: false as const, error: "Already marked this session." };
    }
    const result = await postCanvasMark(input);
    if (!result.ok) {
      if (result.error === "mark_exists") {
        return { ok: false as const, error: "Already marked this session." };
      }
      if (result.error === "invalid_body_text") {
        return { ok: false as const, error: "Text is required." };
      }
      if (result.error === "feature_disabled") {
        return { ok: false as const, error: "Mark is unavailable." };
      }
      return { ok: false as const, error: "Could not publish mark." };
    }
    setMarks((prev) => upsertCanvasMark(prev, result.mark));
    return { ok: true as const, mark: result.mark };
  }, []);

  // Return state marks directly — expiry tick already prunes.
  // Do NOT reallocate a new array every render (breaks effect deps).
  return {
    marks: MARK_ENABLED ? marks : [],
    hasMarkForSession,
    createMark,
  };
}
