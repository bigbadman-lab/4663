"use client";

/**
 * 4663 X/Twitter profile link — canvas chrome, not a world object.
 */

export const CANVAS_X_PROFILE_URL = "https://x.com/4663live" as const;

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.227-8.451L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function CanvasXLink() {
  return (
    <a
      href={CANVAS_X_PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="pointer-events-auto inline-flex size-6 shrink-0 items-center justify-center text-[color:var(--canvas-muted,#a3a3a3)] transition-colors hover:text-[color:var(--canvas-fg,#171717)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      aria-label="4663 on X"
      data-4663-x-link
    >
      <XIcon />
    </a>
  );
}
