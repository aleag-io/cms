-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260629100001_rls_policies.sql
-- SHA-256: b09d04ad81936204fc1044e5499d89c5d994682a9ba7a3581582328c68d1c33e

-- ============================================================
-- Row-Level Security — deny-by-default for all tenant tables
--
-- Policies use auth.jwt()->'app_metadata' which is populated
-- by the access-token hook (claims_hook.sql) in Supabase and
-- by withTenant() via set_config('request.jwt.claims',...) in
-- both production and CI.
--
-- FORCE ROW LEVEL SECURITY means even table owners are bound
-- by these policies — no accidental bypass by the admin role
-- when it enters a withTenant() transaction.
--
-- Every table has deny-by-default: absence of a matching
-- policy means zero rows. No permissive fallback.
--
-- Every CREATE POLICY is preceded by DROP POLICY IF EXISTS so the
-- whole RLS bundle is re-runnable via `npm run db:apply-rls` against
-- any database state (fresh or already-migrated).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Diocese  — Tier-1 structural read only
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Diocese" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Diocese" FORCE ROW LEVEL SECURITY;

-- Any authenticated user in this diocese sees its own Diocese row.
DROP POLICY IF EXISTS diocese_own_read ON "Diocese";
CREATE POLICY diocese_own_read ON "Diocese"
  FOR SELECT
  USING (
    id = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

-- ────────────────────────────────────────────────────────────
-- Parish  — Tier-1: diocese users see all parishes in diocese;
--           parish users see only their own parish.
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Parish" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Parish" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parish_diocese_read ON "Parish";
CREATE POLICY parish_diocese_read ON "Parish"
  FOR SELECT
  USING (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

-- Superseded by 20260629140000 (parish_scoped_write + parish_diocese_write).
DROP POLICY IF EXISTS parish_admin_write ON "Parish";
CREATE POLICY parish_admin_write ON "Parish"
  FOR ALL
  USING (
    id = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin']
  )
  WITH CHECK (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

-- ────────────────────────────────────────────────────────────
-- AppUser — parish users see their own parish's users;
--           diocese users see all users in their diocese.
-- ────────────────────────────────────────────────────────────
ALTER TABLE "AppUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppUser" FORCE ROW LEVEL SECURITY;

-- Parish-scoped read
DROP POLICY IF EXISTS appuser_parish_read ON "AppUser";
CREATE POLICY appuser_parish_read ON "AppUser"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

-- Diocese-level read (diocese admins/staff see all users in their diocese)
DROP POLICY IF EXISTS appuser_diocese_read ON "AppUser";
CREATE POLICY appuser_diocese_read ON "AppUser"
  FOR SELECT
  USING (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','global_admin']
  );

-- Self-read (any user can read their own AppUser row)
DROP POLICY IF EXISTS appuser_self_read ON "AppUser";
CREATE POLICY appuser_self_read ON "AppUser"
  FOR SELECT
  USING (
    id = auth.uid()
  );

-- Write: parish admin can manage users in their parish
DROP POLICY IF EXISTS appuser_parish_admin_write ON "AppUser";
CREATE POLICY appuser_parish_admin_write ON "AppUser"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

-- ────────────────────────────────────────────────────────────
-- Family — parish-scoped only; diocese sees zero raw rows (SE-3)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Family" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Family" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_parish_read ON "Family";
CREATE POLICY family_parish_read ON "Family"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

-- Superseded by 20260629140000 (adds diocese_admin / global_admin to USING).
DROP POLICY IF EXISTS family_parish_write ON "Family";
CREATE POLICY family_parish_write ON "Family"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

-- ────────────────────────────────────────────────────────────
-- Member — parish-scoped only; diocese sees zero raw rows (SE-3)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member" FORCE ROW LEVEL SECURITY;

-- Superseded by 20260629171000 (multi-parish read + role gate).
DROP POLICY IF EXISTS member_parish_read ON "Member";
CREATE POLICY member_parish_read ON "Member"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

-- Superseded by 20260629140000 / 20260629171000.
DROP POLICY IF EXISTS member_parish_write ON "Member";
CREATE POLICY member_parish_write ON "Member"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

-- Self-read: a member can read their own record (for Phase 3 self-registration)
DROP POLICY IF EXISTS member_self_read ON "Member";
CREATE POLICY member_self_read ON "Member"
  FOR SELECT
  USING (
    "userId" = auth.uid()
    AND "userId" IS NOT NULL
  );

-- ────────────────────────────────────────────────────────────
-- AuditEntry — parish users read their own parish's entries;
--              diocese admins read diocese-level entries;
--              INSERT only (UPDATE/DELETE blocked by trigger).
-- ────────────────────────────────────────────────────────────
ALTER TABLE "AuditEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEntry" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_parish_read ON "AuditEntry";
CREATE POLICY audit_parish_read ON "AuditEntry"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  );

DROP POLICY IF EXISTS audit_diocese_read ON "AuditEntry";
CREATE POLICY audit_diocese_read ON "AuditEntry"
  FOR SELECT
  USING (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND "parishId" IS NULL
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','global_admin']
  );

-- INSERT is allowed for all authenticated users (so DENIED audit rows can be
-- written even when the main operation is rejected).
-- The INSERT must still scope to the actor's own diocese/parish.
DROP POLICY IF EXISTS audit_insert ON "AuditEntry";
CREATE POLICY audit_insert ON "AuditEntry"
  FOR INSERT
  WITH CHECK (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    OR "dioceseId" IS NULL
  );
