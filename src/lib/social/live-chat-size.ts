/**
 * Local live-chat panel size — desktop resize only.
 * Personal UI preference: sessionStorage, never collaborative / shared canvas state.
 *
 * Defaults match the existing `sm:` chat box (23rem × 16rem).
 * Mins match the compact box (22.5rem × 15rem) so shrinking stays usable.
 */

import { normalizeCameraScale } from "@/lib/canvas/world-camera";

export const LIVE_CHAT_SIZE_STORAGE_KEY = "4663:live-chat-size" as const;

/** `sm:w-[23rem]` */
export const LIVE_CHAT_DEFAULT_WIDTH_PX = 23 * 16;
/** `sm:h-[16rem]` */
export const LIVE_CHAT_DEFAULT_HEIGHT_PX = 16 * 16;
/** Compact `w-[22.5rem]` — around the default, still usable. */
export const LIVE_CHAT_MIN_WIDTH_PX = 22.5 * 16;
/** Compact `h-[15rem]`. */
export const LIVE_CHAT_MIN_HEIGHT_PX = 15 * 16;
/** Absolute cap so ultra-wide desktops do not grow a half-screen panel. */
export const LIVE_CHAT_MAX_WIDTH_PX = 40 * 16;
export const LIVE_CHAT_MAX_HEIGHT_PX = 32 * 16;
/** Viewport-relative cap (~56vw / 65vh). */
export const LIVE_CHAT_MAX_WIDTH_VW = 0.56 as const;
export const LIVE_CHAT_MAX_HEIGHT_VH = 0.65 as const;

export type LiveChatSize = {
  width: number;
  height: number;
};

export type LiveChatViewport = {
  width: number;
  height: number;
};

export type LiveChatSizeLimits = {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
};

