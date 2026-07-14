-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260709053000_grant_auth_schema_usage.sql
-- SHA-256: e47f4d23221aa567f2438e0de66890f079ef9890eff0d134984b440387a96d98

-- ============================================================
-- Grant app_authenticated access to auth.jwt() / auth.uid()
--
-- withTenant() SET LOCAL ROLE app_authenticated, then RLS policies
-- call auth.jwt(). On plain Postgres (CI/local shims) this GRANT is
-- required for direct calls. On hosted Supabase the auth schema is
-- owned by supabase_admin; postgres can EXECUTE via PUBLIC but cannot
-- add ACL entries — GRANT may no-op there. RLS policy expressions still
-- evaluate auth.jwt() by OID once policies are installed.
-- ============================================================

GRANT USAGE ON SCHEMA auth TO app_authenticated;

-- Be explicit even though EXECUTE is PUBLIC on Supabase defaults.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'jwt' AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION auth.jwt() TO app_authenticated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid' AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION auth.uid() TO app_authenticated';
  END IF;
END $$;
