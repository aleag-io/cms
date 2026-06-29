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

-- Allow the role running migrations to switch into app_authenticated
-- via SET LOCAL ROLE (needed inside withTenant() transactions).
DO $$
BEGIN
  EXECUTE format('GRANT app_authenticated TO %I', current_user);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Schema usage
GRANT USAGE ON SCHEMA public TO app_authenticated;

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
