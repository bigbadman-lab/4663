/**
 * Desktop-only SNAPSHOT keyboard-shortcut affordance.
 * Presentational — does not capture, download, or place.
 */

function ShortcutKey({ glyph }: { glyph: string }) {
  return (
    <kbd
      data-4663-snapshot-shortcut-key={glyph}
      className="inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-[4px] border border-neutral-400/35 bg-[color-mix(in_srgb,var(--canvas-bg,#ffffff)_68%,transparent)] px-[0.3rem] font-mono text-[10px] font-medium leading-none text-neutral-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-1px_0_rgba(23,23,23,0.05),0_1px_0_rgba(23,23,23,0.04)] backdrop-blur-[2px]"
    >
      {glyph}
    </kbd>
  );
}

export function SnapshotShortcutHint() {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      data-4663-snapshot-shortcut-hint=""
      data-4663-snapshot-exclude=""
      className="pointer-events-none absolute top-1/2 left-full ml-2 hidden -translate-y-1/2 select-none items-center gap-1.5 [@media(hover:hover)_and_(pointer:fine)]:inline-flex"
    >
      <span className="inline-flex items-center gap-0.5">
        <ShortcutKey glyph="⌘" />
        <ShortcutKey glyph="S" />
      </span>
      <span
        data-4663-snapshot-shortcut-label=""
        className="font-mono text-[8px] leading-none tracking-[0.16em] text-[color:var(--canvas-muted,#a3a3a3)]"
      >
        SNAPSHOT
      </span>
    </div>
  );
}
