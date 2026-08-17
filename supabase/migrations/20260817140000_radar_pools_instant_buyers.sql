-- =============================================================================
-- 4663 — RADAR Phase 2: POOLS Instant first buyers + continuation fire
-- Additive. Does not rewrite pons_launches, pons_first_buyers, or PONS cursors.
--
-- Option B: parallel pools_first_buyers + POOLS-specific fire RPC writing the
-- same events schema with source='pools'. Public watchlist aggregates both sources.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Event uniqueness must include source (multi-launchpad)
-- Existing UNIQUE (chain_id, event_type, token_address) would collide if the
-- same token address qualifies on PONS and POOLS. Existing PONS event IDs are
-- unchanged; all current rows are source='pons'.
-- -----------------------------------------------------------------------------

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_token_event_unique;

ALTER TABLE public.events
  ADD CONSTRAINT events_token_event_source_unique
  UNIQUE (chain_id, event_type, source, token_address);

COMMENT ON CONSTRAINT events_token_event_source_unique ON public.events IS
  'One event per (chain, type, launchpad source, token). PONS and POOLS may both qualify the same token address.';

-- -----------------------------------------------------------------------------
-- 2) pools_first_buyers — Instant first buyers (tx.from after classified BUY)
-- -----------------------------------------------------------------------------

