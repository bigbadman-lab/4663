-- =============================================================================
-- Observation 1B — fire RPC defense-in-depth for observation_start_block
--
-- Does NOT activate observation.
-- Does NOT move cursors.
-- When observation_start_block IS NULL, fire behaviour is unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.launch_before_observation_boundary(
  p_chain_id integer,
  p_launch_block_number bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.production_state ps
    WHERE ps.chain_id = p_chain_id
      AND ps.observation_start_block IS NOT NULL
      AND p_launch_block_number < ps.observation_start_block
  );
$$;

COMMENT ON FUNCTION public.launch_before_observation_boundary(integer, bigint) IS
  'True when forward observation is active and launch_block < observation_start_block. NULL observation → false.';

REVOKE ALL ON FUNCTION public.launch_before_observation_boundary(integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.launch_before_observation_boundary(integer, bigint) TO service_role;

-- -----------------------------------------------------------------------------
-- fire_pons_buying_activity — identical to Stage 6 + observation boundary guard
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fire_pons_buying_activity(
  p_chain_id integer,
  p_token_address text,
  p_evaluation_timestamp timestamptz,
  p_evaluation_block_number bigint,
  p_window_seconds integer DEFAULT 180,
  p_age_floor_seconds integer DEFAULT 180,
  p_watch_ttl_seconds integer DEFAULT 3600,
  p_threshold integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := lower(p_token_address);
  v_launch public.pons_launches%ROWTYPE;
  v_window_start timestamptz;
  v_count integer;
  v_token_age_seconds integer;
  v_latest_buyer public.pons_first_buyers%ROWTYPE;
  v_trigger_tx text;
  v_event_id uuid;
  v_existing_event_id uuid;
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

  IF v_launch.status = 'fired' THEN
    SELECT id INTO v_existing_event_id
    FROM public.events
    WHERE chain_id = p_chain_id
      AND event_type = 'pons_buying_activity'
      AND token_address = v_token
    LIMIT 1;

    RETURN jsonb_build_object(
      'status', 'already_fired',
      'event_id', v_existing_event_id
    );
  END IF;

  IF v_launch.status = 'expired' THEN
    RETURN jsonb_build_object('status', 'already_expired');
  END IF;

  IF v_launch.status <> 'active' THEN
    RETURN jsonb_build_object('status', 'not_active', 'status_value', v_launch.status);
  END IF;

  -- Observation 1B: refuse new burst fires for pre-observation launches when X is set.
  IF public.launch_before_observation_boundary(p_chain_id, v_launch.launch_block_number) THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'before_observation_boundary',
      'launch_block_number', v_launch.launch_block_number
    );
  END IF;

  SELECT id INTO v_existing_event_id
  FROM public.events
  WHERE chain_id = p_chain_id
    AND event_type = 'pons_buying_activity'
    AND token_address = v_token
  LIMIT 1;

  IF v_existing_event_id IS NOT NULL THEN
    UPDATE public.pons_launches
    SET status = 'fired',
        event_fired_at = COALESCE(event_fired_at, p_evaluation_timestamp)
    WHERE id = v_launch.id
      AND status = 'active';

    RETURN jsonb_build_object(
      'status', 'already_fired',
      'event_id', v_existing_event_id
    );
  END IF;

  v_token_age_seconds := FLOOR(
    EXTRACT(EPOCH FROM (p_evaluation_timestamp - v_launch.launch_block_timestamp))
  )::integer;

  IF v_token_age_seconds < p_age_floor_seconds THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'age_floor',
      'token_age_seconds', v_token_age_seconds,
      'new_buyers', 0
    );
  END IF;

  IF v_token_age_seconds > p_watch_ttl_seconds THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'past_watch_ttl',
      'token_age_seconds', v_token_age_seconds,
      'new_buyers', 0
    );
  END IF;

  v_window_start := p_evaluation_timestamp - make_interval(secs => p_window_seconds);

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.pons_first_buyers fb
  WHERE fb.chain_id = p_chain_id
    AND fb.token_address = v_token
    AND fb.first_buy_block_timestamp >= v_window_start
    AND fb.first_buy_block_timestamp <= p_evaluation_timestamp;

  IF v_count < p_threshold THEN
    RETURN jsonb_build_object(
      'status', 'not_eligible',
      'reason', 'below_threshold',
      'token_age_seconds', v_token_age_seconds,
      'new_buyers', v_count
    );
  END IF;

  SELECT *
  INTO v_latest_buyer
  FROM public.pons_first_buyers fb
  WHERE fb.chain_id = p_chain_id
    AND fb.token_address = v_token
    AND fb.first_buy_block_timestamp >= v_window_start
    AND fb.first_buy_block_timestamp <= p_evaluation_timestamp
  ORDER BY fb.first_buy_block_timestamp DESC, fb.first_buy_tx_hash ASC
  LIMIT 1;

  IF v_latest_buyer.first_buy_block_number = p_evaluation_block_number THEN
    v_trigger_tx := v_latest_buyer.first_buy_tx_hash;
  ELSE
    v_trigger_tx := NULL;
  END IF;

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
    'pons_buying_activity',
    p_chain_id,
    'pons',
    v_token,
    v_launch.market_address,
    p_evaluation_timestamp,
    v_trigger_tx,
    p_evaluation_block_number,
    v_count,
    p_window_seconds,
    v_token_age_seconds,
    jsonb_build_object(
      'factory_version', v_launch.factory_version,
      'launch_block_number', v_launch.launch_block_number
    )
  )
  RETURNING id INTO v_event_id;

  UPDATE public.pons_launches
  SET status = 'fired',
      event_fired_at = p_evaluation_timestamp
  WHERE id = v_launch.id
    AND status = 'active';

  RETURN jsonb_build_object(
    'status', 'fired',
    'event_id', v_event_id,
    'new_buyers', v_count,
    'token_age_seconds', v_token_age_seconds,
    'trigger_tx_hash', v_trigger_tx
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_event_id
    FROM public.events
    WHERE chain_id = p_chain_id
      AND event_type = 'pons_buying_activity'
      AND token_address = v_token
    LIMIT 1;

    UPDATE public.pons_launches
    SET status = 'fired',
        event_fired_at = COALESCE(event_fired_at, p_evaluation_timestamp)
    WHERE id = v_launch.id
      AND status = 'active';

    RETURN jsonb_build_object(
      'status', 'already_fired',
      'event_id', v_existing_event_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fire_pons_buying_activity(
  integer, text, timestamptz, bigint, integer, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fire_pons_buying_activity(
  integer, text, timestamptz, bigint, integer, integer, integer, integer
) TO service_role;

-- -----------------------------------------------------------------------------
-- fire_pons_buyer_continuation — identical to Stage 11B + observation guard
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
    AND token_address = v_token
  LIMIT 1;

  IF v_existing_event_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_fired',
      'event_id', v_existing_event_id
    );
  END IF;

  -- Observation 1B: refuse new CONTINUATION fires for pre-observation launches when X is set.
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
      AND token_address = v_token
    LIMIT 1;

    RETURN jsonb_build_object(
      'status', 'already_fired',
      'event_id', v_existing_event_id
    );
END;
$$;

COMMENT ON FUNCTION public.fire_pons_buyer_continuation(integer, text, timestamptz, bigint) IS
  'PONS CONTINUATION: pre_3m>=1 AND continuation[180,300)>=2. Observation 1B refuses launch_block < observation_start_block when X is set.';

REVOKE ALL ON FUNCTION public.fire_pons_buyer_continuation(integer, text, timestamptz, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fire_pons_buyer_continuation(integer, text, timestamptz, bigint) TO service_role;
