"use client";

/**
 * Social 2A published TEXT + Social 2B live typing drafts.
 *
 * Published: PlayHTML usePageData("4663-ephemeral-texts") — unchanged.
 * Drafts: Supabase Broadcast on 4663-social-broadcast — transient only.
 */

import { usePageData } from "@playhtml/react";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { CanvasCreateMenu } from "@/components/social/canvas-create-menu";
import { EphemeralTextComposer } from "@/components/social/ephemeral-text-composer";
import { EphemeralTextObjectView } from "@/components/social/ephemeral-text-object";
import { LiveTextDraftView } from "@/components/social/live-text-draft";
import { createBrowserSupabase } from "@/lib/events/supabase-browser";
import {
  createEphemeralTextObject,
  EMPTY_EPHEMERAL_TEXTS_PAGE_DATA,
  EPHEMERAL_TEXTS_PAGE_DATA_NAME,
  normalizeEphemeralTextsPageData,
  pointerToCanvasPct,
  removeEphemeralText,
  removeEphemeralTextsByOwner,
  retainEphemeralTextsForPresentOwners,
  upsertEphemeralText,
  type EphemeralTextsPageData,
} from "@/lib/social/ephemeral-text";
import { registerSessionEndedHandler } from "@/lib/social/session-cleanup";
import { createSocialBroadcastClient } from "@/lib/social/social-broadcast";
import {
  buildTextDraft,
  createTextDraftId,
  createThrottledSender,
  draftsForRemoteView,
  normalizeTextDraft,
  normalizeTextDraftCleared,
  pruneStaleTextDrafts,
  removeTextDraft,
  removeTextDraftsByOwner,
  retainTextDraftsForPresentOwners,
  TEXT_DRAFT_STALE_MS,
  TEXT_DRAFT_THROTTLE_MS,
  upsertTextDraft,
  type TextDraft,
} from "@/lib/social/text-draft";
import { useParticipation } from "@/lib/social/use-participation";

type CreateUi =
  | null
  | { mode: "menu"; leftPct: number; topPct: number }
  | {
      mode: "compose";
      leftPct: number;
      topPct: number;
      draftId: string;
    };

