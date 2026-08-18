"use client";

/**
 * Social 2A published TEXT + Social 2B live typing + Social 3A ephemeral DRAW
 * + Social 3B world BRUSH + Social 6 MARK create entry (durable marks; not session-ephemeral)
 * + LINK + TOKEN objects (PlayHTML page data snapshots).
 *
 * Published TEXT: PlayHTML usePageData("4663-ephemeral-texts")
 * Published DRAW: PlayHTML usePageData("4663-ephemeral-drawings")
 * Published BRUSH: PlayHTML usePageData("4663-ephemeral-brush-strokes")
 * Published LINK: PlayHTML usePageData("4663-canvas-links")
 * Published TOKEN: PlayHTML usePageData("4663-canvas-tokens")
 * Live drafts (text + drawing + brush): Supabase Broadcast on 4663-social-broadcast
 * MARK: Postgres via /api/social/marks (survives LEAVE/RESET/Presence loss)
 */

import { usePageData, usePlayContext } from "@playhtml/react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { BrushSessionOverlay } from "@/components/social/brush-session-overlay";
import { CanvasCreateMenu } from "@/components/social/canvas-create-menu";
import { CanvasDrawModeChooser } from "@/components/social/canvas-draw-mode-chooser";
import { CanvasLinkComposer } from "@/components/social/canvas-link-composer";
import { CanvasLinkObjectView } from "@/components/social/canvas-link-object";
import { CanvasTokenComposer } from "@/components/social/canvas-token-composer";
import { CanvasTokenObjectView } from "@/components/social/canvas-token-object";
import { CanvasMarkObject } from "@/components/social/canvas-mark-object";
import { DrawingSessionEditor } from "@/components/social/drawing-session-editor";
import { EphemeralBrushLayer } from "@/components/social/ephemeral-brush-layer";
import { EphemeralDrawingObjectView } from "@/components/social/ephemeral-drawing-object";
import { EphemeralTextComposer } from "@/components/social/ephemeral-text-composer";
import { EphemeralTextObjectView } from "@/components/social/ephemeral-text-object";
import { LiveBrushDraftView } from "@/components/social/live-brush-draft";
import { LiveDrawingDraftView } from "@/components/social/live-drawing-draft";
import { LiveTextDraftView } from "@/components/social/live-text-draft";
import { MarkComposer } from "@/components/social/mark-composer";
import { getBrowserSupabaseClient } from "@/lib/events/supabase-browser";
import { beginLinkIfNamed } from "@/lib/social/canvas-link-actions";
import { beginTokenIfNamed } from "@/lib/social/canvas-token-actions";
import {
  CANVAS_LINK_LIMIT_MESSAGE,
  CANVAS_LINKS_PAGE_DATA_NAME,
  canPlaceCanvasLink,
  commitCanvasLinkPublish,
  createCanvasLinkObject,
  EMPTY_CANVAS_LINKS_PAGE_DATA,
  isPlayhtmlPageDataWritable,
  normalizeCanvasLinksPageData,
  removeCanvasLink,
  removeCanvasLinksByOwner,
  retainCanvasLinksForPresentOwners,
  type CanvasLinksPageData,
} from "@/lib/social/canvas-link";
import type { LinkPreview } from "@/lib/social/link-preview";
import {
  CANVAS_TOKEN_LIMIT_MESSAGE,
  CANVAS_TOKENS_PAGE_DATA_NAME,
  canPlaceCanvasToken,
  commitCanvasTokenPublish,
  createCanvasTokenObject,
  EMPTY_CANVAS_TOKENS_PAGE_DATA,
  normalizeCanvasTokensPageData,
  removeCanvasToken,
  removeCanvasTokensByOwner,
  retainCanvasTokensForPresentOwners,
  type CanvasTokensPageData,
  type ResolvedCanvasToken,
} from "@/lib/social/canvas-token";
import { validateMarkBody, MARK_ENABLED } from "@/lib/social/canvas-mark";
import { useCanvasMarks } from "@/lib/social/use-canvas-marks";
import {
  brushDraftCanPublish,
  brushDraftsForRemoteView,
  BRUSH_DRAFT_STALE_MS,
  BRUSH_DRAFT_THROTTLE_MS,
  buildBrushDraft,
  createBrushDraftId,
  normalizeBrushDraft,
  normalizeBrushDraftCleared,
  pruneStaleBrushDrafts,
  removeBrushDraft,
  removeBrushDraftsByOwner,
  retainBrushDraftsForPresentOwners,
  upsertBrushDraft,
  type BrushDraft,
} from "@/lib/social/brush-draft";
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
  commitBrushPublish,
  EMPTY_EPHEMERAL_BRUSH_PAGE_DATA,
  EPHEMERAL_BRUSH_PAGE_DATA_NAME,
  isBrushPageDataWritable,
  normalizeEphemeralBrushPageData,
  removeEphemeralBrushDocumentsByOwner,
  retainEphemeralBrushDocumentsForPresentOwners,
  type BrushStroke,
  type EphemeralBrushPageData,
} from "@/lib/social/ephemeral-brush";
import {
  createEphemeralDrawingObject,
  drawingZoneOriginFromClick,
  drawingZoneWorldAspectRatio,
  EMPTY_EPHEMERAL_DRAWINGS_PAGE_DATA,
  EPHEMERAL_DRAWINGS_PAGE_DATA_NAME,
  normalizeEphemeralDrawingsPageData,
  removeEphemeralDrawing,
  removeEphemeralDrawingsByOwner,
  resizeEphemeralDrawing,
  retainEphemeralDrawingsForPresentOwners,
  upsertEphemeralDrawing,
  type DrawingStroke,
  type EphemeralDrawingsPageData,
} from "@/lib/social/ephemeral-drawing";
import { fitDrawingToVisibleInk } from "@/lib/social/drawing-ink-bounds";
import {
  dockCreateWorldPct,
  homePctToWorldPct,
  screenPointToWorldPct,
} from "@/lib/canvas/world-camera";
import {
  getCanvasPlacementSnapshot,
  setCreateUiBlocksPan,
  shouldSuppressEmptyCanvasClick,
} from "@/components/canvas/use-canvas-camera";
import {
  createEphemeralTextObject,
  EMPTY_EPHEMERAL_TEXTS_PAGE_DATA,
  EPHEMERAL_TEXTS_PAGE_DATA_NAME,
  normalizeEphemeralTextsPageData,
  removeEphemeralText,
  removeEphemeralTextsByOwner,
  resizeEphemeralText,
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
import {
  DOCK_CREATE_DEFAULT_ORIGIN,
  registerCanvasCreateActions,
  registerEmptyCanvasClick,
} from "@/lib/social/canvas-create-actions";

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
      /** DRAW → OBJECT / BRUSH chooser (dock + empty-canvas DRAW). */
      mode: "draw-chooser";
      leftPct: number;
      topPct: number;
    }
  | {
      mode: "draw";
      draftDrawingId: string;
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      aspectRatio: number;
    }
  | {
      mode: "brush";
      draftBrushId: string;
      toolsLeftPct: number;
      toolsTopPct: number;
    }
  | {
      mode: "link";
      leftPct: number;
      topPct: number;
    }
  | {
      mode: "token";
      leftPct: number;
      topPct: number;
    }
  | {
      mode: "mark";
      leftPct: number;
      topPct: number;
    };

