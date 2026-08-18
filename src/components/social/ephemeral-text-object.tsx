"use client";

/**
 * Published ephemeral TEXT — PlayHTML-movable for owner.
 * CanMoveElement requires a direct DOM host child.
 * Body is plain text with optional inline EVM address copy controls (8A.10).
 * IC3.6 — nested interactive controls use shared capture protection.
 */

import { CanMoveElement } from "@playhtml/react";
import { useState } from "react";
import { ObjectResizeHandle } from "@/components/canvas/object-resize-handle";
import { PlayhtmlMoveHitFill } from "@/components/canvas/playhtml-move-hit-fill";
import { PonsAddressCopyControl } from "@/components/canvas/pons-address-copy-control";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { usePlayhtmlMoveForeground } from "@/components/canvas/use-playhtml-move-foreground";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { splitTextWithEvmAddresses } from "@/lib/canvas/format-address";
import { PLAYHTML_CANVAS_BOUNDS_ID } from "@/lib/canvas/hero";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import { colourFromSessionId } from "@/lib/social/colour";
import {
  playhtmlTextElementId,
  TEXT_FONT_SCALE_MAX,
  TEXT_FONT_SCALE_MIN,
  textFontSizePx,
  textMaxWidthCss,
  type EphemeralTextObject,
} from "@/lib/social/ephemeral-text";

export type EphemeralTextObjectViewProps = {
  text: EphemeralTextObject;
  isOwner: boolean;
  onDelete: (textId: string) => void;
  onResize: (textId: string, fontScale: number) => void;
};

function EphemeralTextBody({
  body,
  colour,
  fontScale,
}: {
  body: string;
  colour: string;
  fontScale: number;
}) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const segments = splitTextWithEvmAddresses(body);

  async function onCopyAddress(address: string): Promise<void> {
    const ok = await copyTextQuiet(address);
    if (!ok) return;
    setCopiedAddress(address);
    window.setTimeout(() => {
      setCopiedAddress((current) => (current === address ? null : current));
    }, 1200);
  }

  return (
    <p
      className="whitespace-pre-wrap break-words font-mono leading-snug tracking-wide"
      style={{
        color: colour,
        fontSize: `${textFontSizePx(fontScale)}px`,
        maxWidth: textMaxWidthCss(fontScale),
      }}
      data-4663-ephemeral-text-body
    >
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }
        return (
          <span
            key={`a-${index}-${segment.value}`}
            className="pointer-events-auto inline-flex max-w-full flex-col items-start align-baseline"
            data-4663-ephemeral-text-address
          >
            <PonsAddressCopyControl
              variant="inline"
              tokenAddress={segment.value}
              onCopy={() => {
                void onCopyAddress(segment.value);
              }}
            />
            {copiedAddress === segment.value ? (
              <span className="text-[10px] tracking-wide text-neutral-400">
                copied
              </span>
            ) : null}
          </span>
        );
      })}
    </p>
  );
}

function EphemeralTextDeleteButton({
  textId,
  onDelete,
}: {
  textId: string;
  onDelete: (textId: string) => void;
}) {
  const ref = useInteractiveControlProtection<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="absolute -top-5 left-0 z-[3] w-max whitespace-nowrap touch-manipulation font-mono text-[10px] tracking-wide text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 group-hover:opacity-100"
      data-4663-ephemeral-text-delete
      aria-label="Delete text"
      onPointerDown={stopPlayhtmlMoveStart}
      onMouseDown={stopPlayhtmlMoveStart}
      onTouchStart={stopPlayhtmlMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onDelete(textId);
      }}
    >
      [ × ]
    </button>
  );
}

export function EphemeralTextObjectView({
  text,
  isOwner,
  onDelete,
  onResize,
}: EphemeralTextObjectViewProps) {
  const colour = colourFromSessionId(text.ownerSessionId);
  const move = usePlayhtmlMoveForeground<HTMLDivElement>();
  const hostClassName = isOwner
    ? "pointer-events-auto absolute z-[16] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-manipulation select-none active:cursor-grabbing"
    : "pointer-events-none absolute z-[16] -translate-x-1/2 -translate-y-1/2 select-none";

  return (
    <CanMoveElement bounds={PLAYHTML_CANVAS_BOUNDS_ID}>
      <div
        id={playhtmlTextElementId(text.textId)}
        className={hostClassName}
        style={{ left: `${text.leftPct}%`, top: `${text.topPct}%` }}
        data-4663-ephemeral-text={text.textId}
        data-4663-ephemeral-text-owner={isOwner ? "true" : "false"}
        onPointerDown={move.onPointerDown}
        onPointerUp={move.onPointerUp}
        onPointerCancel={move.onPointerCancel}
      >
        <div className="group relative">
          {isOwner ? <PlayhtmlMoveHitFill /> : null}
          <div
            className={
              isOwner ? "relative z-[1]" : "pointer-events-none relative z-[1]"
            }
          >
            <EphemeralTextBody
              body={text.body}
              colour={colour}
              fontScale={text.fontScale}
            />
            {isOwner ? (
              <EphemeralTextDeleteButton
                textId={text.textId}
                onDelete={onDelete}
              />
            ) : null}
          </div>
          {isOwner ? (
            <ObjectResizeHandle
              hostSelector="[data-4663-ephemeral-text]"
              scale={text.fontScale}
              minScale={TEXT_FONT_SCALE_MIN}
              maxScale={TEXT_FONT_SCALE_MAX}
              onResize={(fontScale) => onResize(text.textId, fontScale)}
              ariaLabel="Resize text"
              dataAttr="data-4663-ephemeral-text-resize"
              positionClassName="-right-5 -bottom-5"
            />
          ) : null}
        </div>
      </div>
    </CanMoveElement>
  );
}
