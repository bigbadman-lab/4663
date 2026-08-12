"use client";

/**
 * Named-session control under the hero: [ NAME ] → reveals [ LEAVE ].
 * Not a profile/account menu.
 */

import { useEffect, useId, useRef, useState } from "react";

type ParticipationSessionControlProps = {
  name: string;
  colour: string;
  onLeave: () => void;
};

export function ParticipationSessionControl({
  name,
  colour,
  onLeave,
}: ParticipationSessionControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };

    const onPointerDown = (event: MouseEvent | PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative inline-flex flex-col items-center gap-1"
      data-4663-participation-session-control
    >
      <button
        type="button"
        className="font-mono text-[10px] tracking-wide text-neutral-500 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:text-[11px]"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-4663-participation-self
        title="Named for this session only"
        onClick={() => setOpen((value) => !value)}
      >
        <span style={{ color: colour }}>[ {name} ]</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="font-mono text-[10px] tracking-wide sm:text-[11px]"
          data-4663-participation-session-menu
        >
          <button
            type="button"
            role="menuitem"
            className="text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            data-4663-participation-leave
            onClick={() => {
              setOpen(false);
              onLeave();
            }}
          >
            [ LEAVE ]
          </button>
        </div>
      ) : null}
    </div>
  );
}
