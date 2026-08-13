/**
 * Social 5 — session-content RESET registry (identity preserved).
 * Distinct from session-ended (LEAVE), which ends participation.
 */

export type SessionContentResetContext = {
  reason: "reset";
  sessionId: string;
};

export type SessionContentResetHandler = (
  ctx: SessionContentResetContext,
) => void;

export class SessionContentResetRegistry {
  private readonly handlers = new Set<SessionContentResetHandler>();

  register(handler: SessionContentResetHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  size(): number {
    return this.handlers.size;
  }

  notify(ctx: SessionContentResetContext): void {
    for (const handler of this.handlers) {
      handler(ctx);
    }
  }
}

export const sessionContentResetRegistry = new SessionContentResetRegistry();

export function registerSessionContentResetHandler(
  handler: SessionContentResetHandler,
): () => void {
  return sessionContentResetRegistry.register(handler);
}

export function notifySessionContentReset(
  ctx: SessionContentResetContext,
): void {
  sessionContentResetRegistry.notify(ctx);
}
