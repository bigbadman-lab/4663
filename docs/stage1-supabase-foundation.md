# Stage 1 — Supabase foundation data contract

Canonical system time: **UTC** (`timestamptz`).  
Chain ID: **4663** (defaults on relevant tables).  
Migration: `supabase/migrations/20260811203847_stage1_foundation.sql`

## 1. Tables

| Table | Purpose |
| --- | --- |
| `pons_launches` | One durable row per discovered PONS token launch; lifecycle via `status`. |
| `pons_first_buyers` | First confirmed strict buyer per token+wallet (idempotent buyer set). |
| `chain_cursors` | Restart-safe scan progress per stream (`last_processed_block`). |
| `events` | Public product events (MVP: `pons_buying_activity`). |
| `worker_health` | Render worker heartbeat + coarse progress (upsert by `worker_name`). |
| `presence` | Anonymous visitor heartbeats (ephemeral session IDs only). |

View:

| View | Purpose |
| --- | --- |
| `public_presence_summary` | Coarse live aggregates only (`live_users`, `by_country`, `by_city`). No `session_id`. |

## 2. Important constraints

- **Addresses / hashes**: stored lowercase `0x` + hex; CHECK enforces normalisation and length (20-byte address / 32-byte tx hash).
- **`pons_launches`**: `factory_version ∈ {v1,v2}`; `status ∈ {active,fired,expired}`; unique `(chain_id, token_address)` and `(chain_id, launch_tx_hash)`.
- **`pons_first_buyers`**: unique `(chain_id, token_address, wallet_address)`.
- **`chain_cursors`**: unique `(stream_name, chain_id)`. Expected streams: `pons_factories`, `pons_transfers` (not hard-coded as rows).
- **`events`**: `event_type = pons_buying_activity`, `source = pons`; unique `(chain_id, event_type, token_address)` → one MVP event per token.
- **`worker_health`**: PK `worker_name`.
- **`presence`**: PK `session_id`; optional `city` / ISO-2 `country_code`; no IP / lat/lon.
- **`updated_at`**: maintained by shared trigger function `set_updated_at()` on mutable tables.

## 3. Public vs private access

| Surface | Browser (`anon` / `authenticated`) | Worker (`service_role`) |
| --- | --- | --- |
| `events` | **SELECT only** | full (bypasses RLS) |
| `public_presence_summary` | **SELECT only** | full |
| `pons_launches` | none | full |
| `pons_first_buyers` | none | full |
| `chain_cursors` | none | full |
| `worker_health` | none | full |
| `presence` | none (no raw session rows) | full |

RLS is enabled on all base tables. Direct grants to browser roles are revoked on private tables.  
No MVP auth: public product surfaces are intentionally open read; all writes stay server/service-role.

## 4. Idempotency model

1. **Launch discovery** — unique token and launch tx per chain → safe re-ingest of factory logs.
2. **First buyers** — unique `(chain, token, wallet)` → replaying the same buy never double-counts.
3. **Product event** — unique `(chain, event_type, token)` → at most one MVP event per token; conflict = already fired.
4. **Cursors** — upsert by `(stream_name, chain_id)` advances only after durable side effects are committed in the worker transaction strategy (Stage 2+).

## 5. Restart / replay model

- Cursors store the **last safely persisted processed block**.
- On restart, the worker resumes at `last_processed_block + 1` (or re-reads the last block if using inclusive checkpointing — decide in the worker).
- Replay of history is safe because launches, first buyers, and events reject duplicates via unique constraints.
- Active launches remain queryable until `status` becomes `fired` or `expired`, so in-flight tokens recover without scanning the entire chain again.

## 6. Why we do not store every transfer

Only **confirmed first-time strict buyers** matter for the 180s multi-wallet signal. Persisting all transfers would explode storage and still leave rejection logic in the worker. Rejected candidates are dropped in process; only accepted first buys land in `pons_first_buyers`.

## 7. Presence privacy model

- Anonymous `session_id` only; no accounts, no IP, no precise geo.
- Raw `presence` rows are **private** (RLS on, no browser policies/grants).
- Browsers may later read `public_presence_summary` (120s “live” window) or a future server route if aggregate access needs throttling.
- Heartbeat/upsert of sessions is intentionally deferred (worker or edge/API — not Stage 1).

## 8. UTC convention

All timestamps are `timestamptz`. Writers must emit absolute UTC instants. Application code should format in UTC for logs and product display unless a later locale layer is added.

## 9. Intentionally deferred

- Render worker implementation / Alchemy / PONS scanning
- PonsBuy validation rules and 180s window evaluation
- Cursor seed rows / bootstrap block height
- API routes, Realtime client subscriptions
- Presence heartbeat writers and any server route for presence
- Auth, cron, job history / log tables
- Multi-chain beyond storing `chain_id`
- Non-PONS event types (constraint can be widened later)

## Apply this migration

Not applied automatically from this repo. In the Supabase dashboard:

1. Open **SQL Editor**
2. Paste the full contents of  
   `supabase/migrations/20260811203847_stage1_foundation.sql`
3. Run once against the project linked to `.env.local`
4. Confirm tables exist under **Table Editor** and RLS is on

Optional later: install Supabase CLI and link the project for `supabase db push`.
