/**
 * Social 2A — ephemeral published TEXT helpers.
 * Shared room state lives in PlayHTML usePageData (late-join safe).
 */

import { clampObjectScale } from "@/lib/canvas/object-scale-resize";
import {
  isUuid,
  normalizeSessionId,
} from "@/lib/presence/session-id";

export const EPHEMERAL_TEXT_MAX_LENGTH = 200 as const;
export const EPHEMERAL_TEXTS_PAGE_DATA_NAME = "4663-ephemeral-texts" as const;

/** Canonical published size (compact `text-[12px]`). Missing field → this. */
export const TEXT_FONT_SCALE_DEFAULT = 1 as const;
/** Still readable; host stays large enough to drag. */
export const TEXT_FONT_SCALE_MIN = 0.75 as const;
/** 36px / 42rem — large without covering the world. */
export const TEXT_FONT_SCALE_MAX = 3 as const;
export const TEXT_FONT_SIZE_PX = 12 as const;
export const TEXT_MAX_WIDTH_REM = 14 as const;
export const TEXT_MAX_WIDTH_VW = 70 as const;

export type EphemeralTextObject = {
  textId: string;
  ownerSessionId: string;
  body: string;
  /** CSS left % origin inside #4663-canvas (PlayHTML translate offsets from here). */
  leftPct: number;
  /** CSS top % origin inside #4663-canvas. */
  topPct: number;
  /**
   * Visual scale of the whole text object (font + wrap width).
   * Missing on legacy objects; normalize to TEXT_FONT_SCALE_DEFAULT.
   */
  fontScale: number;
  createdAt: string;
};

export type EphemeralTextsPageData = {
  texts: EphemeralTextObject[];
};

export const EMPTY_EPHEMERAL_TEXTS_PAGE_DATA: EphemeralTextsPageData = {
  texts: [],
};

export function playhtmlTextElementId(textId: string): string {
  return `4663-text-${textId}`;
}

export type ValidateTextBodyResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

