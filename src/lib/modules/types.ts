/**
 * Minimum module contract for the Module Lab.
 * Metadata only — no billing, permissions, workers, or plugin loading.
 */

export type ModuleId = "note" | "checklist" | "countdown";

export type ModuleCategory = "create" | "organise";

export type ModuleTier = "free" | "pro";

export type ModuleDefinition = {
  id: ModuleId;
  displayName: string;
  category: ModuleCategory;
  tier: ModuleTier;
  multipleInstances: boolean;
};
