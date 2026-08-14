"use client";

/**
 * PlayHTML-movable wrapper for the global live chat object.
 * Import only under PlayProvider.
 * CanMoveElement requires a direct DOM host child.
 */

import { CanMoveElement } from "@playhtml/react";
import {
  LIVE_CHAT_DEFAULT_STYLE,
  LIVE_CHAT_ELEMENT_ID,
  LiveChatContent,
  liveChatHostClassName,
} from "@/components/canvas/live-chat-object";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";

export function MovableLiveChatObject() {
  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={LIVE_CHAT_ELEMENT_ID}
        className={liveChatHostClassName(true)}
        style={LIVE_CHAT_DEFAULT_STYLE}
        data-4663-live-chat-host
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          <LiveChatContent />
        </div>
      </div>
    </CanMoveElement>
  );
}
