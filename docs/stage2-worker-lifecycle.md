# Stage 2 — PONS worker lifecycle + restart / replay contract

Canonical time: **UTC**  
Chain: **Robinhood Chain**, `chain_id = 4663`  
Stage 1 schema: authoritative durable state  
This stage freezes worker behaviour. No live RPC, decoding, or Render loop.

---

## 1. Lifecycle state diagram

```text
                 durable resolve launch
                         │
                         ▼
                    ┌─────────┐
                    │ ACTIVE  │◀── in strict MVP watch
                    └────┬────┘
           ┌─────────────┼─────────────┐
           │ fire OK     │             │ watch TTL end
           │ (age≥180s,  │             │ (no fire)
           │  rolling≥5) │             │
           ▼             │             ▼
      ┌─────────┐        │        ┌─────────┐
      │  FIRED  │        │        │ EXPIRED │
      └─────────┘        │        └─────────┘
           │             │             │
           └─────────────┴─────────────┘
                    terminal
                 (no return to ACTIVE)
```

Status values are only Stage 1 `pons_launches.status`:

| Status | Meaning |
| --- | --- |
| `active` | Token+market resolved; in strict watch; first buyers accumulate |
| `fired` | MVP event durably emitted once; removed from strict watch forever |
| `expired` | Watch TTL ended without fire; never fires this MVP event |

**Legal transitions**

| From | To | When |
| --- | --- | --- |
| (new) | `active` | Launch + market resolved and persisted |
| `active` | `fired` | Atomic fire of `pons_buying_activity` succeeds |
| `active` | `expired` | Watch lifetime ended after processing all in-window activity |
| `fired` | — | terminal |
| `expired` | — | terminal |

No other statuses. No reactivation.

---

## 2. ACTIVE / FIRED / EXPIRED semantics

### ACTIVE

- Token entered only after durable resolve: factory, version, token, market, launch block, launch block timestamp.
- Belongs to the strict MVP observation set.
- First confirmed strict buyers may be recorded from launch onward.
- **Event evaluation is allowed only when `token_age_seconds >= 180`.**
- Accumulation of first buyers before age 180s is required and intentional.

### FIRED

- Exactly one `events` row with `event_type = pons_buying_activity` exists for the token.
- `pons_launches.status = 'fired'`, `event_fired_at` set (chain-time of firing decision / trigger block time).
- Permanently off the expensive strict watch.
- Cannot emit the same MVP event again (DB unique + status).

### EXPIRED

- `pons_launches.status = 'expired'`, `expired_at` set from chain-time authority.
- Left strict observation; never fires after this.
- Activity after the 60-minute boundary cannot create this MVP event.

---

## 3. Watch TTL (60 minutes)

Application constant (not env):

```text
TOKEN_WATCH_TTL_SECONDS = 3600   // 60 minutes from launch
```

```text
watch_end = launch_block_timestamp + 3600 seconds
```

Inclusive boundary:

```text
activity valid when  first_buy_ts <= watch_end
                   i.e. token age at that buy <= 3600s
fire allowed when    age_floor <= age <= 3600s  (and rolling ≥ 5)
expire when          after processing through watch_end, still ACTIVE
                     (chain_ts has reached launch + 3600)
strictly after end   age > 3600s  → no new qualification for this MVP event
```

- Expiry eligibility uses **chain/block timestamps**, never worker wall clock.
- Token may fire any time at age ≥ 180s through the inclusive 60-minute boundary.
- Qualifying first-buy activity with `timestamp > watch_end` does **not** count.
- TTL may later be tuned from production data; freeze implementation behind the constant.

---

## 4. Chain-time authority

| Decision | Time source |
| --- | --- |
| Launch time | launch block timestamp |
| First-buy time | buy tx block timestamp |
| Token age | `chain_ts - launch_ts` |
| Rolling buyer window | block timestamps of first buys vs current relevant `chain_ts` |
| `events.occurred_at` | trigger / evaluation chain timestamp |
| Fire eligibility | chain timestamps only |
| Expiry eligibility | chain timestamps only |
| Heartbeat / logs / poll schedule | worker wall clock (`now()` / `Date.now()`) |

**Rule:** Historical replay and live processing MUST yield the same product decisions for the same chain inputs. Never use wall clock for qualification.

---

## 5. Cursor definition

Table: `chain_cursors`  
Streams (MVP):

| `stream_name` | Role |
| --- | --- |
| `pons_factories` | Factory launch discovery |
| `pons_transfers` | Transfer logs for ACTIVE token watches |

### Inclusive / exclusive meaning

```text
last_processed_block = N
  ⇒ all durable effects for that stream through block N are committed successfully.

Next normal scan:
  from_block = last_processed_block + 1
  to_block   = latest_safe_chain_head   // implementation detail (e.g. tip − confirmations if any)

Cursor advances to K only after:
  every durable write required for [from_block, K] for that stream succeeded.
```

