# Stage 6 — PONS buying activity event engine

Product event engine for ACTIVE launches: rolling first-buyer threshold → one `pons_buying_activity` event → FIRED, or 60-minute watch end → EXPIRED. No frontend.

## 1. Exact event rule

A token fires `pons_buying_activity` when **all** hold at evaluation chain time **T**:

1. Launch status is `active`
2. Launch is a known PONS factory discovery (Stage 4)
3. Token age `T - launch_block_timestamp` satisfies **`180 ≤ age ≤ 3600`** seconds
4. ≥ **5** distinct durable first buyers with  
   `T − 180 ≤ first_buy_block_timestamp ≤ T` (inclusive)
5. Repeated buys by the same wallet never increase the count (first-buyer uniqueness)
6. At most **one** event per `(chain_id, event_type=pons_buying_activity, token_address)`

MVP emits **no** almost/low-activity/timeout product events.

Constants (frozen):

| Name | Value |
|------|------:|
| `CHAIN_ID` | 4663 |
| `EVENT_AGE_FLOOR_SECONDS` | 180 |
| `EVENT_WINDOW_SECONDS` | 180 |
| `EVENT_NEW_BUYERS_THRESHOLD` | 5 |
| `TOKEN_WATCH_TTL_SECONDS` | 3600 |

## 2. Inclusive boundaries

| Boundary | Rule |
|----------|------|
| Age floor | `age >= 180` (exactly 180 fires if count met) |
| Watch TTL for fire | `age <= 3600` (buyer at age exactly 3600 may count) |
| Rolling window | `T − 180 ≤ t ≤ T` |
| Expiry | `age > 3600` after fire evaluation; fire attempted **before** expire |
| Buyer at age 3601 | Outside fire age; if still ACTIVE → expire path |

## 3. Evaluation chain-time source

**Chain block timestamps are the sole semantic authority** for age, window membership, fire, expiry, and `events.occurred_at`.

After a Transfer range is **fully** processed and `pons_transfers.last_processed_block` is committed to **N**:

1. Fetch block **N** timestamp via RPC
2. Evaluate all ACTIVE tokens at **T = block(N).timestamp**

When already at tip (`from > head`), still evaluate at durable transfer **N** so age-floor crossing and expiry progress without new Transfer logs.

Do **not** use worker wall clock for product decisions. Do **not** use head beyond the transfer cursor as evaluation time (avoids firing on incomplete first-buyer truth).

## 4. Age-floor crossing without a new transaction

Example:

- Buyers at launch+20, +40, +80, +120, +170
- No buy at +180
- When processed chain time reaches launch+180 → all five remain in the inclusive 180s window and age floor is met → **fire**

Fire must **not** require a sixth transaction.

## 5. Rolling queue semantics

Runtime `rollingFirstBuyers` is an optimisation only:

- Pruned at each evaluation **T** to the inclusive window
- Entries with `t < T − 180` dropped from RAM
- **Durable** `pons_first_buyers` rows are **never** deleted when they leave the window
- Candidate screen: attempt durable fire only when RAM age floor + count ≥ 5

## 6. Durable fire verification

RAM eligibility is cheap screening. Before creating a product event, the worker calls Postgres RPC `fire_pons_buying_activity` which **recomputes** count and age from durable rows under row lock.

If RAM is wrong (e.g. only 4 durable buyers), RPC returns `not_eligible` and the launch stays `active`.

## 7. Atomic DB function

Migration: `supabase/migrations/20260811213000_stage6_atomic_event_fire.sql`

**`fire_pons_buying_activity(...)`** (service_role, single transaction):

1. Lock `pons_launches` row  
2. Require `active` on chain 4663  
3. Reject / heal if event already exists or status terminal  
4. Compute age from launch timestamp vs supplied evaluation timestamp  
5. Count first buyers in inclusive window  
6. Require count ≥ threshold  
7. Insert one `events` row (`occurred_at` = evaluation chain time, **not** `now()`)  
8. Set launch `status = fired`, `event_fired_at = evaluation timestamp`  
9. Return jsonb status (`fired` | `already_fired` | `not_eligible` | …)

