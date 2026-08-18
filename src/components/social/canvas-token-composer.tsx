"use client";

/**
 * Compact TOKEN composer — paste/type address, preview snapshot, then PLACE.
 * Does not talk to chain RPC. Does not edit resolved metadata.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import { CanvasTokenCard } from "@/components/social/canvas-token-card";
import {
  MOBILE_SAFE_COMPOSER_INPUT_CLASS,
  worldScaleCounterScale,
} from "@/lib/canvas/mobile-form-control";
import {
  CANVAS_TOKEN_LIMIT_MESSAGE,
} from "@/lib/social/canvas-token";
import type { ResolvedCanvasToken } from "@/lib/social/canvas-token";
import {
  tokenPreviewErrorMessage,
  requestTokenPreview,
} from "@/lib/social/token-preview-client";
import type { TokenPreviewClientError } from "@/lib/social/token-preview";

type CanvasTokenComposerProps = {
  leftPct: number;
  topPct: number;
  canPlace: boolean;
  onPlace: (
    preview: ResolvedCanvasToken,
  ) => { ok: true } | { ok: false; error: string };
  onCancel: () => void;
};

export function CanvasTokenComposer({
  leftPct,
  topPct,
  canPlace,
  onPlace,
  onCancel,
}: CanvasTokenComposerProps) {
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<ResolvedCanvasToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    canPlace ? null : CANVAS_TOKEN_LIMIT_MESSAGE,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const counterScale = useMemo(() => {
    const scale = getCanvasPlacementSnapshot()?.camera.scale ?? 1;
    return worldScaleCounterScale(scale);
  }, []);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const previewToken = async () => {
    if (!canPlace) {
      setError(CANVAS_TOKEN_LIMIT_MESSAGE);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await requestTokenPreview(value);
    setLoading(false);
    if (!result.ok) {
      setPreview(null);
      setError(tokenPreviewErrorMessage(result.error as TokenPreviewClientError));
      return;
    }
    setPreview(result.preview);
  };

  const place = () => {
    if (!canPlace) {
      setError(CANVAS_TOKEN_LIMIT_MESSAGE);
      return;
    }
    if (!preview) {
      setError("Preview the token first.");
      return;
    }
    const result = onPlace(preview);
    if (!result.ok) setError(result.error);
  };

  return (
    <div
      className="absolute z-[19] w-[min(20rem,calc(100vw-2rem))]"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(-50%, -50%) scale(${counterScale})`,
        transformOrigin: "center center",
      }}
      data-4663-canvas-token-composer
      data-4663-composer-counter-scale={String(counterScale)}
      data-4663-snapshot-exclude=""
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="font-mono text-[11px] tracking-wide text-neutral-500">
        TOKEN
      </p>
      <p className="mt-0.5 font-mono text-[10px] tracking-wide text-neutral-400">
        Paste token address
      </p>
      <input
        ref={inputRef}
        type="text"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="0x…"
        disabled={!canPlace || loading}
        className={`mt-1.5 w-full border border-neutral-300 bg-white/95 px-2 py-1.5 font-mono ${MOBILE_SAFE_COMPOSER_INPUT_CLASS} text-neutral-900 outline-none focus-visible:border-neutral-500`}
        data-4663-canvas-token-input
        onChange={(event) => {
          setValue(event.target.value);
          setPreview(null);
          if (error && canPlace) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (preview) {
            place();
            return;
          }
          void previewToken();
        }}
      />
      {preview ? (
        <div className="mt-2" data-4663-canvas-token-preview>
          <CanvasTokenCard token={preview} interactive={false} />
        </div>
      ) : null}
      <div className="mt-1.5 flex items-center justify-end gap-2 font-mono text-[10px] tracking-wide text-neutral-400">
        <button
          type="button"
          className="hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          data-4663-canvas-token-cancel
          onClick={onCancel}
        >
          [ CANCEL ]
        </button>
        {preview ? (
          <button
            type="button"
            className="text-neutral-600 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:text-neutral-300"
            data-4663-canvas-token-place
            disabled={!canPlace}
            onClick={place}
          >
            [ PLACE ]
          </button>
        ) : (
          <button
            type="button"
            className="text-neutral-600 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:text-neutral-300"
            data-4663-canvas-token-preview-submit
            disabled={!canPlace || loading}
            onClick={() => {
              void previewToken();
            }}
          >
            {loading ? "[ … ]" : "[ PREVIEW ]"}
          </button>
        )}
      </div>
      {error ? (
        <p
          className="mt-1 font-mono text-[10px] text-rose-600"
          role="alert"
          data-4663-canvas-token-error
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
