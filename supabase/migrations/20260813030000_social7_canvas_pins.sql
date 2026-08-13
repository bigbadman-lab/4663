-- =============================================================================
-- 4663 Social 7 — durable 24h canvas PINs (PONS presentation)
-- Manual apply via Supabase SQL Editor if not using CLI.
-- One global PIN per event. expires_at = event.occurred_at + 24h (set by server INSERT).
-- Writes are service-role only (API). Browser may SELECT active rows.
-- Do NOT use generated timestamptz expressions (immutability).
-- =============================================================================

CREATE TABLE public.canvas_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 4663
    CHECK (chain_id = 4663),
  event_id uuid NOT NULL,
  pinned_by_session_id uuid NOT NULL,
  pinned_by_display_name text NOT NULL,
  pinned_by_colour text NOT NULL,
  -- Event snapshot for late-join / post-LIVE render (not a full events duplicate).
  token_address text NOT NULL,
  new_buyers integer NOT NULL
    CHECK (new_buyers >= 1),
  event_occurred_at timestamptz NOT NULL,
  trigger_block_number bigint NOT NULL,
  trigger_tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT canvas_pins_event_unique UNIQUE (chain_id, event_id),
  CONSTRAINT canvas_pins_display_name_len
    CHECK (char_length(pinned_by_display_name) >= 1 AND char_length(pinned_by_display_name) <= 24),
  CONSTRAINT canvas_pins_expires_after_event
    CHECK (expires_at > event_occurred_at),
  CONSTRAINT canvas_pins_ttl_from_event
    CHECK (expires_at = event_occurred_at + interval '24 hours')
);

COMMENT ON TABLE public.canvas_pins IS
  'Social 7 durable PIN objects. One global PIN per PONS event; visible until event_occurred_at + 24h.';

COMMENT ON COLUMN public.canvas_pins.event_id IS
  'Public events.id for the pinned PONS presentation event.';

COMMENT ON COLUMN public.canvas_pins.expires_at IS
  'Authoritative: event_occurred_at + 24 hours (set by server INSERT, not pin.created_at).';

COMMENT ON COLUMN public.canvas_pins.pinned_by_session_id IS
  'Claimed participation session UUID at pin time — snapshot attribution only.';

CREATE INDEX canvas_pins_active_expires_idx
  ON public.canvas_pins (expires_at);

CREATE INDEX canvas_pins_chain_expires_idx
  ON public.canvas_pins (chain_id, expires_at DESC);

ALTER TABLE public.canvas_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY canvas_pins_public_select
  ON public.canvas_pins
  FOR SELECT
  TO anon, authenticated
  USING (
    chain_id = 4663
    AND expires_at > now()
  );

COMMENT ON POLICY canvas_pins_public_select ON public.canvas_pins IS
  'Anon/authenticated may read only non-expired pins on chain 4663.';

REVOKE ALL PRIVILEGES ON TABLE public.canvas_pins FROM anon, authenticated;
GRANT SELECT ON TABLE public.canvas_pins TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'canvas_pins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_pins;
  END IF;
END $$;
