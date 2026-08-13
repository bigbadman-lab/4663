/**
 * IC3.5 — lightweight local control-dock notices (SUMMON / RESET UX).
 * Client-only transient copy; never page-data / never shared.
 */

export type ControlNoticeKind =
  | "summon-empty"
  | "summon-error"
  | "reset-cleared";

/** Match address "copied" flash (~1.2s). */
export const CONTROL_NOTICE_DURATION_MS = 1_200 as const;

export const CONTROL_NOTICE_COPY = {
  "summon-empty": "NO SUMMON HISTORY YET",
  "summon-error": "SUMMON UNAVAILABLE",
  "reset-cleared": "CLEARED",
} as const satisfies Record<ControlNoticeKind, string>;

export function controlNoticeMessage(kind: ControlNoticeKind): string {
  return CONTROL_NOTICE_COPY[kind];
}
