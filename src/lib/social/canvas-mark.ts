/**
 * Social 6 — durable 24h MARK helpers (validation + normalize).
 * Persistent; not session-ephemeral. Do not wire into LEAVE/RESET/Presence cleanup.
 */

import { CHAIN_ID } from "@/lib/pons/constants";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";
import {
  isParticipationColour,
  type ParticipationColour,
} from "@/lib/social/colour";
import { validateDisplayName } from "@/lib/social/display-name";
import { clampCanvasPct } from "@/lib/social/ephemeral-text";

export const MARK_MAX_CHARS = 200 as const;
export const MARK_TTL_MS = 24 * 60 * 60 * 1000;
export const MARKS_API_PATH = "/api/social/marks" as const;
export const CANVAS_MARKS_TABLE = "canvas_marks" as const;
export const CANVAS_MARKS_REALTIME_CHANNEL = "4663-canvas-marks" as const;

/**
 * Stage 8A.6 — launch dormancy switch.
 * Flip to true to restore MARK UI, rendering, client fetch/realtime, and POST.
 * Schema / migrations / server helpers remain regardless.
 */
export const MARK_ENABLED = false as const;

export type CanvasMark = {
  id: string;
  chainId: typeof CHAIN_ID;
  ownerSessionId: string;
  ownerDisplayName: string;
  ownerColour: ParticipationColour;
  body: string;
  leftPct: number;
  topPct: number;
  createdAt: string;
  expiresAt: string;
};

export type ValidateMarkBodyResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

export function validateMarkBody(raw: unknown): ValidateMarkBodyResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Text is required." };
  }
  const body = raw.trim();
  if (body.length === 0) {
    return { ok: false, error: "Text is required." };
  }
  if (body.length > MARK_MAX_CHARS) {
    return {
      ok: false,
      error: `Mark must be ${MARK_MAX_CHARS} characters or fewer.`,
    };
  }
  return { ok: true, body };
}

export type ValidateMarkPositionResult =
  | { ok: true; leftPct: number; topPct: number }
  | { ok: false; error: string };

export function validateMarkPosition(
  leftPct: unknown,
  topPct: unknown,
): ValidateMarkPositionResult {
  if (typeof leftPct !== "number" || !Number.isFinite(leftPct)) {
    return { ok: false, error: "Invalid position." };
  }
  if (typeof topPct !== "number" || !Number.isFinite(topPct)) {
    return { ok: false, error: "Invalid position." };
  }
  if (leftPct < 0 || leftPct > 100 || topPct < 0 || topPct > 100) {
    return { ok: false, error: "Invalid position." };
  }
  return {
    ok: true,
    leftPct: clampCanvasPct(leftPct),
    topPct: clampCanvasPct(topPct),
  };
}

export function isMarkActive(
  mark: Pick<CanvasMark, "expiresAt">,
  nowMs: number,
): boolean {
  const expiresMs = Date.parse(mark.expiresAt);
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs > nowMs;
}

export function pruneExpiredMarks(
  marks: readonly CanvasMark[],
  nowMs: number,
): CanvasMark[] {
  return marks.filter((mark) => isMarkActive(mark, nowMs));
}

export function upsertCanvasMark(
  marks: readonly CanvasMark[],
  mark: CanvasMark,
): CanvasMark[] {
  const filtered = marks.filter((m) => m.id !== mark.id);
  return [...filtered, mark].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export function sessionHasMark(
  marks: readonly CanvasMark[],
  sessionId: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!sessionId || !isUuid(sessionId)) return false;
  const id = normalizeSessionId(sessionId);
  return marks.some(
    (mark) =>
      mark.ownerSessionId === id && isMarkActive(mark, nowMs),
  );
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Date.parse(value))
  );
}

/** Normalize a client/API mark DTO (camelCase). */
export function normalizeCanvasMark(raw: unknown): CanvasMark | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.id)) return null;
  if (!isUuid(record.ownerSessionId)) return null;

  const chainId =
    typeof record.chainId === "number" ? record.chainId : Number(record.chainId);
  if (chainId !== CHAIN_ID) return null;

  const nameResult = validateDisplayName(record.ownerDisplayName);
  if (!nameResult.ok) return null;
  if (!isParticipationColour(record.ownerColour)) return null;

  const bodyResult = validateMarkBody(record.body);
  if (!bodyResult.ok) return null;

  if (typeof record.leftPct !== "number" || !Number.isFinite(record.leftPct)) {
    return null;
  }
  if (typeof record.topPct !== "number" || !Number.isFinite(record.topPct)) {
    return null;
  }
  if (record.leftPct < 0 || record.leftPct > 100) return null;
  if (record.topPct < 0 || record.topPct > 100) return null;

  if (!isIsoTimestamp(record.createdAt)) return null;
  if (!isIsoTimestamp(record.expiresAt)) return null;

  const createdMs = Date.parse(record.createdAt);
  const expiresMs = Date.parse(record.expiresAt);
  if (expiresMs <= createdMs) return null;

  return {
    id: normalizeSessionId(record.id),
    chainId: CHAIN_ID,
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    ownerDisplayName: nameResult.name,
    ownerColour: record.ownerColour,
    body: bodyResult.body,
    leftPct: record.leftPct,
    topPct: record.topPct,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}

/** Map a postgres row (snake_case) to CanvasMark. */
export function canvasMarkFromRow(raw: unknown): CanvasMark | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  return normalizeCanvasMark({
    id: row.id,
    chainId: row.chain_id,
    ownerSessionId: row.owner_session_id,
    ownerDisplayName: row.owner_display_name,
    ownerColour: row.owner_colour,
    body: row.body,
    leftPct: row.left_pct,
    topPct: row.top_pct,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  });
}

export function markExpiresAtFromCreated(createdAt: Date): Date {
  return new Date(createdAt.getTime() + MARK_TTL_MS);
}

export type CreateMarkInput = {
  ownerSessionId: unknown;
  ownerDisplayName: unknown;
  ownerColour: unknown;
  body: unknown;
  leftPct: unknown;
  topPct: unknown;
};

export type ParsedCreateMark =
  | {
      ok: true;
      ownerSessionId: string;
      ownerDisplayName: string;
      ownerColour: ParticipationColour;
      body: string;
      leftPct: number;
      topPct: number;
    }
  | { ok: false; error: string };

export function parseCreateMarkInput(body: unknown): ParsedCreateMark {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const record = body as Record<string, unknown>;

  if (!isUuid(record.ownerSessionId)) {
    return { ok: false, error: "invalid_session" };
  }
  const nameResult = validateDisplayName(record.ownerDisplayName);
  if (!nameResult.ok) {
    return { ok: false, error: "invalid_display_name" };
  }
  if (!isParticipationColour(record.ownerColour)) {
    return { ok: false, error: "invalid_colour" };
  }
  const bodyResult = validateMarkBody(record.body);
  if (!bodyResult.ok) {
    return { ok: false, error: "invalid_body_text" };
  }
  const position = validateMarkPosition(record.leftPct, record.topPct);
  if (!position.ok) {
    return { ok: false, error: "invalid_position" };
  }

  return {
    ok: true,
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    ownerDisplayName: nameResult.name,
    ownerColour: record.ownerColour,
    body: bodyResult.body,
    leftPct: position.leftPct,
    topPct: position.topPct,
  };
}
