"use client";

/**
 * Lightweight SNAPSHOT preview — DOWNLOAD / PLACE / CANCEL.
 * Marked snapshot-exclude so it cannot appear inside a capture.
 */

import { useEffect, useId, useRef } from "react";

export type SnapshotPreviewProps = {
  objectUrl: string;
  width: number;
  height: number;
  placing?: boolean;
  error?: string | null;
  canPlace?: boolean;
  onDownload: () => void;
  onPlace: () => void;
  onCancel: () => void;
};

export function SnapshotPreview({
  objectUrl,
  width,
  height,
  placing = false,
  error = null,
  canPlace = true,
  onDownload,
  onPlace,
  onCancel,
}: SnapshotPreviewProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const aspect = width > 0 && height > 0 ? width / height : 16 / 9;

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!placing) onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, placing]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto overscroll-none bg-neutral-900/25 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] sm:p-6"
      data-4663-snapshot-preview
      data-4663-snapshot-exclude=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !placing) onCancel();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full max-w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-y-auto overscroll-contain border border-neutral-300 bg-white px-4 py-4 text-neutral-900 shadow-sm sm:max-h-[min(40rem,calc(100dvh-3rem))] sm:max-w-md sm:px-6 sm:py-6"
        data-4663-snapshot-preview-panel
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-start justify-between gap-4">
          <h2
            id={titleId}
            className="font-mono text-sm font-semibold tracking-tight"
          >
            SNAPSHOT
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onCancel}
            disabled={placing}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end font-mono text-[11px] tracking-wide text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-40"
            aria-label="Cancel snapshot"
            data-4663-snapshot-cancel
          >
            [ CANCEL ]
          </button>
        </div>

        <div
          className="mx-auto w-full max-w-full overflow-hidden border border-neutral-200 bg-neutral-50"
          style={{ aspectRatio: String(aspect) }}
          data-4663-snapshot-preview-frame
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset */}
          <img
            src={objectUrl}
            alt="Canvas snapshot preview"
            className="h-full w-full object-contain"
            data-4663-snapshot-preview-image
          />
        </div>

        {error ? (
          <p
            className="mt-3 font-mono text-[10px] leading-snug tracking-wide text-rose-600 sm:text-[11px]"
            role="alert"
            data-4663-snapshot-error
          >
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 font-mono text-[11px] tracking-wide sm:text-[12px]">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-snapshot-download
            onClick={onDownload}
          >
            [ DOWNLOAD PNG ]
          </button>
          <button
            type="button"
            disabled={placing || !canPlace}
            className="inline-flex min-h-11 items-center justify-center text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:cursor-not-allowed disabled:opacity-40"
            data-4663-snapshot-place
            onClick={onPlace}
          >
            {placing ? "[ PLACING… ]" : "[ PLACE ON CANVAS ]"}
          </button>
        </div>
      </div>
    </div>
  );
}
