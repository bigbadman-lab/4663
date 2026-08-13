"use client";

/**
 * Social 8A.2 — local canvas tone state (localStorage + document attribute).
 */

import { useCallback, useEffect, useState } from "react";
import {
  applyCanvasToneToDocument,
  CANVAS_TONE_STORAGE_KEY,
  DEFAULT_CANVAS_TONE,
  readCanvasTone,
  writeCanvasTone,
  type CanvasTone,
} from "@/lib/canvas/canvas-tone";

export type UseCanvasToneResult = {
  tone: CanvasTone;
  setTone: (tone: CanvasTone) => void;
};

export function useCanvasTone(): UseCanvasToneResult {
  const [tone, setToneState] = useState<CanvasTone>(() => {
    if (typeof window === "undefined") return DEFAULT_CANVAS_TONE;
    return readCanvasTone();
  });

  useEffect(() => {
    applyCanvasToneToDocument(tone);
  }, [tone]);

  // Cross-tab sync within same browser profile (localStorage storage event).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CANVAS_TONE_STORAGE_KEY) return;
      const next = readCanvasTone();
      setToneState(next);
      applyCanvasToneToDocument(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTone = useCallback((next: CanvasTone) => {
    setToneState(next);
    writeCanvasTone(next);
    applyCanvasToneToDocument(next);
  }, []);

  return { tone, setTone };
}
