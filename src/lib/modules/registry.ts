/**
 * Lab-only module catalogue.
 */

import type { ModuleDefinition, ModuleId } from "@/lib/modules/types";

export const NOTE_MODULE: ModuleDefinition = {
  id: "note",
  displayName: "NOTE",
  category: "create",
  tier: "free",
  multipleInstances: true,
};

export const CHECKLIST_MODULE: ModuleDefinition = {
  id: "checklist",
  displayName: "CHECKLIST",
  category: "organise",
  tier: "free",
  multipleInstances: true,
};

export const COUNTDOWN_MODULE: ModuleDefinition = {
  id: "countdown",
  displayName: "COUNTDOWN",
  category: "organise",
  tier: "free",
  multipleInstances: true,
};

export const BOARD_MODULE: ModuleDefinition = {
  id: "board",
  displayName: "BOARD",
  category: "organise",
  tier: "free",
  multipleInstances: true,
};

export const MODULE_LAB_MODULES: readonly ModuleDefinition[] = [
  NOTE_MODULE,
  CHECKLIST_MODULE,
  COUNTDOWN_MODULE,
  BOARD_MODULE,
];

const BY_ID: ReadonlyMap<ModuleId, ModuleDefinition> = new Map(
  MODULE_LAB_MODULES.map((definition) => [definition.id, definition]),
);

export function getModuleDefinition(
  id: string,
): ModuleDefinition | null {
  if (
    id !== "note" &&
    id !== "checklist" &&
    id !== "countdown" &&
    id !== "board"
  ) {
    return null;
  }
  return BY_ID.get(id) ?? null;
}

export function listInstallableModules(): readonly ModuleDefinition[] {
  return MODULE_LAB_MODULES;
}