If processing fails mid-range:

- Do **not** advance past the last fully completed safe boundary.
- On restart, replay re-reads unfinished blocks.
- Idempotency makes duplicate attempts safe.

Cursor advance and stream side effects should share a consistent success boundary (prefer same transaction / ordered commit where tools allow; at minimum: effects first, then cursor).

---

## 6. Five-block startup rewind

On **every** worker process start (not on every poll):

```text
saved_cursor N = chain_cursors.last_processed_block for stream
resume_from     = max(0, N - STARTUP_REWIND_BLOCKS)
                // STARTUP_REWIND_BLOCKS = 5
```

Then process `[resume_from, …]` with at-least-once semantics.

**REPLAY IS EXPECTED. DUPLICATION MUST BE HARMLESS.**

Why five blocks:

- Covers partial range commits at boundary.
- Small safety margin around recent restart edge cases.
- No multi-block reorg engine for MVP.

After successful startup replay catch-up, cursors resume normal exclusive-forward stepping (`N+1`).

---

## 7. Startup recovery sequence

No local files. Supabase is durable truth; RAM is a cache.

1. Validate runtime config (chain id, RPC URL, factory addresses, Supabase server credentials).
2. Connect to Supabase with **service role** (server-only).
3. Load `chain_cursors` for `pons_factories` and `pons_transfers` (create zero-state rows if missing via upsert).
4. Load all `pons_launches` with `status = 'active'`.
5. Load `pons_first_buyers` for those active tokens only.
6. Rebuild in-memory maps/sets/queues (see §8).
7. Apply five-block rewind to each stream’s resume start.
8. Discover/process blockchain activity from resume start through current tip (missed work).
9. Using last processed **chain** timestamps, expire ACTIVE tokens already past watch TTL after processing eligible activity through the boundary.
10. Enter continuous poll loop.
11. Upsert `worker_health` heartbeats on a wall-clock interval (operational only).

Terminal rows (`fired` / `expired`) are never loaded into the strict watch set.

---

## 8. In-memory vs durable state

### Durable (Supabase) — authoritative

| Store | Role |
| --- | --- |
| `pons_launches` | Lifecycle + launch identity |
| `pons_first_buyers` | Confirmed first wallets |
| `events` | Emitted product truth |
| `chain_cursors` | Safe scan high-water marks |
| `worker_health` | Ops visibility only |

### In-memory (Render RAM) — reconstructible cache

Conceptual structures (all addresses normalised lowercase):

```text
activeTokens: Map<tokenAddress, {
  marketAddress,
  launchBlock,
  launchTimestamp,      // unix seconds UTC from chain
  factoryVersion,       // 'v1' | 'v2'
  factoryAddress,
  launchTxHash,
  ...
}>

confirmedBuyers: Map<tokenAddress, Set<walletAddress>>

rollingFirstBuyers: Map<tokenAddress, Array<{
  walletAddress,
  firstBuyBlockTimestamp  // unix seconds, ascending
}>>

// Convenience
markets: Map<tokenAddress, marketAddress>
activeTokenAddresses: Address[]   // for batched eth_getLogs
```

Rules:

- RAM is rebuilt only from durable rows + live scan effects.
- Losing RAM never loses product truth.
- After durable fire/expire, remove token from all active structures immediately **after** commit success; if crash before removal, startup simply does not reload terminal tokens.

---

## 9. Rolling 180-second semantics

Constants:

```text
EVENT_AGE_FLOOR_SECONDS    = 180
EVENT_WINDOW_SECONDS       = 180
EVENT_NEW_BUYERS_THRESHOLD = 5
```

### Inclusive window mathematics

Let `T` be the **current relevant chain timestamp** (unix seconds) for evaluation  
(usually the block timestamp of the buyer/event under consideration, or the highest block timestamp fully processed in the current range when doing age-floor sweeps).

A first buyer with timestamp `t_i` is **in window** iff:

```text
T - EVENT_WINDOW_SECONDS  <=  t_i  <=  T
```

Equivalently:

- Keep if `t_i >= T - 180` (inclusive lower bound)
- Drop if `t_i < T - 180` (strictly older than 180 seconds)

A buyer **exactly** 180 seconds old **still counts**.  
A buyer **older than** 180 seconds **does not**.

### On durable confirm of a new strict first buyer

1. Persist `pons_first_buyers` (`ON CONFLICT DO NOTHING` / ignore duplicate).
2. If insert was new (or RAM reconstruct): add wallet to `confirmedBuyers`.
3. Append `{wallet, firstBuyBlockTimestamp}` to rolling queue (keep ordered by timestamp).
4. Prune: drop entries with `t_i < T - 180`.
5. `age = T - launchTimestamp`.
6. If `age < 180`: do not fire.
7. If `age >= 180`: `count = |rolling queue after prune|`.
8. If `count >= 5`: attempt atomic fire (and only if still within watch TTL — see §11).

