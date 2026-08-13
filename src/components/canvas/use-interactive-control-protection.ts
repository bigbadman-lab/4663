"use client";

/**
 * IC3.6 — attach native capture-phase move-start isolation to a control element.
 */

import { useEffect, useRef, type RefObject } from "react";
import { protectInteractiveControlElement } from "@/lib/canvas/interactive-control";

export function useInteractiveControlProtection<
  T extends HTMLElement,
>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return protectInteractiveControlElement(element);
  }, []);

  return ref;
}
