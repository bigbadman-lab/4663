-- =============================================================================
-- 4663 Stage 1 — Supabase foundation schema
-- Canonical system time: UTC (timestamptz)
-- Runnable via Supabase SQL Editor or `supabase db push` / migration runner
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Shared EVM address / tx hash predicates (normalised lowercase)
-- Addresses: 0x + 40 hex; tx hashes: 0x + 64 hex

-- -----------------------------------------------------------------------------
-- pons_launches — one durable row per discovered PONS launch
-- -----------------------------------------------------------------------------

CREATE TABLE public.pons_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 4663,
  factory_version text NOT NULL,
  factory_address text NOT NULL,
  token_address text NOT NULL,
  market_address text NOT NULL,
  launch_tx_hash text NOT NULL,
  launch_block_number bigint NOT NULL,
  launch_block_timestamp timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  event_fired_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pons_launches_factory_version_check
    CHECK (factory_version IN ('v1', 'v2')),
  CONSTRAINT pons_launches_status_check
    CHECK (status IN ('active', 'fired', 'expired')),
  CONSTRAINT pons_launches_factory_address_norm_check
    CHECK (factory_address = lower(factory_address) AND factory_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pons_launches_token_address_norm_check
    CHECK (token_address = lower(token_address) AND token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pons_launches_market_address_norm_check
    CHECK (market_address = lower(market_address) AND market_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pons_launches_launch_tx_hash_norm_check
    CHECK (launch_tx_hash = lower(launch_tx_hash) AND launch_tx_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT pons_launches_launch_block_number_check
    CHECK (launch_block_number >= 0),
  CONSTRAINT pons_launches_token_unique
    UNIQUE (chain_id, token_address),
  CONSTRAINT pons_launches_tx_unique
    UNIQUE (chain_id, launch_tx_hash)
);

CREATE INDEX pons_launches_active_idx
  ON public.pons_launches (chain_id, launch_block_timestamp DESC)
  WHERE status = 'active';

CREATE INDEX pons_launches_status_lifecycle_idx
  ON public.pons_launches (chain_id, status, launch_block_timestamp DESC);

CREATE INDEX pons_launches_token_lookup_idx
  ON public.pons_launches (chain_id, token_address);

CREATE TRIGGER pons_launches_set_updated_at
  BEFORE UPDATE ON public.pons_launches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pons_launches IS
  'Durable record of discovered PONS token launches on Robinhood Chain.';

-- -----------------------------------------------------------------------------
-- pons_first_buyers — one row per token + wallet first confirmed strict buyer
-- Core idempotency for first-time buyer detection (no transfer dump)
-- -----------------------------------------------------------------------------

CREATE TABLE public.pons_first_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 4663,
  token_address text NOT NULL,
  wallet_address text NOT NULL,
  first_buy_tx_hash text NOT NULL,
  first_buy_block_number bigint NOT NULL,
  first_buy_block_timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pons_first_buyers_token_address_norm_check
    CHECK (token_address = lower(token_address) AND token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pons_first_buyers_wallet_address_norm_check
    CHECK (wallet_address = lower(wallet_address) AND wallet_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pons_first_buyers_tx_hash_norm_check
    CHECK (first_buy_tx_hash = lower(first_buy_tx_hash) AND first_buy_tx_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT pons_first_buyers_block_number_check
    CHECK (first_buy_block_number >= 0),
  CONSTRAINT pons_first_buyers_unique
    UNIQUE (chain_id, token_address, wallet_address)
);

CREATE INDEX pons_first_buyers_tx_hash_idx
  ON public.pons_first_buyers (first_buy_tx_hash);

CREATE INDEX pons_first_buyers_window_idx
  ON public.pons_first_buyers (chain_id, token_address, first_buy_block_timestamp);

COMMENT ON TABLE public.pons_first_buyers IS
  'First confirmed strict buyers only. Used for idempotent buyer counting and 180s window reconstruction.';

-- -----------------------------------------------------------------------------
-- chain_cursors — restart-safe blockchain scan positions
-- Semantics: last safely persisted processed block for a named stream
-- -----------------------------------------------------------------------------

CREATE TABLE public.chain_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_name text NOT NULL,
  chain_id integer NOT NULL DEFAULT 4663,
  last_processed_block bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chain_cursors_stream_name_check
    CHECK (stream_name <> ''),
  CONSTRAINT chain_cursors_block_check
    CHECK (last_processed_block >= 0),
  CONSTRAINT chain_cursors_unique
    UNIQUE (stream_name, chain_id)
);

CREATE TRIGGER chain_cursors_set_updated_at
  BEFORE UPDATE ON public.chain_cursors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.chain_cursors IS
  'Durable cursors for worker streams (e.g. pons_factories, pons_transfers). last_processed_block is the last safely persisted processed block.';

-- -----------------------------------------------------------------------------
-- events — public product events (MVP: one pons_buying_activity per token)
-- -----------------------------------------------------------------------------

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  chain_id integer NOT NULL DEFAULT 4663,
  source text NOT NULL,
  token_address text NOT NULL,
  market_address text NOT NULL,
  occurred_at timestamptz NOT NULL,
  trigger_tx_hash text NOT NULL,
  trigger_block_number bigint NOT NULL,
  new_buyers integer NOT NULL,
  window_seconds integer NOT NULL,
  token_age_seconds integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_event_type_check
    CHECK (event_type IN ('pons_buying_activity')),
  CONSTRAINT events_source_check
    CHECK (source IN ('pons')),
  CONSTRAINT events_token_address_norm_check
    CHECK (token_address = lower(token_address) AND token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT events_market_address_norm_check
    CHECK (market_address = lower(market_address) AND market_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT events_trigger_tx_hash_norm_check
    CHECK (trigger_tx_hash = lower(trigger_tx_hash) AND trigger_tx_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT events_trigger_block_number_check
    CHECK (trigger_block_number >= 0),
  CONSTRAINT events_new_buyers_check
    CHECK (new_buyers > 0),
  CONSTRAINT events_window_seconds_check
    CHECK (window_seconds > 0),
  CONSTRAINT events_token_age_seconds_check
    CHECK (token_age_seconds >= 0),
  -- One MVP event per token (and per event_type for future types)
  CONSTRAINT events_token_event_unique
    UNIQUE (chain_id, event_type, token_address)
);

CREATE INDEX events_occurred_at_idx
  ON public.events (chain_id, occurred_at DESC);

CREATE INDEX events_token_lookup_idx
  ON public.events (chain_id, token_address);

COMMENT ON TABLE public.events IS
  'Public 4663 product events. Core facts live in first-class columns; payload is presentation-safe metadata only.';

-- -----------------------------------------------------------------------------
-- worker_health — simple operational heartbeat / progress
-- -----------------------------------------------------------------------------

CREATE TABLE public.worker_health (
  worker_name text PRIMARY KEY,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  latest_chain_block bigint,
  latest_processed_block bigint,
  active_tokens integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT worker_health_worker_name_check
    CHECK (worker_name <> ''),
  CONSTRAINT worker_health_active_tokens_check
    CHECK (active_tokens >= 0),
  CONSTRAINT worker_health_latest_chain_block_check
    CHECK (latest_chain_block IS NULL OR latest_chain_block >= 0),
  CONSTRAINT worker_health_latest_processed_block_check
    CHECK (latest_processed_block IS NULL OR latest_processed_block >= 0)
);

CREATE TRIGGER worker_health_set_updated_at
  BEFORE UPDATE ON public.worker_health
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.worker_health IS
  'Upsert-friendly Render worker heartbeat and progress. No job history.';

-- -----------------------------------------------------------------------------
-- presence — anonymous ephemeral visitor heartbeats (private)
-- No IP, no lat/lon, no accounts
-- -----------------------------------------------------------------------------

CREATE TABLE public.presence (
  session_id text PRIMARY KEY,
  city text,
  country_code text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT presence_session_id_check
    CHECK (session_id <> ''),
  CONSTRAINT presence_country_code_check
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

CREATE INDEX presence_last_seen_at_idx
  ON public.presence (last_seen_at DESC);

COMMENT ON TABLE public.presence IS
  'Anonymous live presence heartbeats. Private table; expose only aggregates via public_presence_summary.';

-- -----------------------------------------------------------------------------
-- public_presence_summary — coarse live aggregates only (no session_id)
-- Live window: last_seen_at within 120 seconds (future heartbeat period)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_presence_summary
WITH (security_invoker = false)
AS
SELECT
  (
    SELECT count(*)::integer
    FROM public.presence p
    WHERE p.last_seen_at > now() - interval '120 seconds'
  ) AS live_users,
  (
    SELECT coalesce(
      jsonb_object_agg(sub.country_code, sub.cnt),
      '{}'::jsonb
    )
    FROM (
      SELECT p.country_code, count(*)::integer AS cnt
      FROM public.presence p
      WHERE p.last_seen_at > now() - interval '120 seconds'
        AND p.country_code IS NOT NULL
      GROUP BY p.country_code
    ) sub
  ) AS by_country,
  (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'city', sub.city,
          'country_code', sub.country_code,
          'count', sub.cnt
        )
        ORDER BY sub.cnt DESC
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT p.city, p.country_code, count(*)::integer AS cnt
      FROM public.presence p
      WHERE p.last_seen_at > now() - interval '120 seconds'
        AND p.city IS NOT NULL
      GROUP BY p.city, p.country_code
    ) sub
  ) AS by_city;

COMMENT ON VIEW public.public_presence_summary IS
  'Coarse anonymous live-presence aggregates. Does not expose session_id or raw rows.';

-- -----------------------------------------------------------------------------
-- Row Level Security
-- MVP: no auth. Browser uses anon key. Worker writes use service role (bypasses RLS).
-- -----------------------------------------------------------------------------

ALTER TABLE public.pons_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pons_first_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

-- events: public read only
CREATE POLICY events_public_select
  ON public.events
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No other policies on internal tables → anon/authenticated cannot access rows.
-- service_role bypasses RLS for worker/internal writes.

-- Grants: public product read surfaces only
GRANT SELECT ON public.events TO anon, authenticated;
GRANT SELECT ON public.public_presence_summary TO anon, authenticated;

-- Explicitly deny direct table access from browser roles on private tables
REVOKE ALL ON public.pons_launches FROM anon, authenticated;
REVOKE ALL ON public.pons_first_buyers FROM anon, authenticated;
REVOKE ALL ON public.chain_cursors FROM anon, authenticated;
REVOKE ALL ON public.worker_health FROM anon, authenticated;
REVOKE ALL ON public.presence FROM anon, authenticated;

-- Ensure events writes stay server/service-role only from browser perspective
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.events FROM anon, authenticated;
