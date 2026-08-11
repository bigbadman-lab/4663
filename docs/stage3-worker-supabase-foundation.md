# Stage 3 — Worker + Supabase foundation

Infrastructure only. No Alchemy, no factory decode, no product events.

## 1. Worker boot sequence

1. Load `.env.local` (local) / process env (Render)
2. `loadWorkerConfig()` — fail fast if `CHAIN_ID`, `SUPABASE_URL`, or `SUPABASE_SECRET_KEY` missing/invalid
3. Create service-role Supabase client
4. Prove connectivity with a private-table SELECT (`worker_health`)
5. Load known cursors: `pons_factories`, `pons_transfers`
6. Compute **in-memory** startup rewind: `max(0, N - 5)` (does not write cursors)
7. Load `pons_launches` where `status = 'active'`
8. Batch-load `pons_first_buyers` for those tokens
9. Reconstruct RAM: `activeTokens`, `confirmedBuyers`, `rollingFirstBuyers`
10. Upsert `worker_health` (initial heartbeat)
11. Heartbeat every 30s until `SIGINT` / `SIGTERM`
12. On shutdown: stop timer, final heartbeat, exit 0

Entrypoint: `scripts/worker.ts`

## 2. Config requirements

| Variable | Required Stage 3 | Role |
| --- | --- | --- |
| `CHAIN_ID` | yes | Must be `4663` |
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SECRET_KEY` | yes | Service role secret |
| `ALCHEMY_RPC_URL` | no | Chain stage later |
| Factory / public keys | no | Not used here |

Module: `src/lib/worker/config.ts` — call `loadWorkerConfig()` at runtime only (no secret evaluation at import for Next).

Never log secret values.

## 3. Service-role trust boundary

- Worker writes use **service role** only (`createWorkerSupabase`)
- Session persistence disabled; no browser storage
- Stage 1 RLS keeps private tables closed to `anon`
- Service role bypasses RLS for trusted server work
- Do **not** grant public INSERT/SELECT on worker tables to make the worker work
- Do **not** import worker modules from client components

## 4. Repository modules

| Module | Responsibility |
| --- | --- |
| `repositories/cursors.ts` | load / upsert cursors; highest durable block helper |
| `repositories/launches.ts` | load ACTIVE launches |
| `repositories/first-buyers.ts` | batch load first buyers for token set |
| `repositories/worker-health.ts` | upsert + load operational health row |

Raw query scatter avoided; repositories stay thin and Stage-3-scoped.

## 5. Durable vs in-memory state

| Durable (Supabase) | RAM (cache) |
| --- | --- |
| `pons_launches` | `activeTokens` |
| `pons_first_buyers` | `confirmedBuyers`, `rollingFirstBuyers` |
| `chain_cursors` | startup scan origin only |
| `worker_health` | active count snapshot |

Restart reconstructs everything from Supabase. No local files required.

Stage 3 **does not** prune rolling queues by wall clock — no chain timestamp available yet.

## 6. Startup cursor rewind

```text
saved N = last_processed_block  (or 0 if missing row)
startup_from = max(0, N - 5)
```

- Rewind is **runtime only**
- Database continues to store the highest safely processed block
- Stage 2 exclusive resume `N+1` still applies once live scanning begins

## 7. Heartbeat semantics

- Interval: **30s** (`HEARTBEAT_INTERVAL_MS`)
- `worker_name = 4663-pons-worker`
- `last_heartbeat_at` / `updated_at`: wall clock (ops only)
- `latest_chain_block`: `null` (no Alchemy)
- `latest_processed_block`: max known durable cursor, else `null`
- `active_tokens`: in-memory ACTIVE count
- Single-row upsert — no history table
- Stale heartbeat never changes product event semantics

## 8. Shutdown behaviour

- Handle `SIGINT` and `SIGTERM`
- Clear heartbeat timer
- Best-effort final health upsert
- Exit cleanly

## 9. Local execution

```bash
# Continuous (Ctrl+C to stop)
npm run worker

# Boot + one health write, then exit (smoke-friendly)
npm run worker:once

# Pure unit tests
npm test
```

Worker scripts use `node --import tsx` (avoids tsx CLI IPC). Env loading: entrypoint loads `.env.local` via `dotenv` (Node scripts do not use Next auto-env).

## 10. What Stage 3 deliberately does NOT do

- Alchemy / Robinhood RPC
- Factory log decode / launch discovery
- Transfer polling
- PonsBuy validation
- Product event emission
- Realtime / frontend / presence
- Render deploy
- Schema changes

## 11. Future Render mapping

Run the same entry as a background worker:

```bash
npm run worker
```

Required Render env (server-only):

- `CHAIN_ID=4663`
- `SUPABASE_URL=...`
- `SUPABASE_SECRET_KEY=...`

Add Alchemy vars only when the chain-scanning stage lands.

## Package scripts

| Script | Purpose |
| --- | --- |
| `npm run worker` | long-running foundation process |
| `npm run worker:once` | connection smoke test |
| `npm test` | focused pure unit tests |
