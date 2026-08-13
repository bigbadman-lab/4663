"use client";

/**
 * Social 2A published TEXT + Social 2B live typing + Social 3A ephemeral DRAW.
 *
 * Published TEXT: PlayHTML usePageData("4663-ephemeral-texts")
 * Published DRAW: PlayHTML usePageData("4663-ephemeral-drawings")
 * Live drafts (text + drawing): Supabase Broadcast on 4663-social-broadcast
 */

import { usePageData } from "@playhtml/react";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { CanvasCreateMenu } from "@/components/social/canvas-create-menu";
import { DrawingSessionEditor } from "@/components/social/drawing-session-editor";
import { EphemeralDrawingObjectView } from "@/components/social/ephemeral-drawing-object";
import { EphemeralTextComposer } from "@/components/social/ephemeral-text-composer";
import { EphemeralTextObjectView } from "@/components/social/ephemeral-text-object";
import { LiveDrawingDraftView } from "@/components/social/live-drawing-draft";
import { LiveTextDraftView } from "@/components/social/live-text-draft";
import { getBrowserSupabaseClient } from "@/lib/events/supabase-browser";
import {
  createDrawingDraftId,
  createThrottledSender,
  DRAWING_DRAFT_STALE_MS,
  DRAWING_DRAFT_THROTTLE_MS,
  drawingDraftsForRemoteView,
  buildDrawingDraft,
  normalizeDrawingDraft,
  normalizeDrawingDraftCleared,
  pruneStaleDrawingDrafts,
  removeDrawingDraft,
  removeDrawingDraftsByOwner,
  retainDrawingDraftsForPresentOwners,
  upsertDrawingDraft,
  type DrawingDraft,
} from "@/lib/social/drawing-draft";
import {
  createEphemeralDrawingObject,
  drawingZoneOriginFromClick,
  EMPTY_EPHEMERAL_DRAWINGS_PAGE_DATA,
  EPHEMERAL_DRAWINGS_PAGE_DATA_NAME,
  fallbackAspectRatioFromSizePct,
  measureDrawingZoneAspectRatio,
  normalizeEphemeralDrawingsPageData,
  removeEphemeralDrawing,
  removeEphemeralDrawingsByOwner,
  retainEphemeralDrawingsForPresentOwners,
  upsertEphemeralDrawing,
  type DrawingStroke,
  type EphemeralDrawingsPageData,
} from "@/lib/social/ephemeral-drawing";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
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
import { registerSessionContentResetHandler } from "@/lib/social/session-content-reset";
import { createSocialBroadcastClient } from "@/lib/social/social-broadcast";
import {
  buildTextDraft,
  createTextDraftId,
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
    }
  | {
      mode: "draw";
      draftDrawingId: string;
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      aspectRatio: number;
    };

