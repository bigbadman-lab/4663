"use client";

/**
 * Client-only PlayHTML tree for `/modules`.
 * Pathname isolates this room from homepage page-data.
 */

import { PlayProvider } from "@playhtml/react";
import { usePathname } from "next/navigation";
import { ModuleLabSurface } from "@/components/modules/module-lab-surface";

function ModuleLabPlayTreeInner() {
  return (
    <div
      className="relative min-h-dvh w-full overflow-x-hidden bg-[var(--canvas-bg,#ffffff)] text-[color:var(--canvas-fg,#171717)]"
      data-4663-canvas-root
      data-4663-module-lab-root
    >
      <ModuleLabSurface />
    </div>
  );
}

export function ModuleLabPlayTree() {
  const pathname = usePathname();

  return (
    <PlayProvider pathname={pathname ?? "/modules"}>
      <ModuleLabPlayTreeInner />
    </PlayProvider>
  );
}
