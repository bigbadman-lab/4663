-- =============================================================================
-- 4663 Stage 6 — atomic event fire + expiry + trigger_tx_hash nullability
-- Manual apply via Supabase SQL Editor if not using CLI.
-- =============================================================================

-- Allow age-floor fires with no single triggering buy transaction
ALTER TABLE public.events
  ALTER COLUMN trigger_tx_hash DROP NOT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_trigger_tx_hash_norm_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_trigger_tx_hash_norm_check
  CHECK (
    trigger_tx_hash IS NULL
    OR (
      trigger_tx_hash = lower(trigger_tx_hash)
      AND trigger_tx_hash ~ '^0x[0-9a-f]{64}$'
    )
  );

COMMENT ON COLUMN public.events.trigger_tx_hash IS
  'Nullable. Set only when a real first-buy tx establishes fireability at the evaluation block; NULL for pure age-floor firings.';

-- -----------------------------------------------------------------------------
-- Atomic fire: durable recompute + insert event + mark fired
-- evaluation timestamps are chain authority (caller supplies; not DB now()).
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

  -- Unique event layer (race / prior insert without status flip)
  SELECT id INTO v_existing_event_id
  FROM public.events
  WHERE chain_id = p_chain_id
    AND event_type = 'pons_buying_activity'
    AND token_address = v_token
  LIMIT 1;

  IF v_existing_event_id IS NOT NULL THEN
    -- Heal launch state if event already exists
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

  -- Trigger tx only if latest in-window first buy is at the evaluation block
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
-- Conditional expiry: never overwrites fired; refuses if event exists
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_pons_launch(
  p_chain_id integer,
  p_token_address text,
  p_evaluation_timestamp timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := lower(p_token_address);
  v_launch public.pons_launches%ROWTYPE;
  v_event_exists boolean;
BEGIN
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
    RETURN jsonb_build_object('status', 'already_fired');
  END IF;

  IF v_launch.status = 'expired' THEN
    RETURN jsonb_build_object('status', 'already_expired');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.chain_id = p_chain_id
      AND e.event_type = 'pons_buying_activity'
      AND e.token_address = v_token
  ) INTO v_event_exists;

  IF v_event_exists THEN
    -- Heal to fired rather than expire away an event
    UPDATE public.pons_launches
    SET status = 'fired',
        event_fired_at = COALESCE(event_fired_at, p_evaluation_timestamp)
    WHERE id = v_launch.id
      AND status = 'active';
    RETURN jsonb_build_object('status', 'already_fired');
  END IF;

  IF v_launch.status <> 'active' THEN
    RETURN jsonb_build_object('status', 'not_active');
  END IF;

  UPDATE public.pons_launches
  SET status = 'expired',
      expired_at = p_evaluation_timestamp
  WHERE id = v_launch.id
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_active');
  END IF;

  RETURN jsonb_build_object('status', 'expired');
END;
$$;

REVOKE ALL ON FUNCTION public.expire_pons_launch(integer, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_pons_launch(integer, text, timestamptz) TO service_role;