export function EphemeralTextLayer() {
  const { self, isParticipating, participants, status } = useParticipation();
  const {
    marks,
    hasMarkForSession,
    createMark,
  } = useCanvasMarks();
  const [pageData, setPageData] = usePageData<EphemeralTextsPageData>(
    EPHEMERAL_TEXTS_PAGE_DATA_NAME,
    EMPTY_EPHEMERAL_TEXTS_PAGE_DATA,
  );
  const [drawingsPageData, setDrawingsPageData] =
    usePageData<EphemeralDrawingsPageData>(
      EPHEMERAL_DRAWINGS_PAGE_DATA_NAME,
      EMPTY_EPHEMERAL_DRAWINGS_PAGE_DATA,
    );
  const [brushPageData, setBrushPageData] = usePageData<EphemeralBrushPageData>(
    EPHEMERAL_BRUSH_PAGE_DATA_NAME,
    EMPTY_EPHEMERAL_BRUSH_PAGE_DATA,
  );
  const [linksPageData, setLinksPageData] = usePageData<CanvasLinksPageData>(
    CANVAS_LINKS_PAGE_DATA_NAME,
    EMPTY_CANVAS_LINKS_PAGE_DATA,
  );
  const [tokensPageData, setTokensPageData] = usePageData<CanvasTokensPageData>(
    CANVAS_TOKENS_PAGE_DATA_NAME,
    EMPTY_CANVAS_TOKENS_PAGE_DATA,
  );
  const { isLoading: playhtmlLoading, isProviderMissing } = usePlayContext();
  const [createUi, setCreateUi] = useState<CreateUi>(null);
  const [remoteDrafts, setRemoteDrafts] = useState<TextDraft[]>([]);
  const [remoteDrawingDrafts, setRemoteDrawingDrafts] = useState<
    DrawingDraft[]
  >([]);
  const [remoteBrushDrafts, setRemoteBrushDrafts] = useState<BrushDraft[]>(
    [],
  );

  const pageDataRef = useRef(pageData);
  const setPageDataRef = useRef(setPageData);
  pageDataRef.current = pageData;
  setPageDataRef.current = setPageData;

  const drawingsPageDataRef = useRef(drawingsPageData);
  const setDrawingsPageDataRef = useRef(setDrawingsPageData);
  drawingsPageDataRef.current = drawingsPageData;
  setDrawingsPageDataRef.current = setDrawingsPageData;

  const brushPageDataRef = useRef(brushPageData);
  const setBrushPageDataRef = useRef(setBrushPageData);
  brushPageDataRef.current = brushPageData;
  setBrushPageDataRef.current = setBrushPageData;

  const linksPageDataRef = useRef(linksPageData);
  const setLinksPageDataRef = useRef(setLinksPageData);
  linksPageDataRef.current = linksPageData;
  setLinksPageDataRef.current = setLinksPageData;

  const tokensPageDataRef = useRef(tokensPageData);
  const setTokensPageDataRef = useRef(setTokensPageData);
  tokensPageDataRef.current = tokensPageData;
  setTokensPageDataRef.current = setTokensPageData;

  const brushPageDataReadyRef = useRef(false);
  brushPageDataReadyRef.current = isBrushPageDataWritable({
    isLoading: playhtmlLoading,
    isProviderMissing,
  });
  const linksPageDataReadyRef = useRef(false);
  linksPageDataReadyRef.current = isPlayhtmlPageDataWritable({
    isLoading: playhtmlLoading,
    isProviderMissing,
  });
  const tokensPageDataReadyRef = useRef(false);
  tokensPageDataReadyRef.current = isPlayhtmlPageDataWritable({
    isLoading: playhtmlLoading,
    isProviderMissing,
  });

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

  const brushThrottleRef = useRef<ReturnType<
    typeof createThrottledSender<BrushDraft>
  > | null>(null);

  /** Latest local BRUSH strokes (for dock DRAW toggle-exit finalize). */
  const brushStrokesRef = useRef<BrushStroke[]>([]);
  const publishBrushRef = useRef<(strokes: BrushStroke[]) => boolean>(
    () => false,
  );

  const texts = normalizeEphemeralTextsPageData(pageData).texts;
  const drawings = normalizeEphemeralDrawingsPageData(drawingsPageData).drawings;
  const brushDocuments =
    normalizeEphemeralBrushPageData(brushPageData).documents;
  const links = normalizeCanvasLinksPageData(linksPageData).links;
  const tokens = normalizeCanvasTokensPageData(tokensPageData).tokens;

  const writePageData = (next: EphemeralTextsPageData) => {
    const normalized = normalizeEphemeralTextsPageData(next);
    pageDataRef.current = normalized;
    setPageDataRef.current(normalized);
  };

  const writeDrawingsPageData = (next: EphemeralDrawingsPageData) => {
    const normalized = normalizeEphemeralDrawingsPageData(next);
    drawingsPageDataRef.current = normalized;
    setDrawingsPageDataRef.current(normalized);
  };

  const writeBrushPageData = (next: EphemeralBrushPageData) => {
    setBrushPageDataRef.current(normalizeEphemeralBrushPageData(next));
  };

  const writeLinksPageData = (next: CanvasLinksPageData) => {
    setLinksPageDataRef.current(normalizeCanvasLinksPageData(next));
  };

  const writeTokensPageData = (next: CanvasTokensPageData) => {
    setTokensPageDataRef.current(normalizeCanvasTokensPageData(next));
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

  const clearLocalBrushDraftBroadcast = (
    draftBrushId: string,
    ownerSessionId: string,
  ) => {
    brushThrottleRef.current?.cancel();
    const sub = broadcastRef.current;
    if (!sub) return;
    void sub
      .sendBrushDraftCleared({ draftBrushId, ownerSessionId })
      .catch(() => {});
  };

  // Broadcast channel — one subscription for text + drawing + brush drafts.
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
        onBrushDraftUpdated: (payload) => {
          const draft = normalizeBrushDraft(payload);
          if (!draft) return;
          setRemoteBrushDrafts((prev) => upsertBrushDraft(prev, draft));
        },
        onBrushDraftCleared: (payload) => {
          const cleared = normalizeBrushDraftCleared(payload);
          if (!cleared) return;
          setRemoteBrushDrafts((prev) =>
            removeBrushDraft(prev, cleared.draftBrushId),
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

      brushThrottleRef.current = createThrottledSender((draft) => {
        void broadcastRef.current
          ?.sendBrushDraftUpdated(draft)
          .catch(() => {});
      }, BRUSH_DRAFT_THROTTLE_MS);
    } catch {
      broadcastRef.current = null;
      throttleRef.current = null;
      drawingThrottleRef.current = null;
      brushThrottleRef.current = null;
    }

    return () => {
      throttleRef.current?.cancel();
      throttleRef.current = null;
      drawingThrottleRef.current?.cancel();
      drawingThrottleRef.current = null;
      brushThrottleRef.current?.cancel();
      brushThrottleRef.current = null;
      sub?.disconnect();
      broadcastRef.current = null;
    };
  }, []);

  // Explicit LEAVE / RESET → clear composer/draw/brush + owned published objects.
  useEffect(() => {
    const clearOwned = (sessionId: string) => {
      const ui = createUiRef.current;
      if (ui?.mode === "compose") {
        clearLocalDraftBroadcast(ui.draftId, sessionId);
      }
      if (ui?.mode === "draw") {
        clearLocalDrawingDraftBroadcast(ui.draftDrawingId, sessionId);
      }
      if (ui?.mode === "brush") {
        clearLocalBrushDraftBroadcast(ui.draftBrushId, sessionId);
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
      writeBrushPageData(
        removeEphemeralBrushDocumentsByOwner(
          normalizeEphemeralBrushPageData(brushPageDataRef.current),
          sessionId,
        ),
      );
      writeLinksPageData(
        removeCanvasLinksByOwner(
          normalizeCanvasLinksPageData(linksPageDataRef.current),
          sessionId,
        ),
      );
      writeTokensPageData(
        removeCanvasTokensByOwner(
          normalizeCanvasTokensPageData(tokensPageDataRef.current),
          sessionId,
        ),
      );
      setRemoteDrafts((prev) => removeTextDraftsByOwner(prev, sessionId));
      setRemoteDrawingDrafts((prev) =>
        removeDrawingDraftsByOwner(prev, sessionId),
      );
      setRemoteBrushDrafts((prev) =>
        removeBrushDraftsByOwner(prev, sessionId),
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

  // Presence-loss: published texts/drawings/brush + remote drafts.
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

    const currentBrush = normalizeEphemeralBrushPageData(
      brushPageDataRef.current,
    );
    if (currentBrush.documents.length > 0) {
      const next = retainEphemeralBrushDocumentsForPresentOwners(
        currentBrush,
        present,
      );
      if (next.documents.length !== currentBrush.documents.length) {
        writeBrushPageData(next);
      }
    }

    const currentLinks = normalizeCanvasLinksPageData(linksPageDataRef.current);
    if (currentLinks.links.length > 0) {
      const next = retainCanvasLinksForPresentOwners(currentLinks, present);
      if (next.links.length !== currentLinks.links.length) {
        writeLinksPageData(next);
      }
    }

    const currentTokens = normalizeCanvasTokensPageData(
      tokensPageDataRef.current,
    );
    if (currentTokens.tokens.length > 0) {
      const next = retainCanvasTokensForPresentOwners(currentTokens, present);
      if (next.tokens.length !== currentTokens.tokens.length) {
        writeTokensPageData(next);
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

    setRemoteBrushDrafts((prev) => {
      if (prev.length === 0) return prev;
      const next = retainBrushDraftsForPresentOwners(prev, present);
      return next.length === prev.length ? prev : next;
    });
  }, [participants, self, status]);

  // Stale remote draft prune (text + drawing + brush).
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
      setRemoteBrushDrafts((prev) => {
        if (prev.length === 0) return prev;
        const next = pruneStaleBrushDrafts(prev, now, BRUSH_DRAFT_STALE_MS);
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
    if (ui?.mode === "brush" && self) {
      clearLocalBrushDraftBroadcast(ui.draftBrushId, self.sessionId);
      brushStrokesRef.current = [];
    }
    setCreateUi(null);
  };

  const onEmptyCanvasClick = (event: MouseEvent) => {
    if (shouldSuppressEmptyCanvasClick()) return;
    if (!isParticipating || !self) return;
    if (createUi) {
      abandonCreate();
      return;
    }

    const snap = getCanvasPlacementSnapshot();
    if (!snap) return;
    const { leftPct, topPct } = screenPointToWorldPct(
      event.clientX,
      event.clientY,
      snap.viewport,
      snap.camera,
    );
    setCreateUi({ mode: "menu", leftPct, topPct });
  };

  const onEmptyCanvasClickRef = useRef(onEmptyCanvasClick);
  onEmptyCanvasClickRef.current = onEmptyCanvasClick;

  useEffect(() => {
    return registerEmptyCanvasClick((event) => {
      onEmptyCanvasClickRef.current(event);
    });
  }, []);

  useEffect(() => {
    setCreateUiBlocksPan(createUi != null);
    return () => setCreateUiBlocksPan(false);
  }, [createUi]);

  useEffect(() => {
    const hit = document.querySelector("[data-4663-canvas-empty-hit]");
    if (!(hit instanceof HTMLElement)) return;
    hit.setAttribute(
      "data-4663-canvas-empty-named",
      isParticipating ? "true" : "false",
    );
  }, [isParticipating]);

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

    const fitted = fitDrawingToVisibleInk({
      strokes,
      leftPct: ui.leftPct,
      topPct: ui.topPct,
      widthPct: ui.widthPct,
      heightPct: ui.heightPct,
    });
    if (!fitted) return;

    const created = createEphemeralDrawingObject({
      drawingId: ui.draftDrawingId,
      ownerSessionId: self.sessionId,
      strokes: fitted.strokes,
      leftPct: fitted.leftPct,
      topPct: fitted.topPct,
      widthPct: fitted.widthPct,
      heightPct: fitted.heightPct,
      aspectRatio: fitted.aspectRatio,
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

  const onBrushStrokesChange = (strokes: BrushStroke[]) => {
    if (!self) return;
    const ui = createUiRef.current;
    if (ui?.mode !== "brush") return;
    brushStrokesRef.current = strokes;
    const draft = buildBrushDraft({
      draftBrushId: ui.draftBrushId,
      ownerSessionId: self.sessionId,
      strokes,
    });
    if (!draft) return;
    if (strokes.length === 0) {
      brushThrottleRef.current?.cancel();
      void broadcastRef.current
        ?.sendBrushDraftCleared({
          draftBrushId: draft.draftBrushId,
          ownerSessionId: draft.ownerSessionId,
        })
        .catch(() => {});
      return;
    }
    brushThrottleRef.current?.push(draft);
  };

  const publishBrush = (strokes: BrushStroke[]): boolean => {
    if (!self) return false;
    const ui = createUiRef.current;
    if (ui?.mode !== "brush") return false;

    const committed = commitBrushPublish({
      previous: normalizeEphemeralBrushPageData(brushPageDataRef.current),
      ownerSessionId: self.sessionId,
      documentId: ui.draftBrushId,
      strokes,
      ready: brushPageDataReadyRef.current,
    });
    if (!committed.ok) return false;

    brushThrottleRef.current?.cancel();
    clearLocalBrushDraftBroadcast(ui.draftBrushId, self.sessionId);
    brushStrokesRef.current = [];
    writeBrushPageData(committed.pageData);
    return true;
  };
  publishBrushRef.current = publishBrush;

  const exitBrushWithFinalize = (strokes: BrushStroke[]) => {
    if (brushDraftCanPublish(strokes)) {
      if (publishBrush(strokes)) setCreateUi(null);
      return;
    }
    abandonCreate();
  };

  const onDeleteText = (textId: string) => {
    if (!self) return;
    const current = normalizeEphemeralTextsPageData(pageDataRef.current);
    const target = current.texts.find((t) => t.textId === textId);
    if (!target || target.ownerSessionId !== self.sessionId) return;
    writePageData(removeEphemeralText(current, textId));
  };

  const onResizeText = (textId: string, fontScale: number) => {
    if (!self) return;
    const current = normalizeEphemeralTextsPageData(pageDataRef.current);
    const target = current.texts.find((t) => t.textId === textId);
    if (!target || target.ownerSessionId !== self.sessionId) return;
    writePageData(resizeEphemeralText(current, textId, fontScale));
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

  const onResizeDrawing = (drawingId: string, scale: number) => {
    if (!self) return;
    const current = normalizeEphemeralDrawingsPageData(
      drawingsPageDataRef.current,
    );
    const target = current.drawings.find((d) => d.drawingId === drawingId);
    if (!target || target.ownerSessionId !== self.sessionId) return;
    writeDrawingsPageData(resizeEphemeralDrawing(current, drawingId, scale));
  };

  const onDeleteLink = (linkId: string) => {
    if (!self) return;
    const current = normalizeCanvasLinksPageData(linksPageDataRef.current);
    const target = current.links.find((link) => link.linkId === linkId);
    if (!target || target.ownerSessionId !== self.sessionId) return;
    writeLinksPageData(removeCanvasLink(current, linkId));
  };

  const onDeleteToken = (tokenId: string) => {
    if (!self) return;
    const current = normalizeCanvasTokensPageData(tokensPageDataRef.current);
    const target = current.tokens.find((token) => token.tokenId === tokenId);
    if (!target || target.ownerSessionId !== self.sessionId) return;
    writeTokensPageData(removeCanvasToken(current, tokenId));
  };

  const publishLink = (preview: LinkPreview) => {
    if (!self) return { ok: false as const, error: "Enter to place a link." };
    const ui = createUiRef.current;
    if (ui?.mode !== "link") {
      return { ok: false as const, error: "Nothing to place." };
    }
    const created = createCanvasLinkObject({
      preview,
      ownerSessionId: self.sessionId,
      leftPct: ui.leftPct,
      topPct: ui.topPct,
    });
    if (!created.ok) return created;
    const committed = commitCanvasLinkPublish({
      previous: normalizeCanvasLinksPageData(linksPageDataRef.current),
      link: created.link,
      ready: linksPageDataReadyRef.current,
    });
    if (!committed.ok) {
      if (committed.reason === "limit") {
        return { ok: false as const, error: CANVAS_LINK_LIMIT_MESSAGE };
      }
      return { ok: false as const, error: "Could not place link." };
    }
    writeLinksPageData(committed.pageData);
    setCreateUi(null);
    return { ok: true as const };
  };

  const publishToken = (preview: ResolvedCanvasToken) => {
    if (!self) return { ok: false as const, error: "Enter to place a token." };
    const ui = createUiRef.current;
    if (ui?.mode !== "token") {
      return { ok: false as const, error: "Nothing to place." };
    }
    const created = createCanvasTokenObject({
      preview,
      ownerSessionId: self.sessionId,
      leftPct: ui.leftPct,
      topPct: ui.topPct,
    });
    if (!created.ok) return created;
    const committed = commitCanvasTokenPublish({
      previous: normalizeCanvasTokensPageData(tokensPageDataRef.current),
      token: created.token,
      ready: tokensPageDataReadyRef.current,
    });
    if (!committed.ok) {
      if (committed.reason === "limit") {
        return { ok: false as const, error: CANVAS_TOKEN_LIMIT_MESSAGE };
      }
      return { ok: false as const, error: "Could not place token." };
    }
    writeTokensPageData(committed.pageData);
    setCreateUi(null);
    return { ok: true as const };
  };

  const publishMark = async (body: string) => {
    if (!self) return { ok: false as const, error: "Enter to mark." };
    const ui = createUiRef.current;
    if (ui?.mode !== "mark") {
      return { ok: false as const, error: "Nothing to mark." };
    }
    const validated = validateMarkBody(body);
    if (!validated.ok) return validated;
    if (hasMarkForSession(self.sessionId)) {
      return { ok: false as const, error: "Already marked this session." };
    }

    const result = await createMark({
      ownerSessionId: self.sessionId,
      ownerDisplayName: self.displayName,
      ownerColour: self.colour,
      body: validated.body,
      leftPct: ui.leftPct,
      topPct: ui.topPct,
    });
    if (!result.ok) return result;
    setCreateUi(null);
    return { ok: true as const };
  };

  const canMark =
    MARK_ENABLED &&
    isParticipating &&
    !!self &&
    !hasMarkForSession(self.sessionId);

  const isParticipatingRef = useRef(isParticipating);
  const selfRef = useRef(self);
  const hasMarkForSessionRef = useRef(hasMarkForSession);
  isParticipatingRef.current = isParticipating;
  selfRef.current = self;
  hasMarkForSessionRef.current = hasMarkForSession;

  // IC2 — dock TEXT/DRAW use current camera/viewport → world %; MARK keeps HOME cue.
  // DRAW opens OBJECT/BRUSH chooser; OBJECT keeps prior zone editor.
  // Empty-canvas path: screenPointToWorldPct → menu. Register once; refs avoid loops.
  useEffect(() => {
    const abandonLocalDrafts = () => {
      const currentSelf = selfRef.current;
      const ui = createUiRef.current;
      if (ui?.mode === "compose" && currentSelf) {
        clearLocalDraftBroadcast(ui.draftId, currentSelf.sessionId);
      }
      if (ui?.mode === "draw" && currentSelf) {
        clearLocalDrawingDraftBroadcast(
          ui.draftDrawingId,
          currentSelf.sessionId,
        );
      }
      if (ui?.mode === "brush" && currentSelf) {
        clearLocalBrushDraftBroadcast(ui.draftBrushId, currentSelf.sessionId);
        brushStrokesRef.current = [];
      }
    };

    const openDrawChooserAt = (leftPct: number, topPct: number) => {
      setCreateUi({
        mode: "draw-chooser",
        leftPct,
        topPct,
      });
    };

    const dockWorldOrigin = () => {
      const snap = getCanvasPlacementSnapshot();
      if (snap) return dockCreateWorldPct(snap.viewport, snap.camera);
      return homePctToWorldPct(
        DOCK_CREATE_DEFAULT_ORIGIN.leftPct,
        DOCK_CREATE_DEFAULT_ORIGIN.topPct,
      );
    };

    return registerCanvasCreateActions({
      canCreate: () =>
        Boolean(isParticipatingRef.current && selfRef.current),
      canMark: () => {
        if (!MARK_ENABLED) return false;
        const currentSelf = selfRef.current;
        return Boolean(
          isParticipatingRef.current &&
            currentSelf &&
            !hasMarkForSessionRef.current(currentSelf.sessionId),
        );
      },
      openText: () => {
        if (!isParticipatingRef.current || !selfRef.current) return;
        abandonLocalDrafts();
        const origin = dockWorldOrigin();
        setCreateUi({
          mode: "compose",
          leftPct: origin.leftPct,
          topPct: origin.topPct,
          draftId: createTextDraftId(),
        });
      },
      openDraw: () => {
        if (!isParticipatingRef.current || !selfRef.current) return;
        const ui = createUiRef.current;
        const currentSelf = selfRef.current;
        // Dock DRAW while BRUSH armed → finalize if possible, else abandon.
        if (ui?.mode === "brush" && currentSelf) {
          const strokes = brushStrokesRef.current;
          if (brushDraftCanPublish(strokes)) {
            if (publishBrushRef.current(strokes)) setCreateUi(null);
            return;
          }
          clearLocalBrushDraftBroadcast(ui.draftBrushId, currentSelf.sessionId);
          brushStrokesRef.current = [];
          setCreateUi(null);
          return;
        }
        abandonLocalDrafts();
        const origin = dockWorldOrigin();
        openDrawChooserAt(origin.leftPct, origin.topPct);
      },
      openMark: () => {
        if (!MARK_ENABLED) return;
        const currentSelf = selfRef.current;
        if (!isParticipatingRef.current || !currentSelf) return;
        if (hasMarkForSessionRef.current(currentSelf.sessionId)) return;
        abandonLocalDrafts();
        const origin = homePctToWorldPct(
          DOCK_CREATE_DEFAULT_ORIGIN.leftPct,
          DOCK_CREATE_DEFAULT_ORIGIN.topPct,
        );
        setCreateUi({
          mode: "mark",
          leftPct: origin.leftPct,
          topPct: origin.topPct,
        });
      },
    });
  }, []);

  const visibleRemoteDrafts = draftsForRemoteView(
    remoteDrafts,
    self?.sessionId ?? null,
  );
  const visibleRemoteDrawingDrafts = drawingDraftsForRemoteView(
    remoteDrawingDrafts,
    self?.sessionId ?? null,
  );
  const visibleRemoteBrushDrafts = brushDraftsForRemoteView(
    remoteBrushDrafts,
    self?.sessionId ?? null,
  );

  const openObjectFromChooser = (leftPct: number, topPct: number) => {
    const zone = drawingZoneOriginFromClick(leftPct, topPct);
    setCreateUi({
      mode: "draw",
      draftDrawingId: createDrawingDraftId(),
      ...zone,
      aspectRatio: drawingZoneWorldAspectRatio(zone.widthPct, zone.heightPct),
    });
  };

  const openBrushFromChooser = (leftPct: number, topPct: number) => {
    setCreateUi({
      mode: "brush",
      draftBrushId: createBrushDraftId(),
      toolsLeftPct: leftPct,
      toolsTopPct: topPct,
    });
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      data-4663-ephemeral-text-layer
    >
      {MARK_ENABLED
        ? marks.map((mark) => (
            <CanvasMarkObject key={mark.id} mark={mark} />
          ))
        : null}

      <EphemeralBrushLayer documents={brushDocuments} />

      {texts.map((text) => (
        <EphemeralTextObjectView
          key={text.textId}
          text={text}
          isOwner={self?.sessionId === text.ownerSessionId}
          onDelete={onDeleteText}
          onResize={onResizeText}
        />
      ))}

      {drawings.map((drawing) => (
        <EphemeralDrawingObjectView
          key={drawing.drawingId}
          drawing={drawing}
          isOwner={self?.sessionId === drawing.ownerSessionId}
          onDelete={onDeleteDrawing}
          onResize={onResizeDrawing}
        />
      ))}

      {links.map((link) => (
        <CanvasLinkObjectView
          key={link.linkId}
          link={link}
          isOwner={self?.sessionId === link.ownerSessionId}
          onDelete={onDeleteLink}
        />
      ))}

      {tokens.map((token) => (
        <CanvasTokenObjectView
          key={token.tokenId}
          token={token}
          isOwner={self?.sessionId === token.ownerSessionId}
          onDelete={onDeleteToken}
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

      {visibleRemoteBrushDrafts.map((draft) => (
        <LiveBrushDraftView key={draft.draftBrushId} draft={draft} />
      ))}

      {createUi?.mode === "menu" ? (
        <div className="pointer-events-auto">
          <CanvasCreateMenu
            leftPct={createUi.leftPct}
            topPct={createUi.topPct}
            canMark={canMark}
            onChooseText={() =>
              setCreateUi({
                mode: "compose",
                leftPct: createUi.leftPct,
                topPct: createUi.topPct,
                draftId: createTextDraftId(),
              })
            }
            onChooseDraw={() => {
              setCreateUi({
                mode: "draw-chooser",
                leftPct: createUi.leftPct,
                topPct: createUi.topPct,
              });
            }}
            onChooseLink={() => {
              beginLinkIfNamed({
                isNamedParticipant: Boolean(
                  isParticipatingRef.current && selfRef.current,
                ),
                onOpen: () => {
                  setCreateUi({
                    mode: "link",
                    leftPct: createUi.leftPct,
                    topPct: createUi.topPct,
                  });
                },
              });
            }}
            onChooseToken={() => {
              beginTokenIfNamed({
                isNamedParticipant: Boolean(
                  isParticipatingRef.current && selfRef.current,
                ),
                onOpen: () => {
                  setCreateUi({
                    mode: "token",
                    leftPct: createUi.leftPct,
                    topPct: createUi.topPct,
                  });
                },
              });
            }}
            onChooseMark={() => {
              if (!MARK_ENABLED || !canMark) return;
              setCreateUi({
                mode: "mark",
                leftPct: createUi.leftPct,
                topPct: createUi.topPct,
              });
            }}
            onCancel={() => setCreateUi(null)}
          />
        </div>
      ) : null}

      {createUi?.mode === "draw-chooser" ? (
        <div className="pointer-events-auto">
          <CanvasDrawModeChooser
            leftPct={createUi.leftPct}
            topPct={createUi.topPct}
            onChooseObject={() =>
              openObjectFromChooser(createUi.leftPct, createUi.topPct)
            }
            onChooseBrush={() =>
              openBrushFromChooser(createUi.leftPct, createUi.topPct)
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
            onCancel={abandonCreate}
            onDraftBodyChange={onDraftBodyChange}
          />
        </div>
      ) : null}

      {createUi?.mode === "link" && self ? (
        <div className="pointer-events-auto">
          <CanvasLinkComposer
            leftPct={createUi.leftPct}
            topPct={createUi.topPct}
            canPlace={canPlaceCanvasLink(
              normalizeCanvasLinksPageData(linksPageData),
              self.sessionId,
            )}
            onPlace={publishLink}
            onCancel={abandonCreate}
          />
        </div>
      ) : null}

      {createUi?.mode === "token" && self ? (
        <div className="pointer-events-auto">
          <CanvasTokenComposer
            leftPct={createUi.leftPct}
            topPct={createUi.topPct}
            canPlace={canPlaceCanvasToken(
              normalizeCanvasTokensPageData(tokensPageData),
              self.sessionId,
            )}
            onPlace={publishToken}
            onCancel={abandonCreate}
          />
        </div>
      ) : null}

      {MARK_ENABLED && createUi?.mode === "mark" && self ? (
        <div className="pointer-events-auto">
          <MarkComposer
            leftPct={createUi.leftPct}
            topPct={createUi.topPct}
            colour={self.colour}
            onPublish={publishMark}
            onCancel={abandonCreate}
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

      {createUi?.mode === "brush" && self ? (
        <BrushSessionOverlay
          draftBrushId={createUi.draftBrushId}
          toolsLeftPct={createUi.toolsLeftPct}
          toolsTopPct={createUi.toolsTopPct}
          onStrokesChange={onBrushStrokesChange}
          onDone={(strokes) => {
            if (publishBrush(strokes)) setCreateUi(null);
          }}
          onCancel={abandonCreate}
          onToggleExit={exitBrushWithFinalize}
        />
      ) : null}
    </div>
  );
}
