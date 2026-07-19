-- ============================================================
-- Grant supabase_auth_admin USAGE on schema public
--
-- Local GoTrue calls custom_access_token_hook via
--   pg-functions://postgres/public/custom_access_token_hook
-- EXECUTE alone is not enough: the invoker must have USAGE on
-- the schema that owns the function. Without this, login returns
-- 500 unexpected_failure ("permission denied for schema public")
-- and the browser surfaces an empty / opaque auth error.
--
-- Postgres 15+ (and our lockdown ACL) no longer grants public-
-- schema USAGE to PUBLIC; only app_authenticated was granted.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
  END IF;
END $$;