export const LIVE_CHAT_DEFAULT_SIZE: LiveChatSize = {
  width: LIVE_CHAT_DEFAULT_WIDTH_PX,
  height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function isFinitePx(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function viewportAxis(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function liveChatSizeLimits(
  viewport: LiveChatViewport,
): LiveChatSizeLimits {
  const vw = viewportAxis(viewport.width);
  const vh = viewportAxis(viewport.height);
  return {
    minWidth: LIVE_CHAT_MIN_WIDTH_PX,
    minHeight: LIVE_CHAT_MIN_HEIGHT_PX,
    maxWidth: Math.max(
      LIVE_CHAT_MIN_WIDTH_PX,
      Math.min(LIVE_CHAT_MAX_WIDTH_PX, vw * LIVE_CHAT_MAX_WIDTH_VW),
    ),
    maxHeight: Math.max(
      LIVE_CHAT_MIN_HEIGHT_PX,
      Math.min(LIVE_CHAT_MAX_HEIGHT_PX, vh * LIVE_CHAT_MAX_HEIGHT_VH),
    ),
  };
}

export function clampLiveChatSize(
  size: LiveChatSize,
  viewport: LiveChatViewport,
): LiveChatSize {
  const limits = liveChatSizeLimits(viewport);
  const width = isFinitePx(size.width)
    ? size.width
    : LIVE_CHAT_DEFAULT_WIDTH_PX;
  const height = isFinitePx(size.height)
    ? size.height
    : LIVE_CHAT_DEFAULT_HEIGHT_PX;
  return {
    width: Math.min(limits.maxWidth, Math.max(limits.minWidth, width)),
    height: Math.min(limits.maxHeight, Math.max(limits.minHeight, height)),
  };
}

export function applyLiveChatResize(input: {
  width: number;
  height: number;
  deltaWidth: number;
  deltaHeight: number;
  viewport: LiveChatViewport;
}): LiveChatSize {
  const dW = Number.isFinite(input.deltaWidth) ? input.deltaWidth : 0;
  const dH = Number.isFinite(input.deltaHeight) ? input.deltaHeight : 0;
  return clampLiveChatSize(
    {
      width: input.width + dW,
      height: input.height + dH,
    },
    input.viewport,
  );
}

export function clientDeltaToLiveChatSizeDelta(
  deltaClientX: number,
  deltaClientY: number,
  scale: number,
): { deltaWidth: number; deltaHeight: number } {
  const s = normalizeCameraScale(scale);
  const dx = Number.isFinite(deltaClientX) ? deltaClientX : 0;
  const dy = Number.isFinite(deltaClientY) ? deltaClientY : 0;
  return {
    deltaWidth: dx / s,
    deltaHeight: dy / s,
  };
}

export type LiveChatResizeGesture = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
  size: LiveChatSize;
};

export function beginLiveChatResize(input: {
  pointerId: number;
  clientX: number;
  clientY: number;
  size: LiveChatSize;
  viewport: LiveChatViewport;
}): LiveChatResizeGesture {
  const size = clampLiveChatSize(input.size, input.viewport);
  return {
    pointerId: input.pointerId,
    startClientX: input.clientX,
    startClientY: input.clientY,
    startWidth: size.width,
    startHeight: size.height,
    size,
  };
}

export function liveChatSizeFromPointer(input: {
  gesture: Pick<
    LiveChatResizeGesture,
    "startClientX" | "startClientY" | "startWidth" | "startHeight"
  >;
  clientX: number;
  clientY: number;
  scale: number;
  viewport: LiveChatViewport;
}): LiveChatSize {
  const delta = clientDeltaToLiveChatSizeDelta(
    input.clientX - input.gesture.startClientX,
    input.clientY - input.gesture.startClientY,
    input.scale,
  );
  return applyLiveChatResize({
    width: input.gesture.startWidth,
    height: input.gesture.startHeight,
    deltaWidth: delta.deltaWidth,
    deltaHeight: delta.deltaHeight,
    viewport: input.viewport,
  });
}

export function moveLiveChatResize(
  gesture: LiveChatResizeGesture,
  input: {
    pointerId: number;
    clientX: number;
    clientY: number;
    scale: number;
    viewport: LiveChatViewport;
  },
): LiveChatResizeGesture | null {
  if (input.pointerId !== gesture.pointerId) return null;
  return {
    ...gesture,
    size: liveChatSizeFromPointer({
      gesture,
      clientX: input.clientX,
      clientY: input.clientY,
      scale: input.scale,
      viewport: input.viewport,
    }),
  };
}

/**
 * pointerup commits the event's coordinates so the last sample is not lost.
 * pointercancel keeps the last moved size and does not apply possibly-zero coords.
 */
export function finishLiveChatResize(
  gesture: LiveChatResizeGesture,
  input: {
    type: string;
    pointerId: number;
    clientX: number;
    clientY: number;
    scale: number;
    viewport: LiveChatViewport;
  },
): LiveChatSize {
  if (input.pointerId !== gesture.pointerId) return gesture.size;
  if (input.type === "pointercancel") return gesture.size;
  return liveChatSizeFromPointer({
    gesture,
    clientX: input.clientX,
    clientY: input.clientY,
    scale: input.scale,
    viewport: input.viewport,
  });
}

export function parseLiveChatSize(raw: unknown): LiveChatSize | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isFinitePx(record.width) || !isFinitePx(record.height)) return null;
  return { width: record.width, height: record.height };
}

export function readLiveChatSize(
  storage: StorageLike | null | undefined,
  viewport: LiveChatViewport,
): LiveChatSize {
  if (!storage) {
    return clampLiveChatSize(LIVE_CHAT_DEFAULT_SIZE, viewport);
  }
  try {
    const raw = storage.getItem(LIVE_CHAT_SIZE_STORAGE_KEY);
    if (raw == null || raw === "") {
      return clampLiveChatSize(LIVE_CHAT_DEFAULT_SIZE, viewport);
    }
    const parsed = parseLiveChatSize(JSON.parse(raw) as unknown);
    return clampLiveChatSize(parsed ?? LIVE_CHAT_DEFAULT_SIZE, viewport);
  } catch {
    return clampLiveChatSize(LIVE_CHAT_DEFAULT_SIZE, viewport);
  }
}

export function writeLiveChatSize(
  size: LiveChatSize,
  storage: StorageLike | null | undefined,
  viewport: LiveChatViewport,
): void {
  if (!storage) return;
  const next = clampLiveChatSize(size, viewport);
  try {
    storage.setItem(LIVE_CHAT_SIZE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — size stays in-memory only.
  }
}
