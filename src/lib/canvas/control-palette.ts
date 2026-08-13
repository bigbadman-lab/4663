/**
 * Social 8A — bottom control dock definitions (TEXT / DRAW / MARK / CRYPTO / RESET).
 * Dock id remains `summon` for wiring stability; label/action are CRYPTO → watchlist.
 */

import { PONS_BUYER_COUNT_COLOR } from "@/lib/canvas/pons-visual";
import { MARK_ENABLED } from "@/lib/social/canvas-mark";

export type ControlDockActionId =
  | "text"
  | "draw"
  | "mark"
  | "summon"
  | "home"
  | "reset";

export type ControlDockItem = {
  id: ControlDockActionId;
  label: string;
  /** Public PNG path under /public */
  iconSrc: `/${string}.png`;
};

/** Canonical full dock order — includes dormant actions for restoration. */
export const CONTROL_DOCK_ITEMS: readonly ControlDockItem[] = [
  { id: "text", label: "TEXT", iconSrc: "/text.png" },
  { id: "draw", label: "DRAW", iconSrc: "/draw.png" },
  { id: "mark", label: "MARK", iconSrc: "/mark.png" },
  { id: "home", label: "HOME", iconSrc: "/home.png" },
  { id: "summon", label: "CRYPTO", iconSrc: "/summon.png" },
  { id: "reset", label: "RESET", iconSrc: "/reset.png" },
] as const;

/**
 * Live dock items shown in production UI.
 * MARK omitted while MARK_ENABLED is false (Stage 8A.6).
 */
export function getLiveControlDockItems(): readonly ControlDockItem[] {
  if (MARK_ENABLED) return CONTROL_DOCK_ITEMS;
  return CONTROL_DOCK_ITEMS.filter((item) => item.id !== "mark");
}

/** Accessible name for the HOME dock control (IC2.1 viewport reset). */
export const HOME_VIEW_ARIA_LABEL = "Restore home view" as const;

/**
 * Active SUMMON dock accent — same brand green as PONS buyer-count hierarchy.
 * Presentation only (Stage 8A.3.1).
 */
export const SUMMON_DOCK_ACTIVE_COLOR = PONS_BUYER_COUNT_COLOR;

/**
 * SUMMON dock enablement (Stage 8A.3 toggle / IC3.5 in-flight).
 * Owner may click while active to turn OFF; otherwise gate on canSummon.
 * In-flight history fetch always disables (no duplicate requests).
 */
export function isSummonDockDisabled(input: {
  canSummon: boolean;
  summonActive: boolean;
  isSummonOwner: boolean;
  summonInFlight?: boolean;
}): boolean {
  if (input.summonInFlight) return true;
  if (input.summonActive && input.isSummonOwner) return false;
  return !input.canSummon;
}

/** Accessible / title copy for CRYPTO dock (opens continuation watchlist). */
export const SUMMON_DOCK_A11Y = {
  idle: "CRYPTO — tokens we're monitoring",
  clear: "CRYPTO — tokens we're monitoring",
  inFlight: "CRYPTO — tokens we're monitoring",
  coolingDown: "CRYPTO — tokens we're monitoring",
  activeOther: "CRYPTO — tokens we're monitoring",
} as const;

export function getSummonDockA11yLabel(_input: {
  summonActive: boolean;
  isSummonOwner: boolean;
  summonInFlight?: boolean;
  summonCoolingDown?: boolean;
}): string {
  return SUMMON_DOCK_A11Y.idle;
}

/** @deprecated Prefer CONTROL_DOCK_ITEMS — kept for transitional imports. */
export const CONTROL_PALETTE_ITEMS = CONTROL_DOCK_ITEMS;

/** @deprecated Prefer ControlDockActionId */
export type ControlPaletteActionId = ControlDockActionId;

/** @deprecated Prefer ControlDockItem */
export type ControlPaletteItem = ControlDockItem;
