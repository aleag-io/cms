-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260629100000_auth_shims_and_role.sql
-- SHA-256: 61352e372b437d014ca8fb3cdc3ccaf44428b4cd6481699c20570b221d8cd261

-- ============================================================
-- app_authenticated role + table grants
--
-- Applied in every environment: local Supabase, CI (plain
-- Postgres), and production Supabase.
--
-- In CI (plain Postgres) auth.jwt() / auth.uid() do not exist
-- natively; scripts/ci-auth-shims.sql creates them BEFORE this
-- migration runs. In Supabase (local/prod) those functions are
-- already present in the auth schema.
-- ============================================================

-- ============================================================
-- app_authenticated role
--
-- This role:
--   - is NOT a superuser and does NOT have BYPASSRLS
--   - receives table-level DML so RLS policies can gate rows
--   - is SET LOCAL ROLE to inside every withTenant() transaction
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_authenticated') THEN
    CREATE ROLE app_authenticated NOLOGIN;
  END IF;
END $$;

-- Allow SET LOCAL ROLE app_authenticated (needed inside withTenant()).
-- On Supabase local, SQL is often applied as supabase_admin while the app
-- connects as postgres (not a superuser) — both need membership.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    current_user,
    'postgres',
    'supabase_admin'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
      BEGIN
        EXECUTE format('GRANT app_authenticated TO %I', target);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN insufficient_privilege THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- Schema usage
GRANT USAGE ON SCHEMA public TO app_authenticated;
-- RLS helpers live in auth (auth.jwt / auth.uid). Hosted Supabase grants
-- EXECUTE to PUBLIC but not schema USAGE to custom roles — without this,
-- SET LOCAL ROLE app_authenticated makes every auth.jwt() call fail.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA auth TO app_authenticated';
  END IF;
END $$;

-- Table-level DML — RLS policies gate which rows are visible/mutable
GRANT SELECT, INSERT, UPDATE, DELETE ON "Diocese"   TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Parish"    TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AppUser"   TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Family"    TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Member"    TO app_authenticated;
-- AuditEntry: SELECT + INSERT only; UPDATE/DELETE blocked by trigger.
GRANT SELECT, INSERT ON "AuditEntry" TO app_authenticated;

-- Future tables created by Prisma migrations also get access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_authenticated;
