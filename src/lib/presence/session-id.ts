/**
 * Anonymous presence session ID validation (Stage 8A).
 * Browser will generate via crypto.randomUUID(); API accepts UUID strings only.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Normalize a validated UUID to lowercase storage form. */
export function normalizeSessionId(uuid: string): string {
  return uuid.trim().toLowerCase();
}
