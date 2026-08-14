-- =============================================================================
-- 4663 Live Chat — global ephemeral chat_messages
-- Manual apply via Supabase SQL Editor if not using CLI.
-- One global room. Soft 24h expiry. Writes are service-role only (API).
-- Browser may SELECT non-expired rows. Realtime INSERT for live clients.
-- =============================================================================

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 4663
    CHECK (chain_id = 4663),
  owner_session_id uuid NOT NULL,
  display_name text NOT NULL,
  colour text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT chat_messages_body_len
    CHECK (char_length(body) >= 1 AND char_length(body) <= 200),
  CONSTRAINT chat_messages_display_name_len
    CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 24),
  CONSTRAINT chat_messages_expires_after_created
    CHECK (expires_at > created_at)
);

COMMENT ON TABLE public.chat_messages IS
  'Global live chat messages. Soft 24h expiry; not canvas TEXT/MARK objects.';

COMMENT ON COLUMN public.chat_messages.owner_session_id IS
  'Claimed participation session UUID (tab-scoped). Not auth.';

COMMENT ON COLUMN public.chat_messages.display_name IS
  'Immutable display-name snapshot at create time.';

COMMENT ON COLUMN public.chat_messages.colour IS
  'Immutable participation colour snapshot at create time.';

COMMENT ON COLUMN public.chat_messages.expires_at IS
  'DEFAULT now() + 24 hours. Visibility uses expires_at > now(); physical delete may lag.';

-- Latest active messages (GET newest-first then reverse in app).
CREATE INDEX chat_messages_active_created_idx
  ON public.chat_messages (chain_id, created_at DESC)
  WHERE expires_at > '-infinity'::timestamptz;

CREATE INDEX chat_messages_expires_idx
  ON public.chat_messages (expires_at);

-- Rate-limit checks: recent sends per session.
CREATE INDEX chat_messages_session_created_idx
  ON public.chat_messages (owner_session_id, created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_messages_public_select
  ON public.chat_messages
  FOR SELECT
  TO anon, authenticated
  USING (
    chain_id = 4663
    AND expires_at > now()
  );

COMMENT ON POLICY chat_messages_public_select ON public.chat_messages IS
  'Anon/authenticated may read only non-expired chat messages on chain 4663.';

REVOKE ALL PRIVILEGES ON TABLE public.chat_messages FROM anon, authenticated;
GRANT SELECT ON TABLE public.chat_messages TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
