#!/usr/bin/env node
/**
 * Apply patch-package patches.
 *
 * Vercel/CI can restore a cached node_modules/playhtml that already has an
 * older patch applied. The newer combined patch then fails mid-file (partial
 * match). On failure, reinstall virgin playhtml from the lockfile version and
 * retry once.
 *
 * Note: patch-package may print apply errors and still exit 0 in some cases,
 * so we also inspect stdout/stderr.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function run(command, args, opts = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: opts.stdio || "pipe",
    env: { ...process.env, ...opts.env },
  });
}

function patchSucceeded(result) {
  const out = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) return false;
  if (/Failed to apply patch/i.test(out)) return false;
  if (/finished with [1-9]\d* error/i.test(out)) return false;
  if (!/Applying patches/i.test(out)) return false;
  return true;
}

function patchOnce() {
  const result = run("npx", ["patch-package"]);
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  return patchSucceeded(result);
}

function lockedPlayhtmlVersion() {
  const lockPath = path.join(root, "package-lock.json");
  if (!fs.existsSync(lockPath)) return "2.14.1";
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    return lock.packages?.["node_modules/playhtml"]?.version || "2.14.1";
  } catch {
    return "2.14.1";
  }
}

if (patchOnce()) {
  process.exit(0);
}

const playhtmlDir = path.join(root, "node_modules", "playhtml");
const version = lockedPlayhtmlVersion();

console.warn(
  `[postinstall] patch-package failed (likely stale playhtml cache). Reinstalling playhtml@${version} and retrying…`,
);

fs.rmSync(playhtmlDir, { recursive: true, force: true });

const install = run(
  "npm",
  [
    "install",
    `playhtml@${version}`,
    "--no-save",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  { stdio: "inherit" },
);

if (install.status !== 0) {
  process.exit(install.status || 1);
}

if (!fs.existsSync(path.join(playhtmlDir, "package.json"))) {
  console.error("[postinstall] playhtml reinstall did not produce node_modules/playhtml");
  process.exit(1);
}

if (!patchOnce()) {
  process.exit(1);
}

process.exit(0);
