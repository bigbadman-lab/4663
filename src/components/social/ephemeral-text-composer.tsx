"use client";

/**
 * Local TEXT composer (Social 2A publish + Social 2B live draft callbacks).
 * IC3.7 — mobile ≥16px input + world-scale counter so focus does not zoom.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import {
  MOBILE_SAFE_COMPOSER_INPUT_CLASS,
  worldScaleCounterScale,
} from "@/lib/canvas/mobile-form-control";
import { EPHEMERAL_TEXT_MAX_LENGTH } from "@/lib/social/ephemeral-text";

type EphemeralTextComposerProps = {
  leftPct: number;
  topPct: number;
  colour: string;
  onPublish: (body: string) => { ok: true } | { ok: false; error: string };
  onCancel: () => void;
  /** Live typing projection — local body only; does not mutate published TEXT. */
  onDraftBodyChange?: (body: string) => void;
};

export function EphemeralTextComposer({
  leftPct,
  topPct,
  colour,
  onPublish,
  onCancel,
  onDraftBodyChange,
}: EphemeralTextComposerProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const counterScale = useMemo(() => {
    const scale = getCanvasPlacementSnapshot()?.camera.scale ?? 1;
    return worldScaleCounterScale(scale);
  }, []);

  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const publish = () => {
    const result = onPublish(value);
    if (!result.ok) {
      setError(result.error);
    }
  };

  return (
    <div
      className="absolute z-[19] w-[min(16rem,calc(100vw-2rem))]"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(-50%, -50%) scale(${counterScale})`,
        transformOrigin: "center center",
      }}
      data-4663-ephemeral-text-composer
      data-4663-composer-counter-scale={String(counterScale)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={value}
        maxLength={EPHEMERAL_TEXT_MAX_LENGTH}
        rows={3}
        spellCheck={false}
        placeholder="write on the canvas…"
        className={`w-full resize-none border border-neutral-300 bg-white/95 px-2 py-1.5 font-mono ${MOBILE_SAFE_COMPOSER_INPUT_CLASS} leading-snug text-neutral-900 outline-none focus-visible:border-neutral-500`}
        style={{ caretColor: colour }}
        data-4663-ephemeral-text-input
        onChange={(event) => {
          const next = event.target.value.slice(0, EPHEMERAL_TEXT_MAX_LENGTH);
          setValue(next);
          onDraftBodyChange?.(next);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            publish();
          }
        }}
      />
      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] tracking-wide text-neutral-400">
        <span data-4663-ephemeral-text-count>
          {value.length}/{EPHEMERAL_TEXT_MAX_LENGTH}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-ephemeral-text-discard
            onClick={onCancel}
          >
            [ ESC ]
          </button>
          <button
            type="button"
            className="text-neutral-600 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-ephemeral-text-publish
            onClick={publish}
          >
            [ PUBLISH ]
          </button>
        </div>
      </div>
      {error ? (
        <p
          className="mt-1 font-mono text-[10px] text-rose-600"
          role="alert"
          data-4663-ephemeral-text-error
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