Repeated buys from an already confirmed wallet:

- Do not insert another first-buyer row.
- Do not re-append to the rolling queue.
- Do not re-run strict validation for counting purposes (§14).

---

## 10. Age-floor crossing behaviour

**Not** “one-shot check at 3 minutes.”

Buyers accumulate from launch. Eligibility starts at age ≥ 180s. The fifth buyer may have arrived earlier; firing can occur as soon as processed chain time crosses the age floor **without** a new transfer at that instant.

### Deterministic evaluation trigger

After fully processing durable effects for a block range ending at chain time `T_range` (or per-block `T`):

For each ACTIVE token still in watch:

1. Prune rolling queue against `T`.
2. Compute `age = T - launchTimestamp`.
3. If `age < EVENT_AGE_FLOOR_SECONDS` → skip fire evaluation.
4. If `age >= TOKEN_WATCH_TTL_SECONDS` → handle expiry ordering (§11) after in-window activity.
4. Else if rolling count ≥ 5 and age ≤ TOKEN_WATCH_TTL_SECONDS → attempt fire.

This keeps all decisions on chain progression; no wall-clock timers for product semantics.

---

## 11. Fire / expiry ordering

Within processing of chain progress up through timestamp `T`:

```text
1. Apply all factory discoveries and first-buyer validations for logs
   whose block timestamps are still <= min(T, watch_end) for each token.
2. Evaluate FIRE for ACTIVE tokens that qualify at their relevant T
   (age ≥ 180, rolling ≥ 5, T <= watch_end).
3. Only then: EXPIRE ACTIVE tokens with T >= watch_end that did not fire.
```

**Required rule:**  
PROCESS ALL QUALIFYING ACTIVITY THROUGH THE TOKEN'S 60-MINUTE BOUNDARY BEFORE EXPIRING IT.

Boundary cases:

- Buyer in the final valid block that brings count to ≥5 and age ≥180 → **FIRE**, do not expire.
- No qualification after processing through `watch_end` → **EXPIRED**.
- Activity with `block_timestamp > watch_end` → ignored for this MVP event path.

Firing wins over expiry when both would be conceivable in the same range.

---

## 12. Event firing atomicity

Logical atomic unit (one DB transaction or one Postgres RPC):

1. Take/row-lock the launch row for `token_address` (or `UPDATE … WHERE status = 'active' … RETURNING`).
2. Confirm still `active`.
3. Confirm no existing `events` row for `(chain_id, 'pons_buying_activity', token)`.
4. Prefer verifying qualifying count from durable `pons_first_buyers` at evaluation `T` (recompute inclusive 180s window) before insert.
5. `INSERT` into `events` (core columns + optional `payload`).
6. `UPDATE pons_launches SET status = 'fired', event_fired_at = <chain_ts>`.
7. Commit.

Only after commit success: drop token from all in-memory watch structures.

**If Supabase multi-statement tx is awkward in the client:** implement a small `fire_pons_buying_activity(...)` RPC (Stage 3+) rather than weaken atomicity with check-then-insert races.

Conflict on unique `events` or failed update because status ≠ active → another worker/replay already completed fire; treat as success for watch removal.

---

## 13. Idempotency guarantees

| Effect | Constraint / pattern |
| --- | --- |
| Launch | `UNIQUE (chain_id, token_address)`, `UNIQUE (chain_id, launch_tx_hash)` |
| First buyer | `UNIQUE (chain_id, token_address, wallet_address)` |
| Event | `UNIQUE (chain_id, event_type, token_address)` |
| Cursor | `UNIQUE (stream_name, chain_id)` |
| Worker health | PK `worker_name` |

Worker preference:

```text
INSERT … ON CONFLICT DO NOTHING / DO UPDATE
```

Avoid TOCTOU “SELECT then INSERT” for product writes.  
Replay of factories, transfers, fires, and cursors must be **semantically null-powered** on conflicts.

Address normalisation: always lowercase `0x` hex before write (Stage 1 CHECKs).

---

## 14. Crash scenarios

| Scenario | Outcome |
| --- | --- |
| Crash mid-block range before cursor advance | Restart rewinds 5 blocks; reprocess; uniques hold |
| First buyer insert committed, crash before RAM update | Startup reloads first buyers into sets/queues |
| Fire DB commit OK, crash before RAM remove | Startup loads `status=fired`; not in watch; no second event |
| Fire partial without RPC (client race) | Forbidden design; use single transaction/RPC |
| Cursor advanced without effects | Forbidden; always effects-before-or-with cursor |
| Expire committed, crash | Terminal status reloaded; ignored |

