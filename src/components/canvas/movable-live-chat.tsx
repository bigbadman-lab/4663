"use client";

/**
 * PlayHTML-movable wrapper for the global live chat object.
 * Import only under PlayProvider.
 * CanMoveElement requires a direct DOM host child.
 *
 * Centering translate lives on this host so the hittable box matches the
 * visible panel (not an inner wrapper that leaves an empty host quadrant).
 */

import { CanMoveElement } from "@playhtml/react";
import {
  LIVE_CHAT_DEFAULT_STYLE,
  LIVE_CHAT_ELEMENT_ID,
  LiveChatContent,
  liveChatHostClassName,
} from "@/components/canvas/live-chat-object";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";

export function MovableLiveChatObject() {
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={LIVE_CHAT_ELEMENT_ID}
        className={liveChatHostClassName(true)}
        style={LIVE_CHAT_DEFAULT_STYLE}
        data-4663-live-chat-host
        onPointerDown={move.onPointerDown}
        onPointerUp={move.onPointerUp}
        onPointerCancel={move.onPointerCancel}
      >
        <LiveChatContent />
      </div>
    </CanMoveElement>
  );
}
