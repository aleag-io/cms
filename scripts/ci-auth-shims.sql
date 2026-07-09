-- ============================================================
-- CI-only auth shims (plain Postgres 16, no Supabase runtime)
--
-- Applied ONLY in CI before the main Supabase SQL migrations.
-- In Supabase (local/prod) auth.jwt() and auth.uid() already
-- exist and this script must NOT be applied there.
--
-- Both functions read the request.jwt.claims GUC that
-- withTenant() sets at the start of every user transaction,
-- matching the behaviour of Supabase's real implementations.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.jwt()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
AS $$
  SELECT coalesce(
    current_setting('request.jwt.claims', true)::jsonb,
    '{}'::jsonb
  )
$$;

CREATE OR REPLACE FUNCTION auth.uid()
  RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT coalesce(
    (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  )
$$;

-- Role may not exist yet (created in 20260629100000); grant when present.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_authenticated') THEN
    GRANT USAGE ON SCHEMA auth TO app_authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO app_authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO app_authenticated;
  END IF;
END $$;
