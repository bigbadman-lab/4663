/**
 * Social 8A — bottom control dock definitions (TEXT / DRAW / MARK / SUMMON / RESET).
 */

import { PONS_BUYER_COUNT_COLOR } from "@/lib/canvas/pons-visual";

export type ControlDockActionId =
  | "text"
  | "draw"
  | "mark"
  | "summon"
  | "reset";

export type ControlDockItem = {
  id: ControlDockActionId;
  label: string;
  /** Public PNG path under /public */
  iconSrc: `/${string}.png`;
};

/** Canonical dock order — do not reorder. */
export const CONTROL_DOCK_ITEMS: readonly ControlDockItem[] = [
  { id: "text", label: "TEXT", iconSrc: "/text.png" },
  { id: "draw", label: "DRAW", iconSrc: "/draw.png" },
  { id: "mark", label: "MARK", iconSrc: "/mark.png" },
  { id: "summon", label: "SUMMON", iconSrc: "/summon.png" },
  { id: "reset", label: "RESET", iconSrc: "/reset.png" },
] as const;

/**
 * Active SUMMON dock accent — same brand green as PONS buyer-count hierarchy.
 * Presentation only (Stage 8A.3.1).
 */
export const SUMMON_DOCK_ACTIVE_COLOR = PONS_BUYER_COUNT_COLOR;

/**
 * SUMMON dock enablement (Stage 8A.3 toggle).
 * Owner may click while active to turn OFF; otherwise gate on canSummon.
 */
export function isSummonDockDisabled(input: {
  canSummon: boolean;
  summonActive: boolean;
  isSummonOwner: boolean;
}): boolean {
  if (input.summonActive && input.isSummonOwner) return false;
  return !input.canSummon;
}

/** @deprecated Prefer CONTROL_DOCK_ITEMS — kept for transitional imports. */
export const CONTROL_PALETTE_ITEMS = CONTROL_DOCK_ITEMS;

/** @deprecated Prefer ControlDockActionId */
export type ControlPaletteActionId = ControlDockActionId;

/** @deprecated Prefer ControlDockItem */
export type ControlPaletteItem = ControlDockItem;
