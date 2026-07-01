-- ============================================================
-- Phase 4 — Data-sharing governance: RLS + helper functions + aggregates
-- ============================================================

-- Explicit privileges for new tables.
GRANT SELECT, INSERT, UPDATE ON "DataSharingRequest" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "DataSharingGrant" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "EmergencyAccessGrant" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "ContextualShare" TO app_authenticated;

-- Enable + force RLS on new tables.
ALTER TABLE "DataSharingRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataSharingRequest" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DataSharingGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataSharingGrant" FORCE ROW LEVEL SECURITY;
ALTER TABLE "EmergencyAccessGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmergencyAccessGrant" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ContextualShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContextualShare" FORCE ROW LEVEL SECURITY;

-- SECURITY DEFINER helpers to avoid policy recursion on grant tables.
CREATE OR REPLACE FUNCTION public.has_active_grant(
  p_parish_id uuid,
  p_category text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "DataSharingGrant" g
    WHERE g."parishId" = p_parish_id
      AND g."dataCategory" = p_category::"DataCategory"
      AND g."granteeType" = 'DIOCESE'
      AND g."granteeId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
      AND g."isActive" = true
      AND (g."expiresAt" IS NULL OR g."expiresAt" > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.has_emergency_access(
  p_parish_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "EmergencyAccessGrant" e
    WHERE e."parishId" = p_parish_id
      AND e."dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
      AND e."isActive" = true
      AND e."expiresAt" > now()
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_active_grant(uuid, text) TO app_authenticated;
GRANT EXECUTE ON FUNCTION public.has_emergency_access(uuid) TO app_authenticated;

-- Additive diocese grant-gated read policies on core tables.
DROP POLICY IF EXISTS diocese_grant_read ON "Member";
CREATE POLICY diocese_grant_read ON "Member"
  FOR SELECT
  USING (
    (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
    AND (auth.jwt()->'app_metadata'->>'diocese_id') IS NOT NULL
    AND (
      public.has_active_grant("parishId", 'MEMBER_DIRECTORY')
      OR public.has_emergency_access("parishId")
    )
  );

DROP POLICY IF EXISTS diocese_grant_read ON "Family";
CREATE POLICY diocese_grant_read ON "Family"
  FOR SELECT
  USING (
    (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
    AND (auth.jwt()->'app_metadata'->>'diocese_id') IS NOT NULL
    AND (
      public.has_active_grant("parishId", 'FAMILY_RECORDS')
      OR public.has_emergency_access("parishId")
    )
  );

-- DataSharingRequest policies.
DROP POLICY IF EXISTS request_diocese_create ON "DataSharingRequest";
CREATE POLICY request_diocese_create ON "DataSharingRequest"
  FOR INSERT
  WITH CHECK (
    "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','diocese_staff']
    AND EXISTS (
      SELECT 1
      FROM "Parish" p
      WHERE p.id = "DataSharingRequest"."parishId"
        AND p."dioceseId" = "DataSharingRequest"."dioceseId"
    )
  );

DROP POLICY IF EXISTS request_diocese_or_parish_read ON "DataSharingRequest";
CREATE POLICY request_diocese_or_parish_read ON "DataSharingRequest"
  FOR SELECT
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    OR "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
  );

DROP POLICY IF EXISTS request_parish_review_update ON "DataSharingRequest";
CREATE POLICY request_parish_review_update ON "DataSharingRequest"
  FOR UPDATE
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_data_sharing_manager']
  )
  WITH CHECK (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
  );

-- DataSharingGrant policies.
DROP POLICY IF EXISTS grant_parish_rw ON "DataSharingGrant";
CREATE POLICY grant_parish_rw ON "DataSharingGrant"
  FOR ALL
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_data_sharing_manager']
  )
  WITH CHECK (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND EXISTS (
      SELECT 1
      FROM "Parish" p
      WHERE p.id = "DataSharingGrant"."parishId"
        AND p."dioceseId" = "DataSharingGrant"."dioceseId"
    )
  );

DROP POLICY IF EXISTS grant_diocese_read ON "DataSharingGrant";
CREATE POLICY grant_diocese_read ON "DataSharingGrant"
  FOR SELECT
  USING (
    "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (
      (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','diocese_staff','diocese_report_viewer']
    )
  );

-- EmergencyAccessGrant policies.
DROP POLICY IF EXISTS emergency_diocese_admin_create ON "EmergencyAccessGrant";
CREATE POLICY emergency_diocese_admin_create ON "EmergencyAccessGrant"
  FOR INSERT
  WITH CHECK (
    "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ? 'diocese_admin'
    AND EXISTS (
      SELECT 1
      FROM "Parish" p
      WHERE p.id = "EmergencyAccessGrant"."parishId"
        AND p."dioceseId" = "EmergencyAccessGrant"."dioceseId"
    )
  );

DROP POLICY IF EXISTS emergency_diocese_or_parish_read ON "EmergencyAccessGrant";
CREATE POLICY emergency_diocese_or_parish_read ON "EmergencyAccessGrant"
  FOR SELECT
  USING (
    "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    OR "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
  );

DROP POLICY IF EXISTS emergency_diocese_admin_update ON "EmergencyAccessGrant";
CREATE POLICY emergency_diocese_admin_update ON "EmergencyAccessGrant"
  FOR UPDATE
  USING (
    "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ? 'diocese_admin'
  )
  WITH CHECK (
    "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
  );

-- ContextualShare policies.
DROP POLICY IF EXISTS share_creator_manage ON "ContextualShare";
CREATE POLICY share_creator_manage ON "ContextualShare"
  FOR ALL
  USING (
    "createdByUserId" = nullif(auth.jwt()->>'sub','')::uuid
    OR (
      "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
      AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_data_sharing_manager']
    )
  )
  WITH CHECK (
    (
      "createdByUserId" = nullif(auth.jwt()->>'sub','')::uuid
      AND "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
      AND "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
      AND EXISTS (
        SELECT 1
        FROM "Parish" p
        WHERE p.id = "ContextualShare"."parishId"
          AND p."dioceseId" = "ContextualShare"."dioceseId"
      )
    )
    OR (
      "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
      AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_data_sharing_manager']
      AND "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
      AND EXISTS (
        SELECT 1
        FROM "Parish" p
        WHERE p.id = "ContextualShare"."parishId"
          AND p."dioceseId" = "ContextualShare"."dioceseId"
      )
    )
  );

DROP POLICY IF EXISTS share_recipient_read ON "ContextualShare";
CREATE POLICY share_recipient_read ON "ContextualShare"
  FOR SELECT
  USING (
    "isActive" = true
    AND "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (
      "recipientUserId" = nullif(auth.jwt()->>'sub','')::uuid
      OR (
        "recipientRole" IS NOT NULL
        AND (auth.jwt()->'app_metadata'->'roles') ? lower("recipientRole"::text)
        AND (
          "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
          OR (
            (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
            AND "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
          )
        )
      )
    )
  );

-- Tier-2 aggregate views (no PII columns).
DROP VIEW IF EXISTS public.diocese_parish_member_summary;
CREATE VIEW public.diocese_parish_member_summary
WITH (security_invoker = false) AS
SELECT
  m."dioceseId" AS diocese_id,
  m."parishId" AS parish_id,
  (count(*) FILTER (WHERE m.status = 'ACTIVE'))::int AS active_count,
  (count(*) FILTER (WHERE m.status = 'INACTIVE'))::int AS inactive_count,
  (count(*) FILTER (WHERE m.status = 'DECEASED'))::int AS deceased_count,
  (count(*) FILTER (WHERE m.status = 'MOVED'))::int AS moved_count,
  count(*)::int AS total_count
FROM "Member" m
WHERE m."dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
  AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','diocese_staff','diocese_report_viewer']
GROUP BY m."dioceseId", m."parishId";

DROP VIEW IF EXISTS public.diocese_parish_family_summary;
CREATE VIEW public.diocese_parish_family_summary
WITH (security_invoker = false) AS
SELECT
  f."dioceseId" AS diocese_id,
  f."parishId" AS parish_id,
  count(*)::int AS family_count,
  (count(*) FILTER (WHERE f."isActive" = true))::int AS active_family_count
FROM "Family" f
WHERE f."dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
  AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','diocese_staff','diocese_report_viewer']
GROUP BY f."dioceseId", f."parishId";

GRANT SELECT ON public.diocese_parish_member_summary TO app_authenticated;
GRANT SELECT ON public.diocese_parish_family_summary TO app_authenticated;
