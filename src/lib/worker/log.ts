const PREFIX = "[4663-worker]";

/** Structured worker logs — never pass secrets as arguments. */
export function workerLog(message: string): void {
  console.log(`${PREFIX} ${message}`);
}

export function workerError(message: string, error?: unknown): void {
  if (error instanceof Error) {
    console.error(`${PREFIX} ${message}: ${error.message}`);
    return;
  }
  if (error !== undefined) {
    console.error(`${PREFIX} ${message}:`, error);
    return;
  }
  console.error(`${PREFIX} ${message}`);
}
