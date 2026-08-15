-- =============================================================================
-- 4663 SNAPSHOT — public Storage bucket for canvas PNG captures
-- Manual apply via Supabase SQL Editor if not using CLI.
-- Writes are service-role only (Next.js API). Anon may read public objects.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'snapshots',
  'snapshots',
  true,
  8388608,
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS snapshots_public_select ON storage.objects;
CREATE POLICY snapshots_public_select
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'snapshots');

-- No INSERT/UPDATE/DELETE policies for anon/authenticated.
-- The API uses SUPABASE_SECRET_KEY (service role) which bypasses RLS.
