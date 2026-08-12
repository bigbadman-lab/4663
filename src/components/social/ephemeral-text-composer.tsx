"use client";

/**
 * Local-only TEXT composer (Social 2A — no live typing broadcast).
 */

import { useEffect, useRef, useState } from "react";
import { EPHEMERAL_TEXT_MAX_LENGTH } from "@/lib/social/ephemeral-text";

type EphemeralTextComposerProps = {
  leftPct: number;
  topPct: number;
  colour: string;
  onPublish: (body: string) => { ok: true } | { ok: false; error: string };
  onCancel: () => void;
};

export function EphemeralTextComposer({
  leftPct,
  topPct,
  colour,
  onPublish,
  onCancel,
}: EphemeralTextComposerProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();

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
      className="absolute z-[19] w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      data-4663-ephemeral-text-composer
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={value}
        maxLength={EPHEMERAL_TEXT_MAX_LENGTH}
        rows={3}
        spellCheck={false}
        placeholder="write on the canvas…"
        className="w-full resize-none border border-neutral-300 bg-white/95 px-2 py-1.5 font-mono text-[12px] leading-snug text-neutral-900 outline-none focus-visible:border-neutral-500"
        style={{ caretColor: colour }}
        data-4663-ephemeral-text-input
        onChange={(event) => {
          setValue(event.target.value.slice(0, EPHEMERAL_TEXT_MAX_LENGTH));
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
