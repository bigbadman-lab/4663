"use client";

/**
 * Module Lab dock — + MODULE / HOME / RESET. Not the homepage control palette.
 */

import { useEffect, useState } from "react";
import { setCreateUiBlocksPan } from "@/components/canvas/use-canvas-camera";
import { getModuleLabActions } from "@/lib/modules/lab-actions";
import { listInstallableModules } from "@/lib/modules/registry";

const DOCK_BUTTON =
  "flex min-h-12 min-w-[4.5rem] flex-1 items-center justify-center rounded-xl px-1.5 py-1.5 font-mono text-[10px] tracking-wide text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-400 active:bg-neutral-100 desktop-chrome:min-h-14 desktop-chrome:text-[11px]";

export type ModuleLabDockProps = {
  onHome: () => void;
  onReset: () => void;
};

export function ModuleLabDock({ onHome, onReset }: ModuleLabDockProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setCreateUiBlocksPan(pickerOpen);
    return () => setCreateUiBlocksPan(false);
  }, [pickerOpen]);

  const modules = listInstallableModules();

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[18] flex justify-center pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] desktop-chrome:pb-[calc(env(safe-area-inset-bottom,0px)+3.75rem)]"
      data-4663-control-dock
      data-4663-module-lab-dock
    >
      <div className="pointer-events-auto mx-2 flex max-w-[min(100%,22rem)] flex-col items-center">
        {pickerOpen ? (
          <div
            className="mb-1.5 flex flex-col items-center gap-1 border border-neutral-300/90 bg-white/95 px-3 py-2 font-mono text-[11px] tracking-wide shadow-sm"
            data-4663-module-lab-picker
          >
            {modules.map((definition) => (
              <button
                key={definition.id}
                type="button"
                className="min-h-11 touch-manipulation text-neutral-600 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
                data-4663-module-lab-install={definition.id}
                onClick={() => {
                  if (definition.id === "note") {
                    getModuleLabActions()?.createNote();
                  }
                  setPickerOpen(false);
                }}
              >
                [ {definition.displayName} ]
              </button>
            ))}
          </div>
        ) : null}
        <div
          className="flex w-full items-stretch justify-between gap-1 rounded-2xl border border-neutral-300/90 bg-white/90 px-1.5 py-1.5 shadow-sm backdrop-blur-[2px] desktop-chrome:gap-1.5 desktop-chrome:px-2 desktop-chrome:py-2"
          data-4663-module-lab-dock-tray
        >
          <button
            type="button"
            className={DOCK_BUTTON}
            data-4663-module-lab-add
            aria-expanded={pickerOpen}
            aria-label="Add module"
            onClick={() => setPickerOpen((open) => !open)}
          >
            [ + MODULE ]
          </button>
          <button
            type="button"
            className={DOCK_BUTTON}
            data-4663-module-lab-home
            aria-label="Restore home view"
            onClick={() => {
              setPickerOpen(false);
              onHome();
            }}
          >
            [ HOME ]
          </button>
          <button
            type="button"
            className={DOCK_BUTTON}
            data-4663-module-lab-reset
            aria-label="Reset module lab"
            onClick={() => {
              setPickerOpen(false);
              onReset();
            }}
          >
            [ RESET ]
          </button>
        </div>
      </div>
    </div>
  );
}
