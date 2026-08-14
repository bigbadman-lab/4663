-- =============================================================================
-- 4663 — public SELECT for pons_buyer_continuation (RADAR Realtime wake)
-- Narrow additive change: preserve pons_buying_activity visibility; add
-- production-gated continuation rows for anon/authenticated SELECT + Realtime.
-- Does not alter INSERT/UPDATE/DELETE, fire RPCs, or worker writes.
-- =============================================================================

DROP POLICY IF EXISTS events_public_select ON public.events;

CREATE POLICY events_public_select
  ON public.events
  FOR SELECT
  TO anon, authenticated
  USING (
    chain_id = 4663
    AND event_type IN ('pons_buying_activity', 'pons_buyer_continuation')
    AND source = 'pons'
    AND public.safe_event_launch_block(payload)
      > public.production_start_block_for(chain_id)
  );

COMMENT ON POLICY events_public_select ON public.events IS
  'Anon/authenticated may read production pons_buying_activity and pons_buyer_continuation rows (safe payload.launch_block_number > production_state.production_start_block). Used by public events stream + RADAR Realtime wake.';

-- Browser roles remain SELECT-only (idempotent).
REVOKE ALL PRIVILEGES ON TABLE public.events FROM anon, authenticated;
GRANT SELECT ON TABLE public.events TO anon, authenticated;

-- events already in supabase_realtime (Stage 9A); no publication change required.

-- =============================================================================
-- Verification SQL (manual; not executed by migration)
-- =============================================================================
--
-- A) Policy text:
--    SELECT polname, pg_get_expr(polqual, polrelid)
--    FROM pg_policy
--    WHERE polrelid = 'public.events'::regclass AND polname = 'events_public_select';
--
-- B) As anon, only buying_activity + continuation with production launch block:
--    SET ROLE anon;
--    SELECT event_type, count(*) FROM public.events GROUP BY 1;
--    -- expect only pons_buying_activity and/or pons_buyer_continuation
--    RESET ROLE;
--
-- C) No write grants:
--    SELECT grantee, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND table_name = 'events'
--      AND grantee IN ('anon', 'authenticated')
--    ORDER BY 1, 2;
--    -- expect SELECT only
--
-- =============================================================================