export function validateTextBody(raw: unknown): ValidateTextBodyResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Text is required." };
  }
  const body = raw.trim();
  if (body.length === 0) {
    return { ok: false, error: "Text is required." };
  }
  if (body.length > EPHEMERAL_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      error: `Text must be ${EPHEMERAL_TEXT_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, body };
}

function isFinitePct(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampTextFontScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return TEXT_FONT_SCALE_DEFAULT;
  }
  return clampObjectScale(
    value,
    TEXT_FONT_SCALE_MIN,
    TEXT_FONT_SCALE_MAX,
    TEXT_FONT_SCALE_DEFAULT,
  );
}

export function textFontSizePx(fontScale: number): number {
  return TEXT_FONT_SIZE_PX * clampTextFontScale(fontScale);
}

/** CSS max-width that scales with the font so wrapping stays proportional. */
export function textMaxWidthCss(fontScale: number): string {
  const scale = clampTextFontScale(fontScale);
  return `min(${TEXT_MAX_WIDTH_REM * scale}rem, ${TEXT_MAX_WIDTH_VW * scale}vw)`;
}

/** max-width / font-size in rem-per-px; independent of scale. */
export function textWrapRatio(): number {
  return TEXT_MAX_WIDTH_REM / TEXT_FONT_SIZE_PX;
}

/** Clamp click % into a safe canvas band. */
export function clampCanvasPct(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(95, Math.max(5, value));
}

export function normalizeEphemeralTextObject(
  raw: unknown,
): EphemeralTextObject | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  if (!isUuid(record.textId)) return null;
  if (!isUuid(record.ownerSessionId)) return null;

  const bodyResult = validateTextBody(record.body);
  if (!bodyResult.ok) return null;

  if (!isFinitePct(record.leftPct) || !isFinitePct(record.topPct)) return null;
  if (record.leftPct < -5 || record.leftPct > 105) return null;
  if (record.topPct < -5 || record.topPct > 105) return null;

  if (typeof record.createdAt !== "string" || record.createdAt.trim() === "") {
    return null;
  }
  if (!Number.isFinite(Date.parse(record.createdAt))) return null;

  return {
    textId: normalizeSessionId(record.textId),
    ownerSessionId: normalizeSessionId(record.ownerSessionId),
    body: bodyResult.body,
    leftPct: record.leftPct,
    topPct: record.topPct,
    fontScale: clampTextFontScale(record.fontScale),
    createdAt: record.createdAt,
  };
}

export function normalizeEphemeralTextsPageData(
  raw: unknown,
): EphemeralTextsPageData {
  if (raw === null || typeof raw !== "object") {
    return { texts: [] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.texts)) {
    return { texts: [] };
  }

  const seen = new Set<string>();
  const texts: EphemeralTextObject[] = [];
  for (const item of record.texts) {
    const normalized = normalizeEphemeralTextObject(item);
    if (!normalized) continue;
    if (seen.has(normalized.textId)) continue;
    seen.add(normalized.textId);
    texts.push(normalized);
  }
  return { texts };
}

export type CreateEphemeralTextInput = {
  body: string;
  ownerSessionId: string;
  leftPct: number;
  topPct: number;
  now?: () => Date;
  randomUUID?: () => string;
};

export type CreateEphemeralTextResult =
  | { ok: true; text: EphemeralTextObject }
  | { ok: false; error: string };

export function createEphemeralTextObject(
  input: CreateEphemeralTextInput,
): CreateEphemeralTextResult {
  if (!isUuid(input.ownerSessionId)) {
    return { ok: false, error: "Invalid session." };
  }
  const bodyResult = validateTextBody(input.body);
  if (!bodyResult.ok) return bodyResult;

  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const now = input.now ?? (() => new Date());
  const textId = normalizeSessionId(randomUUID());

  return {
    ok: true,
    text: {
      textId,
      ownerSessionId: normalizeSessionId(input.ownerSessionId),
      body: bodyResult.body,
      leftPct: clampCanvasPct(input.leftPct),
      topPct: clampCanvasPct(input.topPct),
      fontScale: TEXT_FONT_SCALE_DEFAULT,
      createdAt: now().toISOString(),
    },
  };
}

export function upsertEphemeralText(
  data: EphemeralTextsPageData,
  text: EphemeralTextObject,
): EphemeralTextsPageData {
  const index = data.texts.findIndex((t) => t.textId === text.textId);
  if (index === -1) {
    return { texts: [...data.texts, text] };
  }
  const texts = data.texts.slice();
  texts[index] = text;
  return { texts };
}

export function resizeEphemeralText(
  data: EphemeralTextsPageData,
  textId: string,
  fontScale: number,
): EphemeralTextsPageData {
  const target = data.texts.find((text) => text.textId === textId);
  if (!target) return data;
  const nextScale = clampTextFontScale(fontScale);
  if (nextScale === target.fontScale) return data;
  return upsertEphemeralText(data, { ...target, fontScale: nextScale });
}

export function removeEphemeralText(
  data: EphemeralTextsPageData,
  textId: string,
): EphemeralTextsPageData {
  return {
    texts: data.texts.filter((t) => t.textId !== textId),
  };
}

export function removeEphemeralTextsByOwner(
  data: EphemeralTextsPageData,
  ownerSessionId: string,
): EphemeralTextsPageData {
  const owner = normalizeSessionId(ownerSessionId);
  return {
    texts: data.texts.filter((t) => t.ownerSessionId !== owner),
  };
}

/**
 * Keep only texts whose owners are still in the named presence set.
 * Used for remote Presence-loss cleanup.
 */
export function retainEphemeralTextsForPresentOwners(
  data: EphemeralTextsPageData,
  presentSessionIds: ReadonlySet<string>,
): EphemeralTextsPageData {
  return {
    texts: data.texts.filter((t) => presentSessionIds.has(t.ownerSessionId)),
  };
}

export function pointerToCanvasPct(
  clientX: number,
  clientY: number,
  bounds: DOMRect,
): { leftPct: number; topPct: number } {
  const width = bounds.width || 1;
  const height = bounds.height || 1;
  return {
    leftPct: clampCanvasPct(((clientX - bounds.left) / width) * 100),
    topPct: clampCanvasPct(((clientY - bounds.top) / height) * 100),
  };
}
