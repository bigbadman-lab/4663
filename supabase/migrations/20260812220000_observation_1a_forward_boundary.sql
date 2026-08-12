-- =============================================================================
-- Observation 1A — durable forward-observation boundary + atomic activate/rollback
--
-- Does NOT activate observation.
-- Does NOT move cursors.
-- Does NOT change production_start_block or worker eligibility.
-- Activation happens later only via activate_forward_observation RPC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Extend production_state (nullable until explicit activation)
-- -----------------------------------------------------------------------------

ALTER TABLE public.production_state
  ADD COLUMN IF NOT EXISTS observation_start_block bigint NULL,
  ADD COLUMN IF NOT EXISTS observation_started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS observation_version text NULL,
  ADD COLUMN IF NOT EXISTS observation_rollback_factories_cursor bigint NULL,
  ADD COLUMN IF NOT EXISTS observation_rollback_transfers_cursor bigint NULL;

COMMENT ON COLUMN public.production_state.observation_start_block IS
  'First block X of the authoritative forward-observation world. NULL = not activated. Cursors align to X-1 on activation.';

COMMENT ON COLUMN public.production_state.observation_started_at IS
  'Wall time when forward observation was activated (metadata only).';

COMMENT ON COLUMN public.production_state.observation_version IS
  'Forward-observation activation version (e.g. forward-obs-v1).';

COMMENT ON COLUMN public.production_state.observation_rollback_factories_cursor IS
  'Snapshot of pons_factories.last_processed_block immediately before activation (emergency rollback).';

COMMENT ON COLUMN public.production_state.observation_rollback_transfers_cursor IS
  'Snapshot of pons_transfers.last_processed_block immediately before activation (emergency rollback).';

-- When observation is set, require X > production_start_block and companion fields.
ALTER TABLE public.production_state
  DROP CONSTRAINT IF EXISTS production_state_observation_after_production_check;

ALTER TABLE public.production_state
  ADD CONSTRAINT production_state_observation_after_production_check
  CHECK (
    observation_start_block IS NULL
    OR (
      observation_start_block > production_start_block
      AND observation_start_block >= 1
      AND observation_started_at IS NOT NULL
      AND observation_version IS NOT NULL
      AND observation_version <> ''
      AND observation_rollback_factories_cursor IS NOT NULL
      AND observation_rollback_factories_cursor >= 0
      AND observation_rollback_transfers_cursor IS NOT NULL
      AND observation_rollback_transfers_cursor >= 0
    )
  );

ALTER TABLE public.production_state
  DROP CONSTRAINT IF EXISTS production_state_observation_version_check;

ALTER TABLE public.production_state
  ADD CONSTRAINT production_state_observation_version_check
  CHECK (
    observation_version IS NULL
    OR observation_version = 'forward-obs-v1'
  );

