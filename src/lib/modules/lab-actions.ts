/**
 * Module Lab action bridge — dock + NOTE layer, isolated from homepage create.
 */

export type ModuleLabActions = {
  createNote: () => void;
  reset: () => void;
};

let registered: ModuleLabActions | null = null;

export function registerModuleLabActions(
  actions: ModuleLabActions,
): () => void {
  registered = actions;
  return () => {
    if (registered === actions) registered = null;
  };
}

export function getModuleLabActions(): ModuleLabActions | null {
  return registered;
}
