-- =============================================================================
-- 4663 Social 6 — durable 24h canvas MARKs
-- Manual apply via Supabase SQL Editor if not using CLI.
-- Persistent TEXT marks: one per participation session, visible while expires_at > now().
-- Writes are service-role only (API). Browser may SELECT active rows.
-- =============================================================================

CREATE TABLE public.canvas_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 4663
    CHECK (chain_id = 4663),
  owner_session_id uuid NOT NULL,
  owner_display_name text NOT NULL,
  owner_colour text NOT NULL,
  body text NOT NULL,
  left_pct double precision NOT NULL,
  top_pct double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT canvas_marks_owner_session_unique UNIQUE (owner_session_id),
  CONSTRAINT canvas_marks_body_len
    CHECK (char_length(body) >= 1 AND char_length(body) <= 200),
  CONSTRAINT canvas_marks_display_name_len
    CHECK (char_length(owner_display_name) >= 1 AND char_length(owner_display_name) <= 24),
  CONSTRAINT canvas_marks_left_pct
    CHECK (left_pct >= 0 AND left_pct <= 100),
  CONSTRAINT canvas_marks_top_pct
    CHECK (top_pct >= 0 AND top_pct <= 100)
);

COMMENT ON TABLE public.canvas_marks IS
  'Social 6 durable MARK objects. One per participation session; visible until expires_at.';

COMMENT ON COLUMN public.canvas_marks.owner_session_id IS
  'Claimed participation session UUID (tab-scoped). Uniqueness enforces one MARK per session.';

COMMENT ON COLUMN public.canvas_marks.owner_display_name IS
  'Immutable display-name snapshot at create time — not a profile relation.';

COMMENT ON COLUMN public.canvas_marks.owner_colour IS
  'Immutable colour snapshot at create time.';

COMMENT ON COLUMN public.canvas_marks.expires_at IS
  'DEFAULT now() + 24 hours (same transaction as created_at). Visibility uses expires_at > now(); physical delete may lag.';

CREATE INDEX canvas_marks_active_expires_idx
  ON public.canvas_marks (expires_at)
  WHERE expires_at > '-infinity'::timestamptz;

CREATE INDEX canvas_marks_chain_expires_idx
  ON public.canvas_marks (chain_id, expires_at DESC);

ALTER TABLE public.canvas_marks ENABLE ROW LEVEL SECURITY;

-- Public read of currently active marks only (visibility authority).
CREATE POLICY canvas_marks_public_select
  ON public.canvas_marks
  FOR SELECT
  TO anon, authenticated
  USING (
    chain_id = 4663
    AND expires_at > now()
  );

COMMENT ON POLICY canvas_marks_public_select ON public.canvas_marks IS
  'Anon/authenticated may read only non-expired marks on chain 4663.';

REVOKE ALL PRIVILEGES ON TABLE public.canvas_marks FROM anon, authenticated;
GRANT SELECT ON TABLE public.canvas_marks TO anon, authenticated;

-- Realtime INSERT so connected clients see new marks promptly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'canvas_marks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_marks;
  END IF;
END $$;
