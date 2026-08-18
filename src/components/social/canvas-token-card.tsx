"use client";

/**
 * 4663-native TOKEN snapshot card — composer preview and placed objects.
 * Renders snapshot fields only. Never fetches metadata. Never injects HTML.
 * Never constructs explorer URLs.
 */

import { useState } from "react";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { copyTextQuiet } from "@/lib/canvas/clipboard";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import {
  formatCanvasTokenAddress,
  type ResolvedCanvasToken,
} from "@/lib/social/canvas-token";

export type CanvasTokenCardProps = {
  token: ResolvedCanvasToken;
  interactive?: boolean;
};

export function CanvasTokenCard({
  token,
  interactive = true,
}: CanvasTokenCardProps) {
  const [copied, setCopied] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const copyRef = useInteractiveControlProtection<HTMLButtonElement>();
  const openRef = useInteractiveControlProtection<HTMLAnchorElement>();
  const showImage = Boolean(token.imageUrl) && !imageFailed;
  const headline = token.symbol ?? formatCanvasTokenAddress(token);

  const onCopy = async () => {
    const ok = await copyTextQuiet(token.address);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <article
      className="w-[16rem] max-w-[min(16rem,calc(100vw-2rem))] overflow-hidden border border-neutral-300 bg-white"
      data-4663-canvas-token-card
      data-4663-canvas-token-chain={token.chain}
    >
      <p
        className="px-2.5 pt-2 font-mono text-[10px] tracking-wide text-neutral-400"
        data-4663-canvas-token-source
      >
        {token.sourceLabel}
      </p>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- optional remote metadata URLs; next/image would need a wildcard
        <img
          src={token.imageUrl}
          alt=""
          draggable={false}
          className="mt-2 max-h-28 w-full object-cover"
          data-4663-canvas-token-image
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <h2
        className="truncate px-2.5 pt-1 font-mono text-[12px] leading-snug tracking-wide text-neutral-900"
        data-4663-canvas-token-symbol
      >
        {headline}
      </h2>
      {token.name ? (
        <p
          className="line-clamp-2 break-words px-2.5 pt-0.5 font-mono text-[11px] leading-snug tracking-wide text-neutral-500"
          data-4663-canvas-token-name
        >
          {token.name}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 font-mono text-[10px] tracking-wide">
        {interactive ? (
          <button
            ref={copyRef}
            type="button"
            className="pointer-events-auto relative z-[1] min-w-0 truncate text-left text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
            data-4663-canvas-token-copy
            aria-label={`Copy token address ${token.address}`}
            onPointerDown={stopPlayhtmlMoveStart}
            onMouseDown={stopPlayhtmlMoveStart}
            onTouchStart={stopPlayhtmlMoveStart}
            onClick={(event) => {
              event.stopPropagation();
              void onCopy();
            }}
          >
            {copied ? "copied" : formatCanvasTokenAddress(token)}
          </button>
        ) : (
          <span
            className="min-w-0 truncate text-neutral-400"
            data-4663-canvas-token-address
          >
            {formatCanvasTokenAddress(token)}
          </span>
        )}
        {interactive ? (
          <a
            ref={openRef}
            href={token.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto relative z-[1] shrink-0 touch-manipulation text-neutral-600 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-canvas-token-open
            onPointerDown={stopPlayhtmlMoveStart}
            onMouseDown={stopPlayhtmlMoveStart}
            onTouchStart={stopPlayhtmlMoveStart}
            onClick={(event) => event.stopPropagation()}
          >
            OPEN ↗
          </a>
        ) : (
          <span className="shrink-0 text-neutral-400">OPEN ↗</span>
        )}
      </div>
    </article>
  );
}
