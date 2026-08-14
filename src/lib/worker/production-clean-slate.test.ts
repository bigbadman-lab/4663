/**
 * Stage 8A.4 — production clean-slate SQL static validation.
 * Ensures the manual wipe script only targets known wipe tables and never
 * deletes preserved continuity tables.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const WIPE_TABLES = [
  "canvas_pins",
  "canvas_marks",
  "chat_messages",
  "events",
  "presence",
] as const;

const PRESERVE_TABLES = [
  "chain_cursors",
  "production_state",
  "worker_health",
  "pons_launches",
  "pons_first_buyers",
] as const;

describe("Stage 8A.4 production clean-slate SQL", () => {
  const sql = readSrc("supabase/manual/production-clean-slate.sql");

  it("exists with production warning + transactional deletes", () => {
    assert.ok(sql.includes("PRODUCTION MANUAL OPERATION"));
    assert.ok(sql.includes("Stage 8A.4 clean-slate reset"));
    assert.ok(/\bbegin\s*;/i.test(sql));
    assert.ok(/\bcommit\s*;/i.test(sql));
    const executable = sql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--[^\n]*/g, "");
    assert.equal(/\bDROP\s+TABLE\b/i.test(executable), false);
    assert.equal(/\bDROP\s+SCHEMA\b/i.test(executable), false);
    assert.equal(/\bTRUNCATE\b/i.test(executable), false);
  });

  it("delete targets only known wipe tables in safe order", () => {
    const deletes = [
      ...sql.matchAll(/^\s*delete\s+from\s+public\.([a-z0-9_]+)\s*;/gim),
    ].map((m) => m[1]!);

    assert.deepEqual(deletes, [...WIPE_TABLES]);

    // Logical order: pins before events (logical event_id dependency).
    assert.ok(deletes.indexOf("canvas_pins") < deletes.indexOf("events"));
    assert.ok(deletes.indexOf("canvas_marks") < deletes.indexOf("events"));
  });

  it("never deletes preserved continuity / PONS intelligence tables", () => {
    for (const table of PRESERVE_TABLES) {
      assert.equal(
        new RegExp(`delete\\s+from\\s+public\\.${table}\\s*;`, "i").test(sql),
        false,
        `must not delete ${table}`,
      );
      assert.ok(
        sql.includes(`public.${table}`) || sql.includes(`-- public.${table}`),
        `should document/query ${table}`,
      );
    }
  });

  it("wipe + preserve tables exist in migrations; no FKs / cascades", () => {
    const migrationsDir = path.join(root, "supabase/migrations");
    const migrationSql = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(path.join(migrationsDir, f), "utf8"))
      .join("\n");

    const created = new Set(
      [...migrationSql.matchAll(/CREATE TABLE public\.([a-z0-9_]+)/gi)].map(
        (m) => m[1]!,
      ),
    );

    for (const table of [...WIPE_TABLES, ...PRESERVE_TABLES]) {
      assert.ok(created.has(table), `missing CREATE TABLE for ${table}`);
    }

    const ddlOnly = migrationSql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--[^\n]*/g, "");
    assert.equal(/\bFOREIGN KEY\b/i.test(ddlOnly), false);
    assert.equal(/\bREFERENCES\b/i.test(ddlOnly), false);
    assert.equal(/\bON DELETE CASCADE\b/i.test(ddlOnly), false);
  });

  it("documents PlayHTML / summon as out-of-band (not Supabase)", () => {
    assert.ok(sql.includes("PlayHTML"));
    assert.ok(sql.includes("4663-active-summon") || sql.includes("SUMMON"));
    assert.ok(sql.includes("NOT DELETED"));
  });
});
