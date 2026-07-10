-- ============================================================
-- R4 hardening (peer review follow-up)
--
-- 1. public.permission_decision(): SECURITY DEFINER helper that applies
--    ParishPermissionOverride rows (PA-12) on top of the static role
--    default computed by the calling policy. Deny override wins, then
--    allow override, then the default. This makes /settings/permissions
--    overrides real at the DB layer instead of app-code-only.
-- 2. SacramentalRecord: replace the fixed-role FOR ALL policy with
--    override-aware read/write policies. WRITE permission implies SELECT
--    at the DB floor (a register writer must see rows to maintain them);
--    the API still projects reads through `can(…, 'read')`.
-- 3. MemberPastoralData: same override-awareness, and tighten WITH CHECK
--    (previously parish-match only, so any parish role could INSERT).
--    Note: enabling parish staff for the baptism/confirmation dual-write
--    requires overrides on BOTH member_sacramental_record (write) AND
--    member_pastoral_data (read + write).
-- 4. LiturgicalObservance: parish-local drafts are no longer readable by
--    every parish member — the general SELECT branch now requires
--    isPublished; parish admin/staff still see drafts via the write
--    policy's USING clause.
-- ============================================================

CREATE OR REPLACE FUNCTION public.permission_decision(
  p_parish_id uuid,
  p_resource text,
  p_action text,
  p_default boolean
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claim_roles AS (
    SELECT lower(value) AS role
    FROM jsonb_array_elements_text(
      coalesce(auth.jwt()->'app_metadata'->'roles', '[]'::jsonb)
    )
  ),
  overrides AS (
    SELECT o."isAllowed"
    FROM "ParishPermissionOverride" o
    JOIN claim_roles cr ON lower(o."role"::text) = cr.role
    WHERE o."parishId" = p_parish_id
      AND lower(o."resource"::text) = lower(p_resource)
      AND lower(o."action"::text) = lower(p_action)
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM overrides WHERE NOT "isAllowed") THEN false
    WHEN EXISTS (SELECT 1 FROM overrides WHERE "isAllowed") THEN true
    ELSE p_default
  END
$$;

GRANT EXECUTE ON FUNCTION public.permission_decision(uuid, text, text, boolean)
  TO app_authenticated;

-- ── SacramentalRecord: override-aware privileged access ─────────────────────

DROP POLICY IF EXISTS sacramental_privileged_rw ON "SacramentalRecord";

DROP POLICY IF EXISTS sacramental_privileged_read ON "SacramentalRecord";
CREATE POLICY sacramental_privileged_read ON "SacramentalRecord"
  FOR SELECT
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND (
      public.permission_decision(
        "parishId", 'member_sacramental_record', 'read',
        (auth.jwt()->'app_metadata'->'roles')
          ?| array['clergy','parish_admin','pastoral_data_accessor']
      )
      OR public.permission_decision(
        "parishId", 'member_sacramental_record', 'write',
        (auth.jwt()->'app_metadata'->'roles')
          ?| array['clergy','parish_admin','pastoral_data_accessor']
      )
    )
  );

DROP POLICY IF EXISTS sacramental_privileged_insert ON "SacramentalRecord";
CREATE POLICY sacramental_privileged_insert ON "SacramentalRecord"
  FOR INSERT
  WITH CHECK (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND public.permission_decision(
      "parishId", 'member_sacramental_record', 'write',
      (auth.jwt()->'app_metadata'->'roles')
        ?| array['clergy','parish_admin','pastoral_data_accessor']
    )
  );

DROP POLICY IF EXISTS sacramental_privileged_update ON "SacramentalRecord";
CREATE POLICY sacramental_privileged_update ON "SacramentalRecord"
  FOR UPDATE
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND public.permission_decision(
      "parishId", 'member_sacramental_record', 'write',
      (auth.jwt()->'app_metadata'->'roles')
        ?| array['clergy','parish_admin','pastoral_data_accessor']
    )
  )
  WITH CHECK (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND public.permission_decision(
      "parishId", 'member_sacramental_record', 'write',
      (auth.jwt()->'app_metadata'->'roles')
        ?| array['clergy','parish_admin','pastoral_data_accessor']
    )
  );

