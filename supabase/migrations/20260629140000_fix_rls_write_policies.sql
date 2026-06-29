-- ============================================================
-- Fix RLS write policies to include diocese_admin / global_admin
--
-- The initial policies only allowed parish_admin / parish_staff to
-- UPDATE and DELETE families, members, and parishes.  DIOCESE_ADMIN
-- users (who have a parish_id in their claims) were blocked by the
-- USING clause even though the API layer permits them — causing
-- Prisma P2025 "record not found for update/delete".
--
-- Fix:
--   • family_parish_write  — add diocese_admin, global_admin to USING
--   • member_parish_write  — add diocese_admin, global_admin to USING
--   • parish_admin_write   — replace with two policies:
--       parish_scoped_write (parish_admin scoped to their parish)
--       diocese_parish_write (diocese_admin / global_admin can update
--                             any parish in their diocese)
-- ============================================================

-- ── Family ───────────────────────────────────────────────────
DROP POLICY IF EXISTS family_parish_write ON "Family";

CREATE POLICY family_parish_write ON "Family"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','global_admin','parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

-- ── Member ───────────────────────────────────────────────────
DROP POLICY IF EXISTS member_parish_write ON "Member";

CREATE POLICY member_parish_write ON "Member"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','global_admin','parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

-- ── Parish ───────────────────────────────────────────────────
-- Replace the single restrictive policy with two:
--   1. Parish admins can update only their own parish (parish_id scoped).
--   2. Diocese / global admins can update any parish in their diocese.
DROP POLICY IF EXISTS parish_admin_write ON "Parish";
DROP POLICY IF EXISTS parish_scoped_write ON "Parish";
DROP POLICY IF EXISTS parish_diocese_write ON "Parish";

CREATE POLICY parish_scoped_write ON "Parish"
  FOR ALL
  USING (
    id = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin']
  )
  WITH CHECK (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

CREATE POLICY parish_diocese_write ON "Parish"
  FOR ALL
  USING (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','global_admin']
  )
  WITH CHECK (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );
