/**
 * Lab-only module catalogue. NOTE is the sole V1 entry.
 */

import type { ModuleDefinition, ModuleId } from "@/lib/modules/types";

export const NOTE_MODULE: ModuleDefinition = {
  id: "note",
  displayName: "NOTE",
  category: "create",
  tier: "free",
  multipleInstances: true,
};

export const MODULE_LAB_MODULES: readonly ModuleDefinition[] = [
  NOTE_MODULE,
];

const BY_ID: ReadonlyMap<ModuleId, ModuleDefinition> = new Map(
  MODULE_LAB_MODULES.map((definition) => [definition.id, definition]),
);

export function getModuleDefinition(
  id: string,
): ModuleDefinition | null {
  if (id !== "note") return null;
  return BY_ID.get(id) ?? null;
}

export function listInstallableModules(): readonly ModuleDefinition[] {
  return MODULE_LAB_MODULES;
}
