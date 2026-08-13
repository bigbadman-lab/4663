"use client";

/**
 * IC3.5 — single transient control-notice timer for the dock.
 */

import { useEffect, useRef, useState } from "react";
import {
  CONTROL_NOTICE_DURATION_MS,
  type ControlNoticeKind,
} from "@/lib/canvas/control-notice";

export type UseControlNoticeResult = {
  notice: ControlNoticeKind | null;
  showNotice: (kind: ControlNoticeKind) => void;
  clearNotice: () => void;
};

export function useControlNotice(
  durationMs: number = CONTROL_NOTICE_DURATION_MS,
): UseControlNoticeResult {
  const [notice, setNotice] = useState<ControlNoticeKind | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNotice = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setNotice(null);
  };

  const showNotice = (kind: ControlNoticeKind) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setNotice(kind);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setNotice(null);
    }, durationMs);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { notice, showNotice, clearNotice };
}
