"use client";

/**
 * Social 6 — local MARK composer (no live typing broadcast).
 */

import { useEffect, useRef, useState } from "react";
import { MARK_MAX_CHARS } from "@/lib/social/canvas-mark";

type MarkComposerProps = {
  leftPct: number;
  topPct: number;
  colour: string;
  onPublish: (
    body: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
};

export function MarkComposer({
  leftPct,
  topPct,
  colour,
  onPublish,
  onCancel,
}: MarkComposerProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    if (busy) return;
    setBusy(true);
    void onPublish(value).then((result) => {
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
      }
    });
  };

  return (
    <div
      className="absolute z-[19] w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      data-4663-mark-composer
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p
        className="mb-1 font-mono text-[10px] tracking-wide text-neutral-400"
        data-4663-mark-composer-label
      >
        MARK
      </p>
      <textarea
        ref={textareaRef}
        value={value}
        maxLength={MARK_MAX_CHARS}
        rows={3}
        spellCheck={false}
        disabled={busy}
        placeholder="leave a mark…"
        className="w-full resize-none border border-neutral-400 bg-white px-2 py-1.5 font-mono text-[12px] leading-snug text-neutral-900 outline-none focus-visible:border-neutral-700 disabled:opacity-60"
        style={{ caretColor: colour }}
        data-4663-mark-input
        onChange={(event) => {
          const next = event.target.value.slice(0, MARK_MAX_CHARS);
          setValue(next);
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
        <span data-4663-mark-count>
          {value.length}/{MARK_MAX_CHARS}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-mark-discard
            disabled={busy}
            onClick={onCancel}
          >
            [ ESC ]
          </button>
          <button
            type="button"
            className="text-neutral-700 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-50"
            data-4663-mark-publish
            disabled={busy}
            onClick={publish}
          >
            [ MARK ]
          </button>
        </div>
      </div>
      {error ? (
        <p
          className="mt-1 font-mono text-[10px] text-rose-600"
          role="alert"
          data-4663-mark-error
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
