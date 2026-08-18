/**
 * Live chat hitbox — host bounds equal the visible panel when the
 * centering translate lives on the PlayHTML host (not an inner wrapper).
 */

import {
  LIVE_CHAT_DEFAULT_HEIGHT_PX,
  LIVE_CHAT_DEFAULT_WIDTH_PX,
  type LiveChatSize,
} from "@/lib/social/live-chat-size";

export type LiveChatHitRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type LiveChatHitPoint = {
  x: number;
  y: number;
};

export type LiveChatPointerRegion =
  | "header"
  | "list"
  | "composer"
  | "send"
  | "enter"
  | "resize"
  | "outside";

export type LiveChatOverlapTarget = "chat" | "other" | "empty";

/** Default visible panel — host must match this, not a larger untranslated box. */
export const LIVE_CHAT_DEFAULT_PANEL_SIZE: LiveChatSize = {
  width: LIVE_CHAT_DEFAULT_WIDTH_PX,
  height: LIVE_CHAT_DEFAULT_HEIGHT_PX,
};

/**
 * Visual + hit rect when the host is `translate(-50%, -50%)` at an origin.
 * Inner-wrapper translate is forbidden: that leaves the host's untranslated
 * box hanging to the bottom-right of the origin.
 */
export function liveChatCenteredHostRect(input: {
  originLeft: number;
  originTop: number;
  width: number;
  height: number;
}): LiveChatHitRect {
  return {
    left: input.originLeft - input.width / 2,
    top: input.originTop - input.height / 2,
    width: input.width,
    height: input.height,
  };
}

export function pointInLiveChatRect(
  point: LiveChatHitPoint,
  rect: LiveChatHitRect,
): boolean {
  return (
    point.x >= rect.left &&
    point.x < rect.left + rect.width &&
    point.y >= rect.top &&
    point.y < rect.top + rect.height
  );
}

export function pointJustOutsideLiveChat(
  rect: LiveChatHitRect,
  edge: "left" | "right" | "top" | "bottom",
  gap = 1,
): LiveChatHitPoint {
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;
  if (edge === "left") return { x: rect.left - gap, y: midY };
  if (edge === "right") return { x: rect.left + rect.width + gap - 1e-6, y: midY };
  if (edge === "top") return { x: midX, y: rect.top - gap };
  return { x: midX, y: rect.top + rect.height + gap - 1e-6 };
}

/** Only the header starts PlayHTML move. */
export function liveChatRegionStartsMove(
  region: LiveChatPointerRegion,
): boolean {
  return region === "header";
}

/**
 * A neighbouring object in the old oversized host quadrant (bottom-right of
 * origin) must win when the point is outside the visible chat rectangle.
 */
export function liveChatOverlapHit(input: {
  chat: LiveChatHitRect;
  other: LiveChatHitRect;
  point: LiveChatHitPoint;
}): LiveChatOverlapTarget {
  if (pointInLiveChatRect(input.point, input.chat)) return "chat";
  if (pointInLiveChatRect(input.point, input.other)) return "other";
  return "empty";
}

/** Host and visible panel share one box after resize / session restore. */
export function liveChatHostMatchesPanel(
  host: LiveChatSize,
  panel: LiveChatSize,
): boolean {
  return host.width === panel.width && host.height === panel.height;
}