**`expire_pons_launch(...)`**: expire only when still `active` and no event; if event exists, heal to `fired` instead of overwriting.

## 8. Trigger tx / block semantics

| Field | Meaning |
|-------|---------|
| `trigger_block_number` | Evaluation block where condition became fireable |
| `trigger_tx_hash` | **Nullable**. Set only when the latest in-window first buyer’s `first_buy_block_number` equals the evaluation block (buyer-driven fire). **NULL** for pure age-floor fires — never invent a hash |

Stage 6 migration drops `NOT NULL` on `trigger_tx_hash` for this reason.

## 9. Expiry ordering

Per token at evaluation **T**:

1. Prune rolling RAM  
2. If RAM eligible → durable fire RPC  
3. If terminal after fire/heal → unwatch  
4. Else if operational fire failure → **skip expiry** (retry while ACTIVE)  
5. Else if `age > 3600` → conditional expire RPC  
6. Unwatch on expired / already terminal  

Valid activity through age **3600** is processed before expiry is allowed.

## 10. Fire vs expiry race protection

- Fire under `FOR UPDATE` on the launch row  
- Expire refuses non-`active` and refuses when an event row exists (heals to fired)  
- Unique index on one `pons_buying_activity` per token remains a second safety layer  
- No terminal → active transitions  

## 11. Post-fire / expiry unwatch

Only after durable success, remove from:

- `activeTokens`
- `confirmedBuyers`
- `rollingFirstBuyers`

Transfer batching always uses **current** `memory.activeTokens` addresses — fired/expired tokens leave the multi-address getLogs set immediately.

Restart: only `status = active` launches reload; fired/expired are not re-watched.

## 12. Failure / retry semantics

| Situation | Behaviour |
|-----------|-----------|
| First-buyer insert fail | Transfer range incomplete; cursor not advanced |
| Lifecycle / fire RPC operational fail | Launch stays `active`; logged; **no expire**; next poll re-evaluates at durable transfer N |
| Durable `not_eligible` | Stay active until true eligibility or expiry |
| Cursor after failed fire | Transfer may already be at N; tip path re-evaluates life without advancing |

Operational failure must never turn a genuine event into an expiry.

## 13. Crash / replay guarantees

| Scenario | Guarantee |
|----------|-----------|
| 5th buyer durable, crash before eval | Restart rebuilds rolling queue; eval at chain progress fires |
| Fire commits, crash before RAM remove | Restart loads non-active; no expensive watch |
| RAM eligible, durable 4 buyers | RPC refuses; no event |
| Concurrent fire attempts | One event; others `already_fired` / unique_violation |
| Expire races fire | Fired / event existence wins |
| Historic buyer replay after FIRED | Launch not active; no second event |

## 14. Historical validation

Prefer pure fixtures (tests A–L) for regression. Optional bounded live replay against real chain + Supabase must isolate or use non-prod data; do not invent production chain events.

## 15. Deferred (not Stage 6)

- Frontend canvas / Realtime UI  
- PlayHTML, presence  
- Render deploy  
- Sells, scoring, recommendations  
- Token symbol/name fetch in fire path  
- Additional event types  
- AI  

## Worker loop order (operational)

1. Observe chain head  
2. Process factories through target  
3. Process transfers through safe target (factory ≥ transfer barrier)  
4. Persist new first buyers  
5. Commit transfer cursor  
6. Evaluate ACTIVE lifecycle at processed block timestamp  
7. Atomic fire then expire  
8. Heartbeat / cursors  
9. Repeat  

## Manual SQL

If CLI migrate is not configured, paste the full contents of:

`supabase/migrations/20260811213000_stage6_atomic_event_fire.sql`

into the Supabase SQL Editor (service-capable) and run once.
