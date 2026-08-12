-- =============================================================================
-- 4663 Stage 9A — production-gated public SELECT on events + Realtime publication
-- Manual apply via Supabase SQL Editor if not using CLI.
-- Does not alter fire RPC, cutover, worker semantics, or historical rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- production_start_block_for — read boundary for RLS without exposing the table
--
-- production_state has RLS enabled and no anon/authenticated policies, so a
-- direct subquery from events_public_select would always see zero rows and
-- fail-closed for every event (including legitimate production ones).
-- SECURITY DEFINER + narrow EXECUTE grant keeps the table private while making
-- the boundary usable in the public SELECT policy.
-- search_path is pg_catalog only; table refs are fully schema-qualified.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.production_start_block_for(p_chain_id integer)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT ps.production_start_block
  FROM public.production_state AS ps
  WHERE ps.chain_id = p_chain_id;
$$;

COMMENT ON FUNCTION public.production_start_block_for(integer) IS
  'Returns production_start_block for a chain, or NULL if cutover row missing. Used by events public RLS.';

REVOKE ALL ON FUNCTION public.production_start_block_for(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.production_start_block_for(integer) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- safe_event_launch_block — fail-closed payload.launch_block_number parser
-- Never throws on malformed payload; returns NULL instead.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.safe_event_launch_block(p_payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  v_type text;
  v_raw text;
  v_block bigint;
BEGIN
  IF p_payload IS NULL THEN
    RETURN NULL;
  END IF;

  v_type := pg_catalog.jsonb_typeof(p_payload -> 'launch_block_number');
  IF v_type IS NULL OR v_type NOT IN ('number', 'string') THEN
    RETURN NULL;
  END IF;

  v_raw := p_payload ->> 'launch_block_number';
  IF v_raw IS NULL OR v_raw = '' THEN
    RETURN NULL;
  END IF;

  -- Digits only: rejects negatives, decimals, exponents, whitespace, signs.
  IF v_raw !~ '^[0-9]+$' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_block := v_raw::bigint;
  EXCEPTION
    WHEN others THEN
      -- Overflow / unexpected cast failure → fail closed
      RETURN NULL;
  END;

  RETURN v_block;
END;
$$;

COMMENT ON FUNCTION public.safe_event_launch_block(jsonb) IS
  'Parses events.payload.launch_block_number to bigint, or NULL if missing/malformed/out of range. Never throws.';

REVOKE ALL ON FUNCTION public.safe_event_launch_block(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safe_event_launch_block(jsonb) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Replace open public SELECT with production-gated policy (fail closed)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS events_public_select ON public.events;

CREATE POLICY events_public_select
  ON public.events
  FOR SELECT
  TO anon, authenticated
  USING (
    chain_id = 4663
    AND event_type = 'pons_buying_activity'
    AND source = 'pons'
    AND public.safe_event_launch_block(payload)
      > public.production_start_block_for(chain_id)
  );

COMMENT ON POLICY events_public_select ON public.events IS
  'Anon/authenticated may read only production pons_buying_activity rows (safe payload.launch_block_number > production_state.production_start_block).';

-- Browser roles: SELECT only (strip any default REFERENCES/TRIGGER/etc.)
REVOKE ALL PRIVILEGES ON TABLE public.events FROM anon, authenticated;
GRANT SELECT ON TABLE public.events TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: ensure public.events is in supabase_realtime (idempotent)
-- INSERT delivery is sufficient for Stage 9 clients; replica identity unchanged.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
END $$;

-- =============================================================================
-- Verification SQL (run manually after apply; not executed by migration)
-- =============================================================================
--
-- A) safe_event_launch_block — NULL without throwing:
--    SELECT public.safe_event_launch_block('{}'::jsonb);
--    -- NULL
--    SELECT public.safe_event_launch_block('{"launch_block_number":"nope"}'::jsonb);
--    -- NULL
--    SELECT public.safe_event_launch_block('{"launch_block_number":-1}'::jsonb);
--    -- NULL
--    SELECT public.safe_event_launch_block('{"launch_block_number":12.5}'::jsonb);
--    -- NULL
--    SELECT public.safe_event_launch_block(
--      jsonb_build_object('launch_block_number', '9223372036854775808')
--    );
--    -- NULL (bigint max + 1)
--    SELECT public.safe_event_launch_block(NULL);
--    -- NULL
--
-- B) valid production launch block:
--    SELECT public.safe_event_launch_block(
--      jsonb_build_object('launch_block_number', 34002667)
--    );
--    -- 34002667
--    SELECT public.safe_event_launch_block(
--      '{"launch_block_number":"34002667"}'::jsonb
--    );
--    -- 34002667
--
-- C) Boundary helper (expect 34002666 for chain 4663 after cutover):
--    SELECT public.production_start_block_for(4663);
--
-- D) Production rows remain visible as anon:
--    SET ROLE anon;
--    SELECT count(*) FROM public.events;
--    -- expect only rows with safe launch block > production_start_block
--    RESET ROLE;
--
-- E) Pre-boundary / malformed rows not publicly readable:
--    -- as service/postgres, pick a known pre-boundary or bad-payload id, then:
--    SET ROLE anon;
--    SELECT * FROM public.events WHERE id = '<pre-boundary-or-malformed-uuid>';
--    -- expect 0 rows
--    RESET ROLE;
--
-- F) Service role / bypass unaffected:
--    SELECT count(*) FROM public.events;
--    -- expect full table count including historical rows
--
-- G) Realtime publication:
--    SELECT * FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND tablename = 'events';
--
-- H) No write grants for browser roles:
--    SELECT grantee, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND table_name = 'events'
--      AND grantee IN ('anon', 'authenticated')
--    ORDER BY grantee, privilege_type;
--    -- expect SELECT only
--
-- =============================================================================
