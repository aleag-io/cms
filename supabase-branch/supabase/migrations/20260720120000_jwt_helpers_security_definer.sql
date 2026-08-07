-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260720120000_jwt_helpers_security_definer.sql
-- SHA-256: ca4c6255983db7eb385f78b092dd552f7ef3a5dd10070e93fb6de69519e84fa7

-- ============================================================
-- JWT claim helpers that do NOT require USAGE on schema auth
--
-- withTenant() SET LOCAL ROLE app_authenticated and sets the
-- request.jwt.claims GUC. Finance RLS policies call
-- public.jwt_diocese_id() / jwt_parish_id() / jwt_has_role().
--
-- The original helpers (r5_finance_rls) were plain SQL wrappers
-- around auth.jwt(). On hosted Supabase branches, postgres cannot
-- GRANT USAGE ON SCHEMA auth to app_authenticated (auth is owned
-- by supabase_admin), so every finance query failed with:
--   permission denied for schema auth
--
-- These SECURITY DEFINER helpers read the GUC that withTenant already
-- sets, which is the same payload auth.jwt() would return.
-- ============================================================

CREATE OR REPLACE FUNCTION public.jwt_claims()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.jwt_diocese_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(public.jwt_claims()->'app_metadata'->>'diocese_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.jwt_parish_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(public.jwt_claims()->'app_metadata'->>'parish_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.jwt_has_role(VARIADIC roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (public.jwt_claims()->'app_metadata'->'roles') ?| roles,
    false
  );
$$;

REVOKE ALL ON FUNCTION public.jwt_claims() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jwt_diocese_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jwt_parish_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jwt_has_role(VARIADIC text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.jwt_claims() TO app_authenticated;
GRANT EXECUTE ON FUNCTION public.jwt_diocese_id() TO app_authenticated;
GRANT EXECUTE ON FUNCTION public.jwt_parish_id() TO app_authenticated;
GRANT EXECUTE ON FUNCTION public.jwt_has_role(VARIADIC text[]) TO app_authenticated;

-- Best-effort: also restore classic auth schema USAGE when the
-- migration role is allowed (local Supabase / CI). Hosted branches
-- may no-op here without failing the migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    BEGIN
      EXECUTE 'GRANT USAGE ON SCHEMA auth TO app_authenticated';
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END IF;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION auth.jwt() TO app_authenticated';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN undefined_function THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION auth.uid() TO app_authenticated';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN undefined_function THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;
