-- =============================================================================
-- Stage 11B — pons_buyer_continuation event type + fire RPC
-- Forward-only. No historical backfill.
--
-- PUBLIC RLS: intentionally UNCHANGED in this migration.
-- Stage 9 clients still read pons_buying_activity only. Switching public policy
-- to pons_buyer_continuation alone is deferred to Stage 11C (canvas cutover)
-- to avoid breaking the live frontend mid-rollout.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Widen events.event_type CHECK
-- -----------------------------------------------------------------------------

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_event_type_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('pons_buying_activity', 'pons_buyer_continuation'));

COMMENT ON CONSTRAINT events_event_type_check ON public.events IS
  'Allowed product event types. UNIQUE(chain_id, event_type, token_address) permits one burst and one continuation per token.';

-- -----------------------------------------------------------------------------
-- 2) fire_pons_buyer_continuation
-- Candidate B (strict first buyers, integer chain ages):
--   pre: age < 180
--   continuation: 180 <= age < 300
-- Fire when pre >= 1 AND continuation >= 2.
-- occurred_at / trigger = second continuation first-buy (by age, then tx hash).
-- Accepts launch status active OR fired. Idempotent.
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

  -- Count strict first buyers by integer age buckets (no wallet leakage).
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

  -- Second continuation first-buy (age order, then tx hash for stability).
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
  'Stage 11B Candidate B: pre_3m>=1 AND continuation[180,300)>=2 from strict pons_first_buyers. Does not alter launch status.';

REVOKE ALL ON FUNCTION public.fire_pons_buyer_continuation(integer, text, timestamptz, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fire_pons_buyer_continuation(integer, text, timestamptz, bigint) TO service_role;
