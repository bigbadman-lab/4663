-- =============================================================================
-- PRODUCTION MANUAL OPERATION
-- Stage 8A.4 clean-slate reset.
-- Review before executing.
-- Deletes public/test product state while preserving worker/chain continuity.
--
-- DO NOT run automatically from CI, migrations, or the worker.
-- Execute only in the Supabase SQL Editor (or equivalent) after operator review.
--
-- Recommended ops sequence:
--   1) Run SECTION A (pre-reset counts + cursor snapshot) and save the results.
--   2) Optionally PAUSE the Render worker for a few minutes (reduces any
--      continuation re-fire race for launches still <300s old).
--   3) Run SECTION B (transactional deletes).
--   4) Run SECTION C (post-reset verification).
--   5) Resume worker if paused.
--
-- Out of band (NOT covered by this SQL — PlayHTML / Realtime, not Supabase):
--   - Ephemeral TEXT / DRAW page data
--   - Active SUMMON page data (4663-active-summon)
--   - Movable logo/hero/event PlayHTML positions
--   - Named participation Realtime Presence channel
--   Clear those via PlayHTML room / client reset if they still show after wipe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION A — Pre-reset verification (READ ONLY)
-- Run these first. Capture row counts and cursor values before deleting.
-- -----------------------------------------------------------------------------

-- A1. Row counts for every wipe candidate
select 'canvas_pins' as table_name, count(*)::bigint as rows from public.canvas_pins
union all
select 'canvas_marks', count(*)::bigint from public.canvas_marks
union all
select 'events', count(*)::bigint from public.events
union all
select 'presence', count(*)::bigint from public.presence
order by table_name;

-- A2. Event breakdown (surfaced public history)
select event_type, count(*)::bigint as rows
from public.events
group by event_type
order by event_type;

-- A3. Preserve snapshot — chain cursors (must be unchanged after wipe)
select stream_name, chain_id, last_processed_block, updated_at
from public.chain_cursors
where chain_id = 4663
order by stream_name;

-- A4. Preserve snapshot — production cutover + observation boundary
select
  chain_id,
  production_start_block,
  production_started_at,
  cutover_version,
  observation_start_block,
  observation_started_at,
  observation_version,
  observation_rollback_factories_cursor,
  observation_rollback_transfers_cursor,
  created_at
from public.production_state
where chain_id = 4663;

-- A5. Preserve snapshot — worker health
select
  worker_name,
  last_heartbeat_at,
  latest_chain_block,
  latest_processed_block,
  active_tokens,
  updated_at
from public.worker_health
order by worker_name;

-- A6. Preserve snapshot — PONS intelligence counts (must remain after wipe)
select 'pons_launches' as table_name, count(*)::bigint as rows from public.pons_launches
union all
select 'pons_launches_active', count(*)::bigint from public.pons_launches where status = 'active'
union all
select 'pons_launches_fired', count(*)::bigint from public.pons_launches where status = 'fired'
union all
select 'pons_launches_expired', count(*)::bigint from public.pons_launches where status = 'expired'
union all
select 'pons_first_buyers', count(*)::bigint from public.pons_first_buyers
order by table_name;

-- -----------------------------------------------------------------------------
-- SECTION B — Destructive wipe (MANUAL ONLY)
-- No FK constraints between these tables; order is logical dependency order.
-- Prefer DELETE over TRUNCATE (no identity/sequence reset required).
-- -----------------------------------------------------------------------------

begin;

-- public canvas state (durable social objects)
delete from public.canvas_pins;
delete from public.canvas_marks;

-- surfaced historical / test public events
-- Clears pons_buying_activity + pons_buyer_continuation product history.
-- Does NOT move chain_cursors or production_state.
-- Does NOT mutate pons_launches / pons_first_buyers.
--
-- Residual product note (acceptable for launch if worker paused / no young
-- tokens): fire_pons_buying_activity will NOT re-fire for status='fired'
-- launches. fire_pons_buyer_continuation MAY re-insert for a token whose
-- launch is still inside the <300s continuation watch window and no longer
-- has a continuation row. Historical / aged tokens will not reappear.
delete from public.events;

