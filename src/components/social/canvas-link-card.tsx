"use client";

/**
 * 4663-native LINK metadata card — used by composer preview and placed objects.
 * Renders a snapshot only. Never fetches metadata. Never injects HTML.
 */

import { useState } from "react";
import { useInteractiveControlProtection } from "@/components/canvas/use-interactive-control-protection";
import { stopPlayhtmlMoveStart } from "@/lib/canvas/interactive-control";
import type { LinkPreview } from "@/lib/social/link-preview";

export type CanvasLinkCardProps = {
  preview: Pick<
    LinkPreview,
    "url" | "title" | "description" | "imageUrl" | "siteName" | "domain"
  >;
  interactive?: boolean;
};

export function CanvasLinkCard({
  preview,
  interactive = true,
}: CanvasLinkCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const openRef = useInteractiveControlProtection<HTMLAnchorElement>();
  const source = (preview.siteName ?? preview.domain).toUpperCase();
  const showImage = Boolean(preview.imageUrl) && !imageFailed;

  return (
    <article
      className="w-[18.75rem] max-w-[min(18.75rem,calc(100vw-2rem))] overflow-hidden border border-neutral-300 bg-white"
      data-4663-canvas-link-card
    >
      <p
        className="px-2.5 pt-2 font-mono text-[10px] tracking-wide text-neutral-400"
        data-4663-canvas-link-kicker
      >
        FROM THE INTERNET ↗
      </p>
      <p
        className="truncate px-2.5 pt-0.5 font-mono text-[10px] tracking-wide text-neutral-500"
        data-4663-canvas-link-source
      >
        {source}
      </p>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote OG URLs; next/image would need a wildcard
        <img
          src={preview.imageUrl}
          alt=""
          draggable={false}
          className="mt-2 max-h-36 w-full object-cover"
          data-4663-canvas-link-image
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {preview.title ? (
        <h2
          className="line-clamp-2 break-words px-2.5 pt-2 font-mono text-[12px] leading-snug tracking-wide text-neutral-900"
          data-4663-canvas-link-title
        >
          {preview.title}
        </h2>
      ) : null}
      {preview.description ? (
        <p
          className="line-clamp-3 break-words px-2.5 pt-1 font-mono text-[11px] leading-snug tracking-wide text-neutral-500"
          data-4663-canvas-link-description
        >
          {preview.description}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 font-mono text-[10px] tracking-wide">
        <span
          className="min-w-0 truncate text-neutral-400"
          data-4663-canvas-link-domain
        >
          {preview.domain}
        </span>
        {interactive ? (
          <a
            ref={openRef}
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto relative z-[1] shrink-0 touch-manipulation text-neutral-600 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-canvas-link-open
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