CREATE TABLE public.pools_first_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 4663,
  token_address text NOT NULL,
  wallet_address text NOT NULL,
  first_buy_tx_hash text NOT NULL,
  first_buy_block_number bigint NOT NULL,
  first_buy_block_timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pools_first_buyers_token_address_norm_check
    CHECK (token_address = lower(token_address) AND token_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pools_first_buyers_wallet_address_norm_check
    CHECK (wallet_address = lower(wallet_address) AND wallet_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT pools_first_buyers_tx_hash_norm_check
    CHECK (first_buy_tx_hash = lower(first_buy_tx_hash) AND first_buy_tx_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT pools_first_buyers_block_number_check
    CHECK (first_buy_block_number >= 0),
  CONSTRAINT pools_first_buyers_unique
    UNIQUE (chain_id, token_address, wallet_address)
);

CREATE INDEX pools_first_buyers_tx_hash_idx
  ON public.pools_first_buyers (first_buy_tx_hash);

CREATE INDEX pools_first_buyers_window_idx
  ON public.pools_first_buyers (chain_id, token_address, first_buy_block_timestamp);

COMMENT ON TABLE public.pools_first_buyers IS
  'First confirmed POOLS Instant buyers (transaction from after a classified BUY). Parallel to pons_first_buyers; first occurrence only.';

ALTER TABLE public.pools_first_buyers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pools_first_buyers FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) fire_pons_buyer_continuation — lookup by source='pons'
-- Unique constraint now includes source. Without this filter, a POOLS
-- continuation for the same token would make PONS report already_fired.
-- Observation 1B behaviour is otherwise unchanged.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fire_pons_buyer_continuation(
  p_chain_id integer,
  p_token_address text,
  p_evaluation_timestamp timestamptz,
  p_evaluation_block_number bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := lower(p_token_address);
  v_launch public.pons_launches%ROWTYPE;
  v_existing_event_id uuid;
  v_pre integer := 0;
  v_cont integer := 0;
  v_second public.pons_first_buyers%ROWTYPE;
  v_event_id uuid;
  v_buyer_age integer;
BEGIN
  IF p_chain_id IS NULL OR p_evaluation_timestamp IS NULL OR p_evaluation_block_number IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_args'
    );
  END IF;

  SELECT *
  INTO v_launch
  FROM public.pons_launches
  WHERE chain_id = p_chain_id
    AND token_address = v_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_launch.status = 'expired' THEN
    RETURN jsonb_build_object('status', 'already_expired');
  END IF;

  IF v_launch.status NOT IN ('active', 'fired') THEN
    RETURN jsonb_build_object(
      'status', 'not_active',
      'status_value', v_launch.status
    );
  END IF;

  SELECT id INTO v_existing_event_id
  FROM public.events
  WHERE chain_id = p_chain_id
    AND event_type = 'pons_buyer_continuation'
    AND source = 'pons'
    AND token_address = v_token
  LIMIT 1;

  IF v_existing_event_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_fired',
      'event_id', v_existing_event_id
    );
  END IF;

  IF public.launch_before_observation_boundary(p_chain_id, v_launch.launch_block_number) THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'before_observation_boundary',
      'launch_block_number', v_launch.launch_block_number
    );
  END IF;

  SELECT
    COUNT(*) FILTER (
      WHERE FLOOR(
        EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
      )::integer < 180
    )::integer,
    COUNT(*) FILTER (
      WHERE FLOOR(
        EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
      )::integer >= 180
      AND FLOOR(
        EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
      )::integer < 300
    )::integer
  INTO v_pre, v_cont
  FROM public.pons_first_buyers fb
  WHERE fb.chain_id = p_chain_id
    AND fb.token_address = v_token;

  IF v_pre < 1 OR v_cont < 2 THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'below_threshold',
      'pre_3m_buyers', v_pre,
      'continuation_buyers', v_cont,
      'new_buyers', v_cont
    );
  END IF;

  SELECT fb.*
  INTO v_second
  FROM public.pons_first_buyers fb
  WHERE fb.chain_id = p_chain_id
    AND fb.token_address = v_token
    AND FLOOR(
      EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
    )::integer >= 180
    AND FLOOR(
      EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
    )::integer < 300
  ORDER BY fb.first_buy_block_timestamp ASC, fb.first_buy_tx_hash ASC
  OFFSET 1
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'missing_second_continuation_buyer',
      'pre_3m_buyers', v_pre,
      'continuation_buyers', v_cont
    );
  END IF;

  v_buyer_age := FLOOR(
    EXTRACT(EPOCH FROM (v_second.first_buy_block_timestamp - v_launch.launch_block_timestamp))
  )::integer;

  INSERT INTO public.events (
    event_type,
    chain_id,
    source,
    token_address,
    market_address,
    occurred_at,
    trigger_tx_hash,
    trigger_block_number,
    new_buyers,
    window_seconds,
    token_age_seconds,
    payload
  ) VALUES (
    'pons_buyer_continuation',
    p_chain_id,
    'pons',
    v_token,
    v_launch.market_address,
    v_second.first_buy_block_timestamp,
    v_second.first_buy_tx_hash,
    v_second.first_buy_block_number,
    v_cont,
    120,
    v_buyer_age,
    jsonb_build_object(
      'factory_version', v_launch.factory_version,
      'launch_block_number', v_launch.launch_block_number,
      'pre_3m_buyers', v_pre,
      'continuation_buyers', v_cont
    )
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'status', 'fired',
    'event_id', v_event_id,
    'new_buyers', v_cont,
    'pre_3m_buyers', v_pre,
    'continuation_buyers', v_cont,
    'token_age_seconds', v_buyer_age,
    'trigger_tx_hash', v_second.first_buy_tx_hash,
    'trigger_block_number', v_second.first_buy_block_number
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_event_id
    FROM public.events
    WHERE chain_id = p_chain_id
      AND event_type = 'pons_buyer_continuation'
      AND source = 'pons'
      AND token_address = v_token
    LIMIT 1;

    RETURN jsonb_build_object(
      'status', 'already_fired',
      'event_id', v_existing_event_id
    );
END;
$$;

COMMENT ON FUNCTION public.fire_pons_buyer_continuation(integer, text, timestamptz, bigint) IS
  'PONS CONTINUATION: pre_3m>=1 AND continuation[180,300)>=2. Dedupes on source=pons. Observation 1B refuses launch_block < observation_start_block when X is set.';

REVOKE ALL ON FUNCTION public.fire_pons_buyer_continuation(integer, text, timestamptz, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fire_pons_buyer_continuation(integer, text, timestamptz, bigint) TO service_role;

-- -----------------------------------------------------------------------------
-- 4) fire_pools_buyer_continuation
-- Same Candidate B thresholds as PONS. Looks up pools_instant_launches and
-- pools_first_buyers. Does not insert pons_launches. market_address stores the
-- Instant strategy (events.market_address is NOT NULL); payload carries pool_id.
-- Burst/lifecycle status is not required for Candidate B.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fire_pools_buyer_continuation(
  p_chain_id integer,
  p_token_address text,
  p_evaluation_timestamp timestamptz,
  p_evaluation_block_number bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := lower(p_token_address);
  v_launch public.pools_instant_launches%ROWTYPE;
  v_existing_event_id uuid;
  v_pre integer := 0;
  v_cont integer := 0;
  v_second public.pools_first_buyers%ROWTYPE;
  v_event_id uuid;
  v_buyer_age integer;
BEGIN
  IF p_chain_id IS NULL OR p_evaluation_timestamp IS NULL OR p_evaluation_block_number IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_args'
    );
  END IF;

  SELECT *
  INTO v_launch
  FROM public.pools_instant_launches
  WHERE chain_id = p_chain_id
    AND token_address = v_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT id INTO v_existing_event_id
  FROM public.events
  WHERE chain_id = p_chain_id
    AND event_type = 'pons_buyer_continuation'
    AND source = 'pools'
    AND token_address = v_token
  LIMIT 1;

  IF v_existing_event_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_fired',
      'event_id', v_existing_event_id
    );
  END IF;

  IF public.launch_before_observation_boundary(p_chain_id, v_launch.launch_block_number) THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'before_observation_boundary',
      'launch_block_number', v_launch.launch_block_number
    );
  END IF;

  SELECT
    COUNT(*) FILTER (
      WHERE FLOOR(
        EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
      )::integer < 180
    )::integer,
    COUNT(*) FILTER (
      WHERE FLOOR(
        EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
      )::integer >= 180
      AND FLOOR(
        EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
      )::integer < 300
    )::integer
  INTO v_pre, v_cont
  FROM public.pools_first_buyers fb
  WHERE fb.chain_id = p_chain_id
    AND fb.token_address = v_token;

  IF v_pre < 1 OR v_cont < 2 THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'below_threshold',
      'pre_3m_buyers', v_pre,
      'continuation_buyers', v_cont,
      'new_buyers', v_cont
    );
  END IF;

  SELECT fb.*
  INTO v_second
  FROM public.pools_first_buyers fb
  WHERE fb.chain_id = p_chain_id
    AND fb.token_address = v_token
    AND FLOOR(
      EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
    )::integer >= 180
    AND FLOOR(
      EXTRACT(EPOCH FROM (fb.first_buy_block_timestamp - v_launch.launch_block_timestamp))
    )::integer < 300
  ORDER BY fb.first_buy_block_timestamp ASC, fb.first_buy_tx_hash ASC
  OFFSET 1
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'missing_second_continuation_buyer',
      'pre_3m_buyers', v_pre,
      'continuation_buyers', v_cont
    );
  END IF;

  v_buyer_age := FLOOR(
    EXTRACT(EPOCH FROM (v_second.first_buy_block_timestamp - v_launch.launch_block_timestamp))
  )::integer;

  INSERT INTO public.events (
    event_type,
    chain_id,
    source,
    token_address,
    market_address,
    occurred_at,
    trigger_tx_hash,
    trigger_block_number,
    new_buyers,
    window_seconds,
    token_age_seconds,
    payload
  ) VALUES (
    'pons_buyer_continuation',
    p_chain_id,
    'pools',
    v_token,
    v_launch.source_contract,
    v_second.first_buy_block_timestamp,
    v_second.first_buy_tx_hash,
    v_second.first_buy_block_number,
    v_cont,
    120,
    v_buyer_age,
    jsonb_build_object(
      'launchpad', 'pools',
      'pool_id', v_launch.pool_id,
      'launch_block_number', v_launch.launch_block_number,
      'pre_3m_buyers', v_pre,
      'continuation_buyers', v_cont
    )
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'status', 'fired',
    'event_id', v_event_id,
    'new_buyers', v_cont,
    'pre_3m_buyers', v_pre,
    'continuation_buyers', v_cont,
    'token_age_seconds', v_buyer_age,
    'trigger_tx_hash', v_second.first_buy_tx_hash,
    'trigger_block_number', v_second.first_buy_block_number
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_event_id
    FROM public.events
    WHERE chain_id = p_chain_id
      AND event_type = 'pons_buyer_continuation'
      AND source = 'pools'
      AND token_address = v_token
    LIMIT 1;

    RETURN jsonb_build_object(
      'status', 'already_fired',
      'event_id', v_existing_event_id
    );
END;
$$;

COMMENT ON FUNCTION public.fire_pools_buyer_continuation(integer, text, timestamptz, bigint) IS
  'POOLS Instant CONTINUATION: same Candidate B as PONS from pools_first_buyers. Writes source=pools. Does not alter pons_launches.';

REVOKE ALL ON FUNCTION public.fire_pools_buyer_continuation(integer, text, timestamptz, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fire_pools_buyer_continuation(integer, text, timestamptz, bigint) TO service_role;
