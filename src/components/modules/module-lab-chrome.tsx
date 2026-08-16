"use client";

/**
 * Module Lab viewport chrome — isolated from homepage brand / ENTER / PONS.
 */

export function ModuleLabChrome() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-4663-canvas-chrome
      data-4663-module-lab-chrome
    >
      <div
        className="pointer-events-none absolute left-5 top-[max(1.25rem,env(safe-area-inset-top,0px))] z-[2] desktop-chrome:left-6 desktop-chrome:top-6"
        data-4663-module-lab-title
      >
        <p className="font-mono text-[11px] tracking-wide text-[color:var(--canvas-fg,#171717)] desktop-chrome:text-[12px]">
          4663 // MODULE LAB
        </p>
      </div>
    </div>
  );
}
