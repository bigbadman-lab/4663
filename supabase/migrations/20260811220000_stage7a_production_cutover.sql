-- =============================================================================
-- 4663 Stage 7A — production cutover marker + atomic cutover RPC
-- Manual apply via Supabase SQL Editor if not using CLI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- production_state — immutable singleton production boundary per chain
-- -----------------------------------------------------------------------------

CREATE TABLE public.production_state (
  chain_id integer PRIMARY KEY,
  production_start_block bigint NOT NULL,
  production_started_at timestamptz NOT NULL DEFAULT now(),
  cutover_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT production_state_chain_id_check
    CHECK (chain_id = 4663),
  CONSTRAINT production_state_block_check
    CHECK (production_start_block >= 0),
  CONSTRAINT production_state_version_check
    CHECK (cutover_version = 'pons-live-v1')
);

COMMENT ON TABLE public.production_state IS
  'Immutable production cutover boundary per chain. One row only; no casual rewrite.';

COMMENT ON COLUMN public.production_state.production_start_block IS
  'Last pre-production processed block B. Production launches require launch_block_number > B.';

ALTER TABLE public.production_state ENABLE ROW LEVEL SECURITY;
-- No public policies: service_role only (bypasses RLS).

-- -----------------------------------------------------------------------------
-- Atomic one-time cutover: marker + aligned cursors
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.perform_production_cutover(
  p_chain_id integer,
  p_production_start_block bigint,
  p_cutover_version text DEFAULT 'pons-live-v1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.production_state%ROWTYPE;
  v_fac_cursor bigint;
  v_xfer_cursor bigint;
BEGIN
  IF p_chain_id IS NULL OR p_chain_id <> 4663 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_chain_id'
    );
  END IF;

  IF p_production_start_block IS NULL OR p_production_start_block < 0 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_block'
    );
  END IF;

  IF p_cutover_version IS NULL OR p_cutover_version <> 'pons-live-v1' THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_cutover_version'
    );
  END IF;

  -- Serialize concurrent cutover attempts
  PERFORM pg_advisory_xact_lock(4663, 7001);

  SELECT *
  INTO v_existing
  FROM public.production_state
  WHERE chain_id = p_chain_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'already_cutover',
      'chain_id', v_existing.chain_id,
      'production_start_block', v_existing.production_start_block,
      'production_started_at', v_existing.production_started_at,
      'cutover_version', v_existing.cutover_version
    );
  END IF;

  INSERT INTO public.production_state (
    chain_id,
    production_start_block,
    production_started_at,
    cutover_version
  ) VALUES (
    p_chain_id,
    p_production_start_block,
    now(),
    p_cutover_version
  )
  RETURNING * INTO v_existing;

  -- Align both cursors to B (last fully processed pre-production boundary).
  -- Next exclusive start is B+1. Startup rewind is in-memory only and does not
  -- change these durable values here.
  INSERT INTO public.chain_cursors (
    stream_name,
    chain_id,
    last_processed_block
  ) VALUES
    ('pons_factories', p_chain_id, p_production_start_block),
    ('pons_transfers', p_chain_id, p_production_start_block)
  ON CONFLICT (stream_name, chain_id) DO UPDATE
  SET last_processed_block = EXCLUDED.last_processed_block,
      updated_at = now();

  SELECT last_processed_block INTO v_fac_cursor
  FROM public.chain_cursors
  WHERE stream_name = 'pons_factories' AND chain_id = p_chain_id;

  SELECT last_processed_block INTO v_xfer_cursor
  FROM public.chain_cursors
  WHERE stream_name = 'pons_transfers' AND chain_id = p_chain_id;

  IF v_fac_cursor IS DISTINCT FROM p_production_start_block
     OR v_xfer_cursor IS DISTINCT FROM p_production_start_block THEN
    RAISE EXCEPTION 'cursor alignment failed after cutover';
  END IF;

  RETURN jsonb_build_object(
    'status', 'cutover_applied',
    'chain_id', v_existing.chain_id,
    'production_start_block', v_existing.production_start_block,
    'production_started_at', v_existing.production_started_at,
    'cutover_version', v_existing.cutover_version,
    'cursors', jsonb_build_object(
      'pons_factories', v_fac_cursor,
      'pons_transfers', v_xfer_cursor
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_production_cutover(integer, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_production_cutover(integer, bigint, text) TO service_role;
