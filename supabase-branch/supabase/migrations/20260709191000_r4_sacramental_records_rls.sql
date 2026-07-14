-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260709191000_r4_sacramental_records_rls.sql
-- SHA-256: ab863003076bcef08e0fd7d42d589711c41f061c43ca00181a275174d85a5c04

-- ============================================================
-- R4 / M8 — SacramentalRecord RLS
-- Privileged parish roles (clergy / parish_admin / pastoral_data_accessor)
-- have full access in-parish. Members may SELECT their own rows.
-- Diocese SELECT only with SACRAMENTAL_RECORDS grant or emergency access.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON "SacramentalRecord" TO app_authenticated;

ALTER TABLE "SacramentalRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SacramentalRecord" FORCE ROW LEVEL SECURITY;

-- Privileged write + read (same matrix as MemberPastoralData).
DROP POLICY IF EXISTS sacramental_privileged_rw ON "SacramentalRecord";
CREATE POLICY sacramental_privileged_rw ON "SacramentalRecord"
  FOR ALL
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array[
      'clergy',
      'parish_admin',
      'pastoral_data_accessor'
    ]
  )
  WITH CHECK (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array[
      'clergy',
      'parish_admin',
      'pastoral_data_accessor'
    ]
  );

-- Member may read own register rows in their parish (no write).
DROP POLICY IF EXISTS sacramental_member_own_read ON "SacramentalRecord";
CREATE POLICY sacramental_member_own_read ON "SacramentalRecord"
  FOR SELECT
  USING (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
    AND "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
  );

-- Diocese Tier-3 / emergency read (view-only at API layer).
DROP POLICY IF EXISTS sacramental_diocese_grant_read ON "SacramentalRecord";
CREATE POLICY sacramental_diocese_grant_read ON "SacramentalRecord"
  FOR SELECT
  USING (
    (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
    AND (auth.jwt()->'app_metadata'->>'diocese_id') IS NOT NULL
    AND (
      public.has_active_grant("parishId", 'SACRAMENTAL_RECORDS')
      OR public.has_emergency_access("parishId")
    )
  );