export function EphemeralTextLayer() {
  const { self, isParticipating, participants, status } = useParticipation();
  const [pageData, setPageData] = usePageData<EphemeralTextsPageData>(
    EPHEMERAL_TEXTS_PAGE_DATA_NAME,
    EMPTY_EPHEMERAL_TEXTS_PAGE_DATA,
  );
  const [createUi, setCreateUi] = useState<CreateUi>(null);
  const [remoteDrafts, setRemoteDrafts] = useState<TextDraft[]>([]);

  const pageDataRef = useRef(pageData);
  const setPageDataRef = useRef(setPageData);
  pageDataRef.current = pageData;
  setPageDataRef.current = setPageData;

  const createUiRef = useRef(createUi);
  createUiRef.current = createUi;

  const broadcastRef = useRef<ReturnType<
    ReturnType<typeof createSocialBroadcastClient>["connect"]
  > | null>(null);

  const throttleRef = useRef<ReturnType<
    typeof createThrottledSender<TextDraft>
  > | null>(null);

  const texts = normalizeEphemeralTextsPageData(pageData).texts;

  const writePageData = (next: EphemeralTextsPageData) => {
    setPageDataRef.current(normalizeEphemeralTextsPageData(next));
  };

  const clearLocalDraftBroadcast = (draftId: string, ownerSessionId: string) => {
    throttleRef.current?.cancel();
    const sub = broadcastRef.current;
    if (!sub) return;
    void sub
      .sendDraftCleared({ draftId, ownerSessionId })
      .catch(() => {});
  };

  // Broadcast channel — one subscription for the canvas lifetime.
  useEffect(() => {
    let sub: ReturnType<
      ReturnType<typeof createSocialBroadcastClient>["connect"]
    > | null = null;

    try {
      const supabase = createBrowserSupabase();
      const client = createSocialBroadcastClient(supabase);
      sub = client.connect({
        onDraftUpdated: (payload) => {
          const draft = normalizeTextDraft(payload);
          if (!draft) return;
          setRemoteDrafts((prev) => upsertTextDraft(prev, draft));
        },
        onDraftCleared: (payload) => {
          const cleared = normalizeTextDraftCleared(payload);
          if (!cleared) return;
          setRemoteDrafts((prev) => removeTextDraft(prev, cleared.draftId));
        },
        onStatus: () => {},
      });
      broadcastRef.current = sub;

      throttleRef.current = createThrottledSender((draft) => {
        void broadcastRef.current?.sendDraftUpdated(draft).catch(() => {});
      }, TEXT_DRAFT_THROTTLE_MS);
    } catch {
      broadcastRef.current = null;
      throttleRef.current = null;
    }

    return () => {
      throttleRef.current?.cancel();
      throttleRef.current = null;
      sub?.disconnect();
      broadcastRef.current = null;
    };
  }, []);

  // Explicit LEAVE → clear composer + local draft broadcast + published texts.
  useEffect(() => {
    return registerSessionEndedHandler(({ sessionId }) => {
      const ui = createUiRef.current;
      if (ui?.mode === "compose") {
        clearLocalDraftBroadcast(ui.draftId, sessionId);
      }
      setCreateUi(null);
      const next = removeEphemeralTextsByOwner(
        normalizeEphemeralTextsPageData(pageDataRef.current),
        sessionId,
      );
      writePageData(next);
      setRemoteDrafts((prev) => removeTextDraftsByOwner(prev, sessionId));
    });
  }, []);

  // Presence-loss: published texts + remote drafts.
  useEffect(() => {
    if (status === "connecting" || status === "error") return;

    const present = new Set(participants.map((p) => p.sessionId));
    if (self) present.add(self.sessionId);

    const current = normalizeEphemeralTextsPageData(pageDataRef.current);
    if (current.texts.length > 0) {
      const next = retainEphemeralTextsForPresentOwners(current, present);
      if (next.texts.length !== current.texts.length) {
        writePageData(next);
      }
    }

    setRemoteDrafts((prev) => {
      if (prev.length === 0) return prev;
      const next = retainTextDraftsForPresentOwners(prev, present);
      return next.length === prev.length ? prev : next;
    });
  }, [participants, self, status]);

  // Stale remote draft prune.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setRemoteDrafts((prev) => {
        if (prev.length === 0) return prev;
        const next = pruneStaleTextDrafts(prev, now, TEXT_DRAFT_STALE_MS);
        return next.length === prev.length ? prev : next;
      });
    }, 2_000);
    return () => window.clearInterval(id);
  }, []);

  const abandonCompose = () => {
    const ui = createUiRef.current;
    if (ui?.mode === "compose" && self) {
      clearLocalDraftBroadcast(ui.draftId, self.sessionId);
    }
    setCreateUi(null);
  };

  const onEmptyCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isParticipating || !self) return;
    if (createUi) {
      abandonCompose();
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const { leftPct, topPct } = pointerToCanvasPct(
      event.clientX,
      event.clientY,
      bounds,
    );
    setCreateUi({ mode: "menu", leftPct, topPct });
  };

  const onDraftBodyChange = (body: string) => {
    if (!self) return;
    const ui = createUiRef.current;
    if (ui?.mode !== "compose") return;
    const draft = buildTextDraft({
      draftId: ui.draftId,
      ownerSessionId: self.sessionId,
      body,
      leftPct: ui.leftPct,
      topPct: ui.topPct,
    });
    if (!draft) return;
    // Skip broadcasting empty first frame; wait for first character.
    if (draft.body.length === 0) {
      throttleRef.current?.cancel();
      void broadcastRef.current
        ?.sendDraftCleared({
          draftId: draft.draftId,
          ownerSessionId: draft.ownerSessionId,
        })
        .catch(() => {});
      return;
    }
    throttleRef.current?.push(draft);
  };

  const publish = (body: string) => {
    if (!self) return { ok: false as const, error: "Enter to publish." };
    const ui = createUiRef.current;
    if (ui?.mode !== "compose") {
      return { ok: false as const, error: "Nothing to publish." };
    }
    const created = createEphemeralTextObject({
      body,
      ownerSessionId: self.sessionId,
      leftPct: ui.leftPct,
      topPct: ui.topPct,
    });
    if (!created.ok) return created;

    // Clear live draft before publishing immutable TEXT (avoid ghost draft).
    throttleRef.current?.cancel();
    clearLocalDraftBroadcast(ui.draftId, self.sessionId);

    const next = upsertEphemeralText(
      normalizeEphemeralTextsPageData(pageDataRef.current),
      created.text,
    );
    writePageData(next);
    setCreateUi(null);
    return { ok: true as const };
  };

  const onDelete = (textId: string) => {
    if (!self) return;
    const current = normalizeEphemeralTextsPageData(pageDataRef.current);
    const target = current.texts.find((t) => t.textId === textId);
    if (!target || target.ownerSessionId !== self.sessionId) return;
    writePageData(removeEphemeralText(current, textId));
  };

  const visibleRemoteDrafts = draftsForRemoteView(
    remoteDrafts,
    self?.sessionId ?? null,
  );

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-4663-ephemeral-text-layer
    >
      <div
        className="pointer-events-auto absolute inset-0 z-0"
        data-4663-canvas-empty-hit
        data-4663-canvas-empty-named={isParticipating ? "true" : "false"}
        onClick={onEmptyCanvasClick}
        aria-hidden
      />

      {texts.map((text) => (
        <EphemeralTextObjectView
          key={text.textId}
          text={text}
          isOwner={self?.sessionId === text.ownerSessionId}
          onDelete={onDelete}
        />
      ))}

      {visibleRemoteDrafts.map((draft) => (
        <LiveTextDraftView key={draft.draftId} draft={draft} />
      ))}

      {createUi?.mode === "menu" ? (
        <div className="pointer-events-auto">
          <CanvasCreateMenu
            leftPct={createUi.leftPct}
            topPct={createUi.topPct}
            onChooseText={() =>
              setCreateUi({
                mode: "compose",
                leftPct: createUi.leftPct,
                topPct: createUi.topPct,
                draftId: createTextDraftId(),
              })
            }
            onCancel={() => setCreateUi(null)}
          />
        </div>
      ) : null}

      {createUi?.mode === "compose" && self ? (
        <div className="pointer-events-auto">
          <EphemeralTextComposer
            leftPct={createUi.leftPct}
            topPct={createUi.topPct}
            colour={self.colour}
            onPublish={publish}
            onCancel={abandonCompose}
            onDraftBodyChange={onDraftBodyChange}
          />
        </div>
      ) : null}
    </div>
  );
}