-- -----------------------------------------------------------------------------
-- 2) activate_forward_observation — one-time atomic boundary + cursor align
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activate_forward_observation(
  p_chain_id integer,
  p_observation_start_block bigint,
  p_observation_version text DEFAULT 'forward-obs-v1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.production_state%ROWTYPE;
  v_fac bigint;
  v_xfer bigint;
  v_target bigint;
  v_version text := coalesce(nullif(trim(p_observation_version), ''), 'forward-obs-v1');
BEGIN
  IF p_chain_id IS NULL OR p_chain_id <> 4663 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_chain_id'
    );
  END IF;

  IF p_observation_start_block IS NULL OR p_observation_start_block < 1 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_boundary'
    );
  END IF;

  IF v_version <> 'forward-obs-v1' THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_observation_version'
    );
  END IF;

  -- Serialize activate/rollback (distinct from cutover lock key 7001)
  PERFORM pg_advisory_xact_lock(4663, 7002);

  SELECT *
  INTO v_state
  FROM public.production_state
  WHERE chain_id = p_chain_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'missing_production_cutover'
    );
  END IF;

  IF v_state.observation_start_block IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_activated',
      'chain_id', v_state.chain_id,
      'production_start_block', v_state.production_start_block,
      'observation_start_block', v_state.observation_start_block,
      'observation_started_at', v_state.observation_started_at,
      'observation_version', v_state.observation_version,
      'cursors', jsonb_build_object(
        'pons_factories', (
          SELECT last_processed_block
          FROM public.chain_cursors
          WHERE stream_name = 'pons_factories' AND chain_id = p_chain_id
        ),
        'pons_transfers', (
          SELECT last_processed_block
          FROM public.chain_cursors
          WHERE stream_name = 'pons_transfers' AND chain_id = p_chain_id
        )
      ),
      'rollback_cursors', jsonb_build_object(
        'pons_factories', v_state.observation_rollback_factories_cursor,
        'pons_transfers', v_state.observation_rollback_transfers_cursor
      )
    );
  END IF;

  IF p_observation_start_block <= v_state.production_start_block THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_boundary',
      'production_start_block', v_state.production_start_block,
      'observation_start_block', p_observation_start_block
    );
  END IF;

  SELECT last_processed_block
  INTO v_fac
  FROM public.chain_cursors
  WHERE stream_name = 'pons_factories' AND chain_id = p_chain_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'missing_cursors',
      'detail', 'pons_factories'
    );
  END IF;

  SELECT last_processed_block
  INTO v_xfer
  FROM public.chain_cursors
  WHERE stream_name = 'pons_transfers' AND chain_id = p_chain_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'missing_cursors',
      'detail', 'pons_transfers'
    );
  END IF;

  v_target := p_observation_start_block - 1;

  UPDATE public.production_state
  SET
    observation_start_block = p_observation_start_block,
    observation_started_at = now(),
    observation_version = v_version,
    observation_rollback_factories_cursor = v_fac,
    observation_rollback_transfers_cursor = v_xfer
  WHERE chain_id = p_chain_id
  RETURNING * INTO v_state;

  UPDATE public.chain_cursors
  SET last_processed_block = v_target,
      updated_at = now()
  WHERE stream_name = 'pons_factories' AND chain_id = p_chain_id;

  UPDATE public.chain_cursors
  SET last_processed_block = v_target,
      updated_at = now()
  WHERE stream_name = 'pons_transfers' AND chain_id = p_chain_id;

  SELECT last_processed_block INTO v_fac
  FROM public.chain_cursors
  WHERE stream_name = 'pons_factories' AND chain_id = p_chain_id;

  SELECT last_processed_block INTO v_xfer
  FROM public.chain_cursors
  WHERE stream_name = 'pons_transfers' AND chain_id = p_chain_id;

  IF v_fac IS DISTINCT FROM v_target OR v_xfer IS DISTINCT FROM v_target THEN
    RAISE EXCEPTION 'cursor alignment failed after observation activation';
  END IF;

  RETURN jsonb_build_object(
    'status', 'activated',
    'chain_id', v_state.chain_id,
    'production_start_block', v_state.production_start_block,
    'observation_start_block', v_state.observation_start_block,
    'observation_started_at', v_state.observation_started_at,
    'observation_version', v_state.observation_version,
    'cursors', jsonb_build_object(
      'pons_factories', v_fac,
      'pons_transfers', v_xfer
    ),
    'rollback_cursors', jsonb_build_object(
      'pons_factories', v_state.observation_rollback_factories_cursor,
      'pons_transfers', v_state.observation_rollback_transfers_cursor
    )
  );
END;
$$;

COMMENT ON FUNCTION public.activate_forward_observation(integer, bigint, text) IS
  'One-time forward-observation activation: set observation_start_block=X and both cursors to X-1 atomically. Does not touch launches/buyers/events. Does not change production_start_block.';