export function EphemeralTextLayer() {
  const { self, isParticipating, participants, status } = useParticipation();
  const [pageData, setPageData] = usePageData<EphemeralTextsPageData>(
    EPHEMERAL_TEXTS_PAGE_DATA_NAME,
    EMPTY_EPHEMERAL_TEXTS_PAGE_DATA,
  );
  const [drawingsPageData, setDrawingsPageData] =
    usePageData<EphemeralDrawingsPageData>(
      EPHEMERAL_DRAWINGS_PAGE_DATA_NAME,
      EMPTY_EPHEMERAL_DRAWINGS_PAGE_DATA,
    );
  const [createUi, setCreateUi] = useState<CreateUi>(null);
  const [remoteDrafts, setRemoteDrafts] = useState<TextDraft[]>([]);
  const [remoteDrawingDrafts, setRemoteDrawingDrafts] = useState<
    DrawingDraft[]
  >([]);

  const pageDataRef = useRef(pageData);
  const setPageDataRef = useRef(setPageData);
  pageDataRef.current = pageData;
  setPageDataRef.current = setPageData;

  const drawingsPageDataRef = useRef(drawingsPageData);
  const setDrawingsPageDataRef = useRef(setDrawingsPageData);
  drawingsPageDataRef.current = drawingsPageData;
  setDrawingsPageDataRef.current = setDrawingsPageData;

  const createUiRef = useRef(createUi);
  createUiRef.current = createUi;

  const broadcastRef = useRef<ReturnType<
    ReturnType<typeof createSocialBroadcastClient>["connect"]
  > | null>(null);

  const throttleRef = useRef<ReturnType<
    typeof createThrottledSender<TextDraft>
  > | null>(null);

  const drawingThrottleRef = useRef<ReturnType<
    typeof createThrottledSender<DrawingDraft>
  > | null>(null);

  const texts = normalizeEphemeralTextsPageData(pageData).texts;
  const drawings = normalizeEphemeralDrawingsPageData(drawingsPageData).drawings;

  const writePageData = (next: EphemeralTextsPageData) => {
    setPageDataRef.current(normalizeEphemeralTextsPageData(next));
  };

  const writeDrawingsPageData = (next: EphemeralDrawingsPageData) => {
    setDrawingsPageDataRef.current(normalizeEphemeralDrawingsPageData(next));
  };

  const clearLocalDraftBroadcast = (draftId: string, ownerSessionId: string) => {
    throttleRef.current?.cancel();
    const sub = broadcastRef.current;
    if (!sub) return;
    void sub
      .sendDraftCleared({ draftId, ownerSessionId })
      .catch(() => {});
  };

  const clearLocalDrawingDraftBroadcast = (
    draftDrawingId: string,
    ownerSessionId: string,
  ) => {
    drawingThrottleRef.current?.cancel();
    const sub = broadcastRef.current;
    if (!sub) return;
    void sub
      .sendDrawingDraftCleared({ draftDrawingId, ownerSessionId })
      .catch(() => {});
  };

  // Broadcast channel — one subscription for text + drawing drafts.
  useEffect(() => {
    let sub: ReturnType<
      ReturnType<typeof createSocialBroadcastClient>["connect"]
    > | null = null;

    try {
      const supabase = getBrowserSupabaseClient();
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
        onDrawingDraftUpdated: (payload) => {
          const draft = normalizeDrawingDraft(payload);
          if (!draft) return;
          setRemoteDrawingDrafts((prev) => upsertDrawingDraft(prev, draft));
        },
        onDrawingDraftCleared: (payload) => {
          const cleared = normalizeDrawingDraftCleared(payload);
          if (!cleared) return;
          setRemoteDrawingDrafts((prev) =>
            removeDrawingDraft(prev, cleared.draftDrawingId),
          );
        },
        onStatus: () => {},
      });
      broadcastRef.current = sub;

      throttleRef.current = createThrottledSender((draft) => {
        void broadcastRef.current?.sendDraftUpdated(draft).catch(() => {});
      }, TEXT_DRAFT_THROTTLE_MS);

      drawingThrottleRef.current = createThrottledSender((draft) => {
        void broadcastRef.current
          ?.sendDrawingDraftUpdated(draft)
          .catch(() => {});
      }, DRAWING_DRAFT_THROTTLE_MS);
    } catch {
      broadcastRef.current = null;
      throttleRef.current = null;
      drawingThrottleRef.current = null;
    }

    return () => {
      throttleRef.current?.cancel();
      throttleRef.current = null;
      drawingThrottleRef.current?.cancel();
      drawingThrottleRef.current = null;
      sub?.disconnect();
      broadcastRef.current = null;
    };
  }, []);

  // Explicit LEAVE / RESET → clear composer/draw + owned published objects.
  useEffect(() => {
    const clearOwned = (sessionId: string) => {
      const ui = createUiRef.current;
      if (ui?.mode === "compose") {
        clearLocalDraftBroadcast(ui.draftId, sessionId);
      }
      if (ui?.mode === "draw") {
        clearLocalDrawingDraftBroadcast(ui.draftDrawingId, sessionId);
      }
      setCreateUi(null);
      writePageData(
        removeEphemeralTextsByOwner(
          normalizeEphemeralTextsPageData(pageDataRef.current),
          sessionId,
        ),
      );
      writeDrawingsPageData(
        removeEphemeralDrawingsByOwner(
          normalizeEphemeralDrawingsPageData(drawingsPageDataRef.current),
          sessionId,
        ),
      );
      setRemoteDrafts((prev) => removeTextDraftsByOwner(prev, sessionId));
      setRemoteDrawingDrafts((prev) =>
        removeDrawingDraftsByOwner(prev, sessionId),
      );
    };

    const unsubLeave = registerSessionEndedHandler(({ sessionId }) => {
      clearOwned(sessionId);
    });
    const unsubReset = registerSessionContentResetHandler(({ sessionId }) => {
      clearOwned(sessionId);
    });
    return () => {
      unsubLeave();
      unsubReset();
    };
  }, []);

  // Presence-loss: published texts/drawings + remote drafts.
  useEffect(() => {
    if (status === "connecting" || status === "error") return;

    const present = new Set(participants.map((p) => p.sessionId));
    if (self) present.add(self.sessionId);

    const currentTexts = normalizeEphemeralTextsPageData(pageDataRef.current);
    if (currentTexts.texts.length > 0) {
      const next = retainEphemeralTextsForPresentOwners(currentTexts, present);
      if (next.texts.length !== currentTexts.texts.length) {
        writePageData(next);
      }
    }

    const currentDrawings = normalizeEphemeralDrawingsPageData(
      drawingsPageDataRef.current,
    );
    if (currentDrawings.drawings.length > 0) {
      const next = retainEphemeralDrawingsForPresentOwners(
        currentDrawings,
        present,
      );
      if (next.drawings.length !== currentDrawings.drawings.length) {
        writeDrawingsPageData(next);
      }
    }

    setRemoteDrafts((prev) => {
      if (prev.length === 0) return prev;
      const next = retainTextDraftsForPresentOwners(prev, present);
      return next.length === prev.length ? prev : next;
    });

    setRemoteDrawingDrafts((prev) => {
      if (prev.length === 0) return prev;
      const next = retainDrawingDraftsForPresentOwners(prev, present);
      return next.length === prev.length ? prev : next;
    });
  }, [participants, self, status]);

  // Stale remote draft prune (text + drawing).
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setRemoteDrafts((prev) => {
        if (prev.length === 0) return prev;
        const next = pruneStaleTextDrafts(prev, now, TEXT_DRAFT_STALE_MS);
        return next.length === prev.length ? prev : next;
      });
      setRemoteDrawingDrafts((prev) => {
        if (prev.length === 0) return prev;
        const next = pruneStaleDrawingDrafts(
          prev,
          now,
          DRAWING_DRAFT_STALE_MS,
        );
        return next.length === prev.length ? prev : next;
      });
    }, 2_000);
    return () => window.clearInterval(id);
  }, []);

  const abandonCreate = () => {
    const ui = createUiRef.current;
    if (ui?.mode === "compose" && self) {
      clearLocalDraftBroadcast(ui.draftId, self.sessionId);
    }
    if (ui?.mode === "draw" && self) {
      clearLocalDrawingDraftBroadcast(ui.draftDrawingId, self.sessionId);
    }
    setCreateUi(null);
  };

  const onEmptyCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isParticipating || !self) return;
    if (createUi) {
      abandonCreate();
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

  const onDrawingStrokesChange = (strokes: DrawingStroke[]) => {
    if (!self) return;
    const ui = createUiRef.current;
    if (ui?.mode !== "draw") return;
    const draft = buildDrawingDraft({
      draftDrawingId: ui.draftDrawingId,
      ownerSessionId: self.sessionId,
      strokes,
      leftPct: ui.leftPct,
      topPct: ui.topPct,
      widthPct: ui.widthPct,
      heightPct: ui.heightPct,
      aspectRatio: ui.aspectRatio,
    });
    if (!draft) return;
    if (strokes.length === 0) {
      drawingThrottleRef.current?.cancel();
      void broadcastRef.current
        ?.sendDrawingDraftCleared({
          draftDrawingId: draft.draftDrawingId,
          ownerSessionId: draft.ownerSessionId,
        })
        .catch(() => {});
      return;
    }
    drawingThrottleRef.current?.push(draft);
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

  const publishDrawing = (strokes: DrawingStroke[]) => {
    if (!self) return;
    const ui = createUiRef.current;
    if (ui?.mode !== "draw") return;

    const created = createEphemeralDrawingObject({
      drawingId: ui.draftDrawingId,
      ownerSessionId: self.sessionId,
      strokes,
      leftPct: ui.leftPct,
      topPct: ui.topPct,
      widthPct: ui.widthPct,
      heightPct: ui.heightPct,
      aspectRatio: ui.aspectRatio,
    });
    if (!created.ok) return;

    drawingThrottleRef.current?.cancel();
    clearLocalDrawingDraftBroadcast(ui.draftDrawingId, self.sessionId);

    writeDrawingsPageData(
      upsertEphemeralDrawing(
        normalizeEphemeralDrawingsPageData(drawingsPageDataRef.current),
        created.drawing,
      ),
    );
    setCreateUi(null);
  };

  const onDeleteText = (textId: string) => {
    if (!self) return;
    const current = normalizeEphemeralTextsPageData(pageDataRef.current);
    const target = current.texts.find((t) => t.textId === textId);
    if (!target || target.ownerSessionId !== self.sessionId) return;
    writePageData(removeEphemeralText(current, textId));
  };

  const onDeleteDrawing = (drawingId: string) => {
    if (!self) return;
    const current = normalizeEphemeralDrawingsPageData(
      drawingsPageDataRef.current,
    );
    const target = current.drawings.find((d) => d.drawingId === drawingId);
    if (!target || target.ownerSessionId !== self.sessionId) return;
    writeDrawingsPageData(removeEphemeralDrawing(current, drawingId));
  };

  const visibleRemoteDrafts = draftsForRemoteView(
    remoteDrafts,
    self?.sessionId ?? null,
  );
  const visibleRemoteDrawingDrafts = drawingDraftsForRemoteView(
    remoteDrawingDrafts,
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
          onDelete={onDeleteText}
        />
      ))}

      {drawings.map((drawing) => (
        <EphemeralDrawingObjectView
          key={drawing.drawingId}
          drawing={drawing}
          isOwner={self?.sessionId === drawing.ownerSessionId}
          onDelete={onDeleteDrawing}
        />
      ))}

      {visibleRemoteDrafts.map((draft) => (
        <LiveTextDraftView key={draft.draftId} draft={draft} />
      ))}

      {visibleRemoteDrawingDrafts.map((draft) => (
        <LiveDrawingDraftView
          key={draft.draftDrawingId}
          draft={draft}
        />
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
            onChooseDraw={() => {
              const zone = drawingZoneOriginFromClick(
                createUi.leftPct,
                createUi.topPct,
              );
              const canvas = document.getElementById(PLAYHTML_CANVAS_BOUNDS_ID);
              const canvasRect = canvas?.getBoundingClientRect();
              const measured =
                canvasRect != null
                  ? measureDrawingZoneAspectRatio(
                      canvasRect.width,
                      canvasRect.height,
                      zone.widthPct,
                      zone.heightPct,
                    )
                  : null;
              const aspectRatio =
                measured ??
                fallbackAspectRatioFromSizePct(
                  zone.widthPct,
                  zone.heightPct,
                ) ??
                1;
              setCreateUi({
                mode: "draw",
                draftDrawingId: createDrawingDraftId(),
                ...zone,
                aspectRatio,
              });
            }}
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
            onCancel={abandonCreate}
            onDraftBodyChange={onDraftBodyChange}
          />
        </div>
      ) : null}

      {createUi?.mode === "draw" && self ? (
        <DrawingSessionEditor
          draftDrawingId={createUi.draftDrawingId}
          leftPct={createUi.leftPct}
          topPct={createUi.topPct}
          widthPct={createUi.widthPct}
          aspectRatio={createUi.aspectRatio}
          onStrokesChange={onDrawingStrokesChange}
          onDone={publishDrawing}
          onCancel={abandonCreate}
        />
      ) : null}
    </div>
  );
}
