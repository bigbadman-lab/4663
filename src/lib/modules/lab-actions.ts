/**
 * Module Lab action bridge — dock create/reset, fan-out to mounted module layers.
 * Isolated from homepage create/RESET.
 */

import type { ModuleId } from "@/lib/modules/types";

export type ModuleLabActionHandlers = {
  create?: (moduleId: ModuleId) => void;
  reset?: () => void;
};

const handlers = new Set<ModuleLabActionHandlers>();

export function registerModuleLabActions(
  slot: ModuleLabActionHandlers,
): () => void {
  handlers.add(slot);
  return () => {
    handlers.delete(slot);
  };
}

export function getModuleLabActions(): {
  create: (moduleId: ModuleId) => void;
  reset: () => void;
} {
  return {
    create(moduleId) {
      for (const slot of handlers) {
        slot.create?.(moduleId);
      }
    },
    reset() {
      for (const slot of handlers) {
        slot.reset?.();
      }
    },
  };
}