REVOKE ALL ON FUNCTION public.activate_forward_observation(integer, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_forward_observation(integer, bigint, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 3) rollback_forward_observation — emergency cursor restore + clear boundary
-- Does NOT delete any post-activation launches/buyers/events that may exist.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rollback_forward_observation(
  p_chain_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.production_state%ROWTYPE;
  v_prev_x bigint;
  v_prev_version text;
  v_fac bigint;
  v_xfer bigint;
  v_restore_fac bigint;
  v_restore_xfer bigint;
BEGIN
  IF p_chain_id IS NULL OR p_chain_id <> 4663 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_chain_id'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(4663, 7002);

  SELECT *
  INTO v_state
  FROM public.production_state
  WHERE chain_id = p_chain_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'missing_production_cutover'
    );
  END IF;

  IF v_state.observation_start_block IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'not_active',
      'chain_id', v_state.chain_id,
      'production_start_block', v_state.production_start_block
    );
  END IF;

  IF v_state.observation_rollback_factories_cursor IS NULL
     OR v_state.observation_rollback_transfers_cursor IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'missing_rollback_cursors',
      'production_start_block', v_state.production_start_block,
      'observation_start_block', v_state.observation_start_block
    );
  END IF;

  -- Ensure both cursor rows still exist before clearing observation state.
  SELECT last_processed_block
  INTO v_fac
  FROM public.chain_cursors
  WHERE stream_name = 'pons_factories' AND chain_id = p_chain_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'missing_cursors',
      'detail', 'pons_factories'
    );
  END IF;

  SELECT last_processed_block
  INTO v_xfer
  FROM public.chain_cursors
  WHERE stream_name = 'pons_transfers' AND chain_id = p_chain_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'missing_cursors',
      'detail', 'pons_transfers'
    );
  END IF;

  v_prev_x := v_state.observation_start_block;
  v_prev_version := v_state.observation_version;
  v_restore_fac := v_state.observation_rollback_factories_cursor;
  v_restore_xfer := v_state.observation_rollback_transfers_cursor;

  UPDATE public.chain_cursors
  SET last_processed_block = v_restore_fac,
      updated_at = now()
  WHERE stream_name = 'pons_factories' AND chain_id = p_chain_id;

  UPDATE public.chain_cursors
  SET last_processed_block = v_restore_xfer,
      updated_at = now()
  WHERE stream_name = 'pons_transfers' AND chain_id = p_chain_id;

  UPDATE public.production_state
  SET
    observation_start_block = NULL,
    observation_started_at = NULL,
    observation_version = NULL,
    observation_rollback_factories_cursor = NULL,
    observation_rollback_transfers_cursor = NULL
  WHERE chain_id = p_chain_id
  RETURNING * INTO v_state;

  SELECT last_processed_block INTO v_fac
  FROM public.chain_cursors
  WHERE stream_name = 'pons_factories' AND chain_id = p_chain_id;

  SELECT last_processed_block INTO v_xfer
  FROM public.chain_cursors
  WHERE stream_name = 'pons_transfers' AND chain_id = p_chain_id;

  IF v_fac IS DISTINCT FROM v_restore_fac OR v_xfer IS DISTINCT FROM v_restore_xfer THEN
    RAISE EXCEPTION 'cursor restore failed after observation rollback';
  END IF;

  RETURN jsonb_build_object(
    'status', 'rolled_back',
    'chain_id', v_state.chain_id,
    'production_start_block', v_state.production_start_block,
    'previous_observation_start_block', v_prev_x,
    'previous_observation_version', v_prev_version,
    'restored_cursors', jsonb_build_object(
      'pons_factories', v_fac,
      'pons_transfers', v_xfer
    ),
    'note', 'Post-activation launches/buyers/events are intentionally retained'
  );
END;
$$;

COMMENT ON FUNCTION public.rollback_forward_observation(integer) IS
  'Emergency rollback of forward observation: restore pre-activation cursors and clear observation_* fields. Does NOT delete post-activation launches/buyers/events. Does not change production_start_block.';

REVOKE ALL ON FUNCTION public.rollback_forward_observation(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_forward_observation(integer) TO service_role;
