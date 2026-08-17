-- =============================================================================
-- 4663 — RADAR multi-launchpad foundation (Phase 1)
-- Additive. Does not rewrite pons_launches, fire RPCs, or PONS cursors.
--
-- Option B: keep pons_launches intact; persist POOLS Instant in a parallel
-- table; widen events.source so future RADAR qualifications can be pools
-- without faking PONS v1/v2 rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) events.source — allow future POOLS qualifications
-- Existing rows remain source='pons'. Public RLS still production-gated.
-- Application watchlist (Phase 3) aggregates source IN ('pons','pools').
-- Phase 1 writers still emit pons only; Phase 2 adds pools continuation.
-- -----------------------------------------------------------------------------

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_source_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_source_check
  CHECK (source IN ('pons', 'pools'));

COMMENT ON CONSTRAINT events_source_check ON public.events IS
  'Launchpad identity for product events. Phase 1 still emits pons only.';

DROP POLICY IF EXISTS events_public_select ON public.events;

CREATE POLICY events_public_select
  ON public.events
  FOR SELECT
  TO anon, authenticated
  USING (
    chain_id = 4663
    AND event_type IN ('pons_buying_activity', 'pons_buyer_continuation')
    AND source IN ('pons', 'pools')
    AND public.safe_event_launch_block(payload)
      > public.production_start_block_for(chain_id)
  );

COMMENT ON POLICY events_public_select ON public.events IS
  'Anon/authenticated may read production buying_activity and continuation rows for source pons or pools. Phase 1 writers still emit source=pons only.';

REVOKE ALL PRIVILEGES ON TABLE public.events FROM anon, authenticated;
GRANT SELECT ON TABLE public.events TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) pools_instant_launches — InstantLaunchStrategy v3.2.0 only
-- -----------------------------------------------------------------------------

CREATE TABLE public.pools_instant_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 4663,
  launchpad text NOT NULL DEFAULT 'pools',
  token_address text NOT NULL,
  launch_tx_hash text NOT NULL,
  launch_block_number bigint NOT NULL,
  launch_block_timestamp timestamptz NOT NULL,
  source_contract text NOT NULL,
  source_version text NOT NULL DEFAULT 'instant-v3.2.0',
  pool_id text NOT NULL,
  final_position_recipient text NOT NULL,
  currency0 text NOT NULL,
  currency1 text NOT NULL,
  fee integer NOT NULL,
  tick_spacing integer NOT NULL,
  hooks_address text NOT NULL,
  launched_token_currency_index smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pools_instant_launches_launchpad_check
    CHECK (launchpad = 'pools'),
  CONSTRAINT pools_instant_launches_source_version_check
    CHECK (source_version = 'instant-v3.2.0'),
  CONSTRAINT pools_instant_launches_source_contract_check
    CHECK (source_contract = '0x23f8209572b4a1c2ad88a42749e830791fb027f1'),
  CONSTRAINT pools_instant_launches_token_address_norm_check
    CHECK (token_address = lower(token_address) AND token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pools_instant_launches_launch_tx_hash_norm_check
    CHECK (launch_tx_hash = lower(launch_tx_hash) AND launch_tx_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT pools_instant_launches_source_contract_norm_check
    CHECK (source_contract = lower(source_contract) AND source_contract ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pools_instant_launches_pool_id_norm_check
    CHECK (pool_id = lower(pool_id) AND pool_id ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT pools_instant_launches_final_position_recipient_norm_check
    CHECK (
      final_position_recipient = lower(final_position_recipient)
      AND final_position_recipient ~ '^0x[0-9a-f]{40}$'
    ),
  CONSTRAINT pools_instant_launches_currency0_norm_check
    CHECK (currency0 = lower(currency0) AND currency0 ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pools_instant_launches_currency1_norm_check
    CHECK (currency1 = lower(currency1) AND currency1 ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pools_instant_launches_hooks_address_norm_check
    CHECK (hooks_address = lower(hooks_address) AND hooks_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pools_instant_launches_launch_block_number_check
    CHECK (launch_block_number >= 0),
  CONSTRAINT pools_instant_launches_fee_check
    CHECK (fee >= 0 AND fee <= 16777215),
  CONSTRAINT pools_instant_launches_currency_index_check
    CHECK (launched_token_currency_index IN (0, 1)),
  CONSTRAINT pools_instant_launches_token_matches_currency_check
    CHECK (
      (launched_token_currency_index = 0 AND token_address = currency0)
      OR (launched_token_currency_index = 1 AND token_address = currency1)
    ),
  CONSTRAINT pools_instant_launches_token_unique
    UNIQUE (chain_id, token_address),
  CONSTRAINT pools_instant_launches_tx_unique
    UNIQUE (chain_id, launch_tx_hash),
  CONSTRAINT pools_instant_launches_pool_unique
    UNIQUE (chain_id, pool_id)
);

CREATE INDEX pools_instant_launches_token_lookup_idx
  ON public.pools_instant_launches (chain_id, token_address);

CREATE INDEX pools_instant_launches_pool_lookup_idx
  ON public.pools_instant_launches (chain_id, pool_id);

CREATE INDEX pools_instant_launches_block_idx
  ON public.pools_instant_launches (chain_id, launch_block_number DESC);

CREATE TRIGGER pools_instant_launches_set_updated_at
  BEFORE UPDATE ON public.pools_instant_launches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pools_instant_launches IS
  'Discovered POOLS InstantLaunchStrategy v3.2.0 launches. Parallel to pons_launches; not a PONS factory/market row.';

COMMENT ON COLUMN public.pools_instant_launches.pool_id IS
  'Uniswap v4 PoolId (bytes32 hex). Buy classification is relative to launched_token_currency_index, not a hardcoded amount0 sign.';

COMMENT ON COLUMN public.pools_instant_launches.launched_token_currency_index IS
  '0 if launched token is currency0, 1 if currency1. Instant v3.2.0 specimens are native ETH / token so index=1.';

ALTER TABLE public.pools_instant_launches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pools_instant_launches FROM anon, authenticated;
