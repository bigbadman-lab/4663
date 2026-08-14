/**
 * Live chat object — UI wiring, PlayHTML, IC3.6, EVM copy reuse, identity.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatShortAddress,
  splitTextWithEvmAddresses,
} from "@/lib/canvas/format-address";
import {
  CHAT_MESSAGES_REALTIME_CHANNEL,
  CHAT_MESSAGES_TABLE,
} from "@/lib/social/chat-message";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const ADDR = "0x1234567890123456789012345678901234567890";

describe("Live chat object UI + PlayHTML", () => {
  it("object id, CanMoveElement direct DOM child, default position", () => {
    const movable = readSrc("src/components/canvas/movable-live-chat.tsx");
    assert.ok(movable.includes("CanMoveElement"));
    assert.ok(movable.includes('id={LIVE_CHAT_ELEMENT_ID}'));
    assert.ok(movable.includes("LIVE_CHAT_ELEMENT_ID"));
    // Direct DOM div — not a custom component as CanMoveElement child.
    assert.ok(/CanMoveElement[^>]*>\s*<div\b/.test(movable));

    const content = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(content.includes('4663-live-chat'));
    assert.ok(content.includes('left: "74%"'));
    assert.ok(content.includes('top: "42%"'));
    assert.ok(content.includes("data-4663-live-chat-title"));
    assert.match(content, /data-4663-live-chat-title[\s\S]{0,80}CHAT/);
    assert.ok(content.includes("say something..."));
    assert.ok(content.includes("enter a name to speak"));
    assert.ok(content.includes("No messages yet."));
    assert.ok(content.includes(">SEND</") || content.includes("\n          SEND\n"));
    assert.ok(content.includes("formatPresenceHereLabel"));
    assert.ok(content.includes("rounded-sm"));
    assert.ok(content.includes("--canvas-bg"));

    // Soft human window — no terminal / BBS chrome.
    assert.equal(content.includes("4663 // GLOBAL CHAT"), false);
    assert.equal(content.includes("GLOBAL LINE OPEN"), false);
    assert.equal(content.includes("waiting for signal"), false);
    assert.equal(content.includes("[ SEND ]"), false);
    assert.equal(content.includes("scanlines"), false);
    assert.equal(content.includes("formatChatClock"), false);
    assert.equal(content.includes("backdrop-blur"), false);
    assert.equal(content.includes("shadow-sm"), false);
    assert.equal(content.includes("&gt;"), false);

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    assert.ok(surface.includes("MovableLiveChatObject"));
  });

  it("named participation required to send; everyone can read", () => {
    const content = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(content.includes("isParticipating"));
    assert.ok(content.includes("useLiveChat"));
    assert.ok(content.includes("useParticipation"));
    assert.ok(content.includes("ChatEnterPrompt"));
    assert.ok(content.includes("requestParticipationEnter"));
    assert.equal(content.includes("dangerouslySetInnerHTML"), false);

    const chrome = readSrc("src/components/canvas/canvas-chrome.tsx");
    assert.ok(chrome.includes("OPEN_PARTICIPATION_ENTER_EVENT"));
    assert.ok(chrome.includes("addEventListener"));
  });

  it("IC3.6 protects input, send, enter prompt; EVM copy reuses control", () => {
    const content = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.ok(content.includes("useInteractiveControlProtection"));
    assert.ok(content.includes("stopPlayhtmlMoveStart"));
    assert.ok(content.includes("data-4663-live-chat-input"));
    assert.ok(content.includes("data-4663-live-chat-send"));
    assert.ok(content.includes("PonsAddressCopyControl"));
    assert.ok(content.includes('variant="inline"'));
    assert.ok(content.includes("splitTextWithEvmAddresses"));
    assert.ok(content.includes("copyTextQuiet"));
  });

  it("EVM address rendering reuses existing parser (rendering-only)", () => {
    const segments = splitTextWithEvmAddresses(`look at ${ADDR} please`);
    assert.deepEqual(segments, [
      { type: "text", value: "look at " },
      { type: "address", value: ADDR },
      { type: "text", value: " please" },
    ]);
    assert.equal(formatShortAddress(ADDR), "0x1234…7890");
    assert.deepEqual(splitTextWithEvmAddresses("see 0x1234 later"), [
      { type: "text", value: "see 0x1234 later" },
    ]);

    const content = readSrc("src/components/canvas/live-chat-object.tsx");
    // Stored body is not rewritten — only rendered via split helper.
    assert.ok(content.includes("splitTextWithEvmAddresses(body)"));
    assert.equal(content.includes("Dexscreener"), false);
    assert.equal(content.includes("Blockscout"), false);
  });

  it("Realtime channel + API path conventions", () => {
    assert.equal(CHAT_MESSAGES_REALTIME_CHANNEL, "4663-live-chat");
    assert.equal(CHAT_MESSAGES_TABLE, "chat_messages");

    const realtime = readSrc("src/lib/social/chat-realtime.ts");
    assert.ok(realtime.includes("postgres_changes"));
    assert.ok(realtime.includes('event: "INSERT"'));

    const route = readSrc("src/app/api/social/chat/route.ts");
    assert.ok(route.includes("createPresenceSupabase"));
    assert.ok(route.includes("createChatMessage"));
    assert.ok(route.includes("loadRecentChatMessages"));
    assert.equal(route.includes(".insert("), false); // insert via server helper

    const migration = readSrc(
      "supabase/migrations/20260814010000_live_chat_messages.sql",
    );
    assert.ok(migration.includes("CREATE TABLE public.chat_messages"));
    assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
    assert.ok(migration.includes("chat_messages_public_select"));
    assert.ok(migration.includes("supabase_realtime"));
    assert.ok(migration.includes("GRANT SELECT"));
    assert.ok(migration.includes("REVOKE ALL"));
  });

  it("does not touch canvas TEXT / MARK / broadcast draft paths", () => {
    const content = readSrc("src/components/canvas/live-chat-object.tsx");
    assert.equal(content.includes("4663-ephemeral-texts"), false);
    assert.equal(content.includes("canvas_marks"), false);
    assert.equal(content.includes("text-draft"), false);
    assert.equal(content.includes("usePageData"), false);

    const ephemeral = readSrc(
      "src/components/social/ephemeral-text-object.tsx",
    );
    assert.equal(ephemeral.includes("live-chat"), false);
    assert.equal(ephemeral.includes("chat_messages"), false);
  });
});
