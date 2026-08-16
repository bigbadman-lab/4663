"use client";

/**
 * Module Lab client root — PlayHTML mounts client-only, same pattern as `/`.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ModuleLabChrome } from "@/components/modules/module-lab-chrome";

const ModuleLabPlayTree = dynamic(
  () =>
    import("@/components/modules/module-lab-play-tree").then(
      (m) => m.ModuleLabPlayTree,
    ),
  { ssr: false },
);

function ModuleLabShellFallback() {
  return (
    <div
      className="relative min-h-dvh w-full overflow-x-hidden bg-[var(--canvas-bg,#ffffff)] text-[color:var(--canvas-fg,#171717)]"
      data-4663-canvas-root
      data-4663-module-lab-fallback
    >
      <ModuleLabChrome />
      <div
        className="absolute inset-0 z-10 overflow-hidden"
        data-4663-canvas-viewport
        data-4663-canvas-surface
      />
    </div>
  );
}

export function ModuleLabRoot() {
  const [playReady, setPlayReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setPlayReady(true));
  }, []);

  if (!playReady) return <ModuleLabShellFallback />;
  return <ModuleLabPlayTree />;
}
