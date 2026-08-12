"use client";

/**
 * Social 2A — ephemeral published TEXT layer.
 *
 * Shared state: PlayHTML `usePageData("4663-ephemeral-texts")` so late joiners
 * receive currently-active texts from the same room as movable objects.
 * Movement: CanMoveElement per text (owner draggable; remotes pointer-events-none).
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
import { useParticipation } from "@/lib/social/use-participation";

type CreateUi =
  | null
  | { mode: "menu"; leftPct: number; topPct: number }
  | { mode: "compose"; leftPct: number; topPct: number };

export function EphemeralTextLayer() {
  const { self, isParticipating, participants, status } = useParticipation();
  const [pageData, setPageData] = usePageData<EphemeralTextsPageData>(
    EPHEMERAL_TEXTS_PAGE_DATA_NAME,
    EMPTY_EPHEMERAL_TEXTS_PAGE_DATA,
  );
  const [createUi, setCreateUi] = useState<CreateUi>(null);
  const pageDataRef = useRef(pageData);
  const setPageDataRef = useRef(setPageData);
  pageDataRef.current = pageData;
  setPageDataRef.current = setPageData;

  const texts = normalizeEphemeralTextsPageData(pageData).texts;

  const writePageData = (next: EphemeralTextsPageData) => {
    setPageDataRef.current(normalizeEphemeralTextsPageData(next));
  };

  // Explicit LEAVE / session-ended → remove own texts from shared room state.
  useEffect(() => {
    return registerSessionEndedHandler(({ sessionId }) => {
      const next = removeEphemeralTextsByOwner(
        normalizeEphemeralTextsPageData(pageDataRef.current),
        sessionId,
      );
      writePageData(next);
      setCreateUi(null);
    });
  }, []);

  // Remote presence-loss cleanup: drop texts whose owners left Presence.
  useEffect(() => {
    if (status === "connecting" || status === "error") return;

    const present = new Set(participants.map((p) => p.sessionId));
    if (self) present.add(self.sessionId);

    const current = normalizeEphemeralTextsPageData(pageDataRef.current);
    if (current.texts.length === 0) return;

    const next = retainEphemeralTextsForPresentOwners(current, present);
    if (next.texts.length === current.texts.length) return;
    writePageData(next);
  }, [participants, self, status]);

  const onEmptyCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isParticipating || !self) return;
    if (createUi) {
      setCreateUi(null);
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

  const publish = (body: string) => {
    if (!self) return { ok: false as const, error: "Enter to publish." };
    if (createUi?.mode !== "compose") {
      return { ok: false as const, error: "Nothing to publish." };
    }
    const created = createEphemeralTextObject({
      body,
      ownerSessionId: self.sessionId,
      leftPct: createUi.leftPct,
      topPct: createUi.topPct,
    });
    if (!created.ok) return created;

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
            onCancel={() => setCreateUi(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
