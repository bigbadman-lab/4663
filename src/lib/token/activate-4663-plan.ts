/**
 * LAUNCH1 — parse args for official 4663 contract activation.
 */

export type Activate4663Args =
  | { ok: true; contract: string }
  | { ok: false; error: string };

export function parseActivate4663Args(argv: string[]): Activate4663Args {
  let contract: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--contract") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        return { ok: false, error: "missing_value_for_--contract" };
      }
      contract = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("--contract=")) {
      contract = arg.slice("--contract=".length);
      continue;
    }
    return { ok: false, error: `unknown_arg:${arg}` };
  }

  if (!contract) {
    return {
      ok: false,
      error: "missing_--contract (usage: npm run launch:activate-4663 -- --contract 0x...)",
    };
  }

  return { ok: true, contract };
}

export function hasDeployedBytecode(code: string | null | undefined): boolean {
  if (!code) return false;
  const trimmed = code.trim().toLowerCase();
  return trimmed !== "" && trimmed !== "0x" && trimmed !== "0x0";
}
