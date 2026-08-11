# Stage 7A — Production cutover + cursor alignment + Render readiness

## 1. Why cutover exists

Development/research scans left durable cursors and ACTIVE launches that must not become the production baseline. Production is a **forward observation** of PONS from an explicit live start block — not a historical indexer.

## 2. Immutable production start block

Table `production_state` (singleton per `chain_id = 4663`):

| Column | Meaning |
|--------|---------|
| `production_start_block` | **B** — last pre-production processed block |
| `production_started_at` | Wall time of cutover commit (metadata only) |
| `cutover_version` | `pons-live-v1` |
| `created_at` | Row insert time |

No second cutover / no `--force` rewrite via the operator command.

## 3. Boundary semantics

Cursors after cutover:

- `pons_factories.last_processed_block = B`
- `pons_transfers.last_processed_block = B`

Next exclusive new work starts at **B+1**.

**Production launch eligibility:**

```
launch_block_number > B
```

- Launch **at** block B: **not** production-eligible  
- Launch **at** B+1: production-eligible  

`expired` product status is **not** misused for cutover; old ACTIVE rows may remain in DB.

## 4. Cursor alignment

Atomic RPC `perform_production_cutover` inserts marker and upserts **both** cursors to B in one transaction. Divergence after live operation is allowed (factories may lead transfers) under the existing factory ≥ transfer barrier.

## 5. Startup rewind interaction

Stage 2 `STARTUP_REWIND_BLOCKS = 5` still applies **in memory only**.

- Durable N remains B  
- Startup may read logs from `max(0, B−5)`  
- Pre-B launches are **not** inserted when production filter is set  
- Any pre-B ACTIVE still in DB is **not** loaded into production RAM  

## 6. Treatment of development rows

- Not deleted by cutover  
- Not forced to `expired` (that would abuse chain-time expiry meaning)  
- Excluded from production watch via `launch_block_number > B`  

## 7. Production startup filtering

Worker loads:

```
status = active AND launch_block_number > production_start_block
```

Transfer address batches come only from RAM ACTIVE set (already filtered).

Factory insert path skips `launch_block ≤ B` after cutover.

## 8. Cutover command

```bash
# Dry-run (required first)
npm run worker:cutover-production -- --from-head
npm run worker:cutover-production -- --from-block <N>

# Apply (operator only after review)
npm run worker:cutover-production -- --from-head --confirm
```

`--from-head` = B equals current Alchemy head; production observes launches **after** that block.

## 9. Dry-run behaviour

Without `--confirm`: report state, plan, mutations that **would** occur; exit without writing.

## 10. One-time / idempotency

If `production_state` exists: command **refuses** (no force flag). Future reset needs deliberate migration/tool.

## 11. Render environment contract

Server-only (Background Worker):

| Variable | Notes |
|----------|--------|
| `CHAIN_ID` | `4663` |
| `ALCHEMY_RPC_URL` | Alchemy HTTP |
| `PONS_FACTORY_V1` | Factory address |
| `PONS_FACTORY_V2` | Factory address |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SECRET_KEY` | Service role key |

Not required for worker: `NEXT_PUBLIC_*`, `DATABASE_URL`.

## 12. Render build / start

- **Service type:** Background Worker  
- **Build:** `npm install` (or Render default)  
- **Start:** `npm run worker`  

Expected boot logs (after cutover):

```
production_start_block=…
production mode active
eligibility: launch_block_number > …
cursor pons_factories: …
cursor pons_transfers: …
```

Without cutover, process **exits** with refuse message (Render failure → fix cutover, not silent uncutover scan).

## 13. Preflight

```bash
npm run worker:preflight
```

Checks config, Supabase, Alchemy, cutover marker, both cursors, health reachability. **No** broad scans.

Inspect audit only:

```bash
npm run worker:inspect-state
```

## 14. Rollback / non-goals

- No casual rewrite of B  
- No full history backfill  
- No frontend / presence / PlayHTML  
- No Render deploy in this stage  

## 15. Operator steps next

1. Apply Stage 7A migration (Stage 6 if not applied).  
2. `npm run worker:inspect-state`  
3. `npm run worker:cutover-production -- --from-head` (dry-run)  
4. Review counts and B  
5. `npm run worker:cutover-production -- --from-head --confirm`  
6. `npm run worker:preflight`  
7. `npm run worker:once` (clean boot smoke)  
8. Create Render Background Worker with env + `npm run worker`  

## Operator scan tools after cutover

- Bootstrap refused  
- Scan factories/transfers: no `--advance-cursor`; pre-boundary factory insert blocked unless `--allow-pre-boundary-insert` (danger)  
- Transfer scans only load production-eligible ACTIVE tokens  

## Migration

`supabase/migrations/20260811220000_stage7a_production_cutover.sql`
