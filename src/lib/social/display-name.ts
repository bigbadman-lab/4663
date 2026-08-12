/**
 * Minimal deterministic display-name validation for named participation.
 * Shared between client UX and tests. Trims only — does not rewrite valid names.
 */

import type { DisplayNameValidationResult } from "@/lib/social/types";

/** Sensible short max for a temporary canvas name. */
export const DISPLAY_NAME_MAX_LENGTH = 24 as const;

const CONTROL_OR_NONTEXT_RE = /[\u0000-\u001f\u007f-\u009f]/;

export function validateDisplayName(
  raw: unknown,
): DisplayNameValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Name is required." };
  }

  const name = raw.trim();
  if (name.length === 0) {
    return { ok: false, error: "Name is required." };
  }

  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (CONTROL_OR_NONTEXT_RE.test(name)) {
    return { ok: false, error: "Name contains invalid characters." };
  }

  return { ok: true, name };
}