DROP POLICY IF EXISTS sacramental_privileged_delete ON "SacramentalRecord";
CREATE POLICY sacramental_privileged_delete ON "SacramentalRecord"
  FOR DELETE
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND public.permission_decision(
      "parishId", 'member_sacramental_record', 'write',
      (auth.jwt()->'app_metadata'->'roles')
        ?| array['clergy','parish_admin','pastoral_data_accessor']
    )
  );

-- ── MemberPastoralData: override-aware + tightened WITH CHECK ───────────────

DROP POLICY IF EXISTS member_pastoral_privileged_rw ON "MemberPastoralData";

DROP POLICY IF EXISTS member_pastoral_privileged_read ON "MemberPastoralData";
CREATE POLICY member_pastoral_privileged_read ON "MemberPastoralData"
  FOR SELECT
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND (
      public.permission_decision(
        "parishId", 'member_pastoral_data', 'read',
        (auth.jwt()->'app_metadata'->'roles')
          ?| array['clergy','parish_admin','pastoral_data_accessor']
      )
      OR public.permission_decision(
        "parishId", 'member_pastoral_data', 'write',
        (auth.jwt()->'app_metadata'->'roles')
          ?| array['clergy','parish_admin','pastoral_data_accessor']
      )
    )
  );

DROP POLICY IF EXISTS member_pastoral_privileged_insert ON "MemberPastoralData";
CREATE POLICY member_pastoral_privileged_insert ON "MemberPastoralData"
  FOR INSERT
  WITH CHECK (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND public.permission_decision(
      "parishId", 'member_pastoral_data', 'write',
      (auth.jwt()->'app_metadata'->'roles')
        ?| array['clergy','parish_admin','pastoral_data_accessor']
    )
  );

DROP POLICY IF EXISTS member_pastoral_privileged_update ON "MemberPastoralData";
CREATE POLICY member_pastoral_privileged_update ON "MemberPastoralData"
  FOR UPDATE
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND public.permission_decision(
      "parishId", 'member_pastoral_data', 'write',
      (auth.jwt()->'app_metadata'->'roles')
        ?| array['clergy','parish_admin','pastoral_data_accessor']
    )
  )
  WITH CHECK (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND public.permission_decision(
      "parishId", 'member_pastoral_data', 'write',
      (auth.jwt()->'app_metadata'->'roles')
        ?| array['clergy','parish_admin','pastoral_data_accessor']
    )
  );

DROP POLICY IF EXISTS member_pastoral_privileged_delete ON "MemberPastoralData";
CREATE POLICY member_pastoral_privileged_delete ON "MemberPastoralData"
  FOR DELETE
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND public.permission_decision(
      "parishId", 'member_pastoral_data', 'write',
      (auth.jwt()->'app_metadata'->'roles')
        ?| array['clergy','parish_admin','pastoral_data_accessor']
    )
  );

-- ── LiturgicalObservance: hide parish-local drafts from general readers ─────

DROP POLICY IF EXISTS liturgical_select ON "LiturgicalObservance";
CREATE POLICY liturgical_select ON "LiturgicalObservance"
  FOR SELECT
  USING (
    "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (
      -- Diocese-wide: any diocese member sees published; diocese staff sees drafts too
      (
        "parishId" IS NULL
        AND (
          "isPublished" = true
          OR (auth.jwt()->'app_metadata'->'roles') ?| array[
            'diocese_admin',
            'diocese_staff',
            'global_admin'
          ]
        )
      )
      OR
      -- Parish-local: same parish only, published only.
      -- (parish_admin/parish_staff see drafts via liturgical_parish_write USING)
      (
        "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
        AND "isPublished" = true
      )
    )
  );