-- stale anonymous presence heartbeats (aggregates via public_presence_summary)
delete from public.presence;

commit;

-- -----------------------------------------------------------------------------
-- SECTION C — Post-reset verification (READ ONLY)
-- Confirm wipe tables empty; preserved continuity state intact.
-- Compare cursor/block values to SECTION A snapshots.
-- -----------------------------------------------------------------------------

-- C1. Wipe tables must be empty
select 'canvas_pins' as table_name, count(*)::bigint as rows from public.canvas_pins
union all
select 'canvas_marks', count(*)::bigint from public.canvas_marks
union all
select 'events', count(*)::bigint from public.events
union all
select 'presence', count(*)::bigint from public.presence
order by table_name;
-- expect all rows = 0

-- C2. Cursors unchanged vs SECTION A3
select stream_name, chain_id, last_processed_block, updated_at
from public.chain_cursors
where chain_id = 4663
order by stream_name;

-- C3. Cutover / observation marker unchanged vs SECTION A4
select
  chain_id,
  production_start_block,
  production_started_at,
  cutover_version,
  observation_start_block,
  observation_started_at,
  observation_version,
  observation_rollback_factories_cursor,
  observation_rollback_transfers_cursor
from public.production_state
where chain_id = 4663;
-- expect exactly one row; production_start_block / cutover_version unchanged

-- C4. Worker health still present (values may tick if worker is running)
select worker_name, last_heartbeat_at, latest_chain_block, latest_processed_block, active_tokens
from public.worker_health
order by worker_name;

-- C5. PONS intelligence counts unchanged vs SECTION A6
select 'pons_launches' as table_name, count(*)::bigint as rows from public.pons_launches
union all
select 'pons_launches_active', count(*)::bigint from public.pons_launches where status = 'active'
union all
select 'pons_launches_fired', count(*)::bigint from public.pons_launches where status = 'fired'
union all
select 'pons_launches_expired', count(*)::bigint from public.pons_launches where status = 'expired'
union all
select 'pons_first_buyers', count(*)::bigint from public.pons_first_buyers
order by table_name;

-- =============================================================================
-- NOT DELETED (preserved deliberately)
-- =============================================================================
--
-- public.chain_cursors
--   Reason: durable last_processed_block for pons_factories / pons_transfers.
--   Deleting would force historical chain replay / cursor bootstrap.
--
-- public.production_state
--   Reason: immutable production cutover marker (production_start_block B) and
--   forward-observation boundary columns. Required for worker boot, RLS, and
--   public event gating. Never delete/rewrite for a clean-slate UX reset.
--
-- public.worker_health
--   Reason: operational heartbeat only; harmless if left. Worker upserts on boot.
--
-- public.pons_launches
--   Reason: durable launch intelligence + lifecycle status (active/fired/expired).
--   Deleting would discard chain discovery state. status='fired' prevents burst
--   re-fire after events wipe (desired). Pre-boundary rows are already excluded
--   from production watch by launch_block filters.
--
-- public.pons_first_buyers
--   Reason: durable first-buyer idempotency / window reconstruction. Clearing
--   would risk duplicate buyer inserts on rewind and corrupt fire eligibility
--   math for still-watched tokens. Not user-visible canvas history.
--
-- public.public_presence_summary (VIEW)
--   Reason: not a table; aggregates presence. Empties naturally after presence wipe.
--
-- Schema / RPC / migrations / auth / realtime publication config
--   Reason: not product rows. Do not DROP TABLE / DROP SCHEMA / db reset.
--
-- =============================================================================
-- Optional follow-ups (NOT included in executable section — review separately)
-- =============================================================================
--
-- -- If you ever need to force-expire leftover ACTIVE launches that somehow
-- -- remain in watch (generally unnecessary after cutover filters):
-- -- UPDATE public.pons_launches SET status = 'expired', expired_at = now()
-- -- WHERE status = 'active' AND launch_block_number <= (
-- --   SELECT production_start_block FROM public.production_state WHERE chain_id = 4663
-- -- );
-- -- Reason left commented: can change lifecycle semantics; cutover already
-- -- excludes pre-B from production watch without mutating rows.
--
-- =============================================================================
