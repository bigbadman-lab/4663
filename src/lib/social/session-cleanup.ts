/**
 * Social 1D — lightweight session-ended cleanup registry.
 *
 * Future TEXT / DRAW / WATCH / SUMMON ownership should register here
 * instead of inventing separate LEAVE paths.
 *
 * Does not run on render, reconnect, or anonymous observe.
 * Invoked only when a named participation session explicitly ends.
 */

export type SessionEndedReason = "leave";

export type SessionEndedContext = {
  reason: SessionEndedReason;
  /** Participation session id that just ended. */
  sessionId: string;
};

export type SessionEndedHandler = (ctx: SessionEndedContext) => void;

export class SessionCleanupRegistry {
  private readonly handlers = new Set<SessionEndedHandler>();

  register(handler: SessionEndedHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Test helper — number of registered handlers. */
  size(): number {
    return this.handlers.size;
  }

  notify(ctx: SessionEndedContext): void {
    for (const handler of this.handlers) {
      handler(ctx);
    }
  }
}

/** Process-local registry for browser app + unit tests. */
export const sessionCleanupRegistry = new SessionCleanupRegistry();

export function registerSessionEndedHandler(
  handler: SessionEndedHandler,
): () => void {
  return sessionCleanupRegistry.register(handler);
}

export function notifySessionEnded(ctx: SessionEndedContext): void {
  sessionCleanupRegistry.notify(ctx);
}
