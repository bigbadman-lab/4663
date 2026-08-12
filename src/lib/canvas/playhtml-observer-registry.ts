/**
 * Idempotent PlayHTML Yjs deep-observer registry protocol.
 *
 * Mirrors the durable patch applied to playhtml's Ge registry
 * (`${tag}:${id}` → observeDeep callback) so setup/teardown cannot
 * unobserveDeep the same callback twice.
 *
 * App code does not own PlayHTML's Ge Map; this module is the tested
 * semantic contract for the patch.
 */

export type DeepObserver = (...args: unknown[]) => void;

export type YDeepObservable = {
  observeDeep: (fn: DeepObserver) => void;
  unobserveDeep: (fn: DeepObserver) => void;
};

/** PlayHTML-shaped registry: key `${tag}:${id}` → callback. */
export type ObserverRegistry = Map<string, DeepObserver>;

export function playhtmlObserverKey(tag: string, id: string): string {
  return `${tag}:${id}`;
}

/**
 * Setup / rebind (Yc semantics).
 * Claims any prior registry entry before unobserving it, then binds `next`.
 */
export function bindDeepObserverIdempotent(input: {
  registry: ObserverRegistry;
  key: string;
  yType: YDeepObservable;
  next: DeepObserver;
}): { unbound: DeepObserver | null; bound: DeepObserver } {
  const prev = input.registry.get(input.key) ?? null;
  if (prev) {
    input.registry.delete(input.key);
    input.yType.unobserveDeep(prev);
  }
  input.yType.observeDeep(input.next);
  input.registry.set(input.key, input.next);
  return { unbound: prev, bound: input.next };
}

/**
 * Teardown (Bn / removePlayElement semantics).
 * Only unobserves when the registry still owns a callback; repeated calls no-op.
 */
export function unbindDeepObserverIdempotent(input: {
  registry: ObserverRegistry;
  key: string;
  yType: YDeepObservable | null;
}): { unbound: DeepObserver | null } {
  const prev = input.registry.get(input.key) ?? null;
  if (!prev) {
    return { unbound: null };
  }
  input.registry.delete(input.key);
  if (input.yType && typeof input.yType.unobserveDeep === "function") {
    input.yType.unobserveDeep(prev);
  }
  return { unbound: prev };
}