### Worker health

- Name: `4663-pons-worker`
- Fields: `last_heartbeat_at`, `latest_chain_block`, `latest_processed_block`, `active_tokens`, `updated_at`
- Wall-clock operational signal only
- **Stale heartbeat never changes fire/expiry/event semantics**

---

## 15. Candidate / first-wallet rule (lifecycle only)

For MVP new-wallet counting:

- If wallet ∈ confirmed set for token → ignore further buy candidates for **counting**; no more strict PonsBuy work for that wallet+token.
- If wallet ∉ confirmed set → future Stage 3+ runs **strict PonsBuy v0**; only success inserts `pons_first_buyers` and updates rolling state.
- Rejected candidates are never persisted.

Validator algorithm itself is deferred (do not port in Stage 2).

---

## 16. Factory address constants (known truth)

Normalised lowercase storage form (worker must lower before write):

| Version | Address |
| --- | --- |
| V1 | `0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb` |
| V2 | `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` |

Checksummed display forms used in product prose:

- V1: `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB`
- V2: `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`

---

## 17. Scenario verification (A–H)

### CASE A — fire at age floor with earlier buyers

Buyers #1–#5 between ages 20s–170s; at age 180s all still within 180s inclusive window.

**Expected:** When processed chain time first has `age >= 180`, rolling count ≥ 5 → **fire** (even without a new buy at 180s).

### CASE B — age floor alone insufficient

5 buyers arrive in the first 20 seconds (`t ∈ [L+1, L+20]`).

At `age = 180` (`T = L+180`), the inclusive lower bound is `T - 180 = L`, so those buyers **still lie inside the window** (a 180s window cannot expel 20s-old buys by age 180).

When evaluation reaches `T = L+201` (age 201), lower bound is `L+21`, so all first-20s buyers are **strictly outside** the inclusive window.

**Expected:** Crossing the age floor alone does not magically fire if the rolling window no longer holds ≥5 first buyers. At `T = L+201` with only those early buyers → **no event**.

### CASE C — repeats do not count

4 unique first buyers + 100 repeats from those wallets.

**Expected:** Rolling unique-first count stays 4 → **no event**.

### CASE D — clean fire

Qualifies at age 184s.

**Expected:** One `events` row; launch `fired`; drop from watch; later reconclusions noop.

### CASE E — crash after fire commit

Buyer #5 path commits fire; process dies before RAM clear.

**Expected:** Restart loads `fired`; unique blocks second insert; token not watched.

### CASE F — five-block replay of known buyers

Replay of blocks that already inserted first buyers.

**Expected:** `ON CONFLICT` → no duplicate buyers; rolling set unchanged; no erroneous second event.

### CASE G — qualification on final valid block

At the inclusive 60-minute boundary (`T = L+3600`), five unique first buyers all have timestamps in `[T-180, T]` and age ≥ 180.

**Expected:** Process activity → **fire**; do **not** expire.

### CASE H — never qualifies

Through full watch, rolling never reaches 5 (or window never holds 5).

**Expected:** Process all activity through boundary → **expire**; never fire later.

---

## 18. Intentionally deferred

- Live Alchemy / Robinhood RPC
- PONS V1/V2 log decode
- PonsBuy v0 validator port
- Fire Postgres RPC implementation
- Render deploy / process supervisor
- Continuous poll / health loops
- Frontend, PlayHTML, Realtime, presence heartbeats
- Stage 1 schema changes (none required)
- Multi-worker coordination (assume single worker MVP)
- Deep reorg handling beyond 5-block rewind

---

## 19. Constants reference (MVP)

| Name | Value |
| --- | --- |
| `CHAIN_ID` | `4663` |
| `EVENT_AGE_FLOOR_SECONDS` | `180` |
| `EVENT_WINDOW_SECONDS` | `180` |
| `EVENT_NEW_BUYERS_THRESHOLD` | `5` |
| `TOKEN_WATCH_TTL_SECONDS` | `3600` |
| `STARTUP_REWIND_BLOCKS` | `5` |
| `WORKER_NAME` | `4663-pons-worker` |
| Streams | `pons_factories`, `pons_transfers` |
| Event type | `pons_buying_activity` |
| Source | `pons` |

Pure TypeScript mirrors: `src/lib/pons/constants.ts`, `src/lib/pons/types.ts`.

---

## 20. Cursor exclusive start (resolution of Stage 1 ambiguity)

Stage 1 allowed either inclusive re-read or exclusive resume. **Stage 2 freezes:**

```text
Steady-state next from_block = last_processed_block + 1
Startup only:                = max(0, last_processed_block - 5)
```

Replay is deliberate solely via the five-block rewind, not by routinely reprocessing the last cursor block without rewind.
