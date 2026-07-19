-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260717000002_r6_reporting_integrations_rls.sql
-- SHA-256: 98cac8faf0299d4be5c1c12753a5a5720b42aaae3deba14748000a9306f76f1e

-- R6 / M11+M12 — Reporting & Integrations RLS
-- 1) Webhook tables (outbox pattern): emitters INSERT events; only parish admins
--    manage subscriptions (raw HMAC secrets) and read the delivery log; the
--    delivery worker runs privileged and bypasses RLS.
-- 2) Diocese Tier-2 aggregate views for reporting dashboards (counts/sums only).

-- ── WebhookSubscription ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "WebhookSubscription" TO app_authenticated;
ALTER TABLE "WebhookSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookSubscription" FORCE ROW LEVEL SECURITY;

-- Secrets live here: parish admins of the owning parish only. parish_staff and
-- other roles have no access at all.
DROP POLICY IF EXISTS webhooksub_parish_admin_all ON "WebhookSubscription";
CREATE POLICY webhooksub_parish_admin_all ON "WebhookSubscription"
  FOR ALL
  USING (
    "dioceseId" = public.jwt_diocese_id()
    AND "parishId" = public.jwt_parish_id()
    AND public.jwt_has_role(VARIADIC ARRAY['parish_admin', 'global_admin'])
  )
  WITH CHECK (
    "dioceseId" = public.jwt_diocese_id()
    AND "parishId" = public.jwt_parish_id()
    AND public.jwt_has_role(VARIADIC ARRAY['parish_admin', 'global_admin'])
  );

-- ── WebhookEvent (transactional outbox) ──────────────────────────────────────
GRANT SELECT, INSERT ON "WebhookEvent" TO app_authenticated;
ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" FORCE ROW LEVEL SECURITY;

-- Any tenant actor who can perform a domain write may emit its event in the
-- same transaction. Diocese-scoped actors (jwt parish_id null) operating on a
-- parish ledger emit rows for that parish, hence the diocese-role branch.
DROP POLICY IF EXISTS webhookevent_tenant_insert ON "WebhookEvent";
CREATE POLICY webhookevent_tenant_insert ON "WebhookEvent"
  FOR INSERT
  WITH CHECK (
    "dioceseId" = public.jwt_diocese_id()
    AND (
      "parishId" = public.jwt_parish_id()
      OR public.jwt_has_role(VARIADIC ARRAY['diocese_admin', 'diocese_staff', 'global_admin'])
    )
  );

-- Outbox contents are thin (no PII) but reads are still admin-only.
DROP POLICY IF EXISTS webhookevent_admin_read ON "WebhookEvent";
CREATE POLICY webhookevent_admin_read ON "WebhookEvent"
  FOR SELECT
  USING (
    "dioceseId" = public.jwt_diocese_id()
    AND "parishId" = public.jwt_parish_id()
    AND public.jwt_has_role(VARIADIC ARRAY['parish_admin', 'global_admin'])
  );

-- No user UPDATE/DELETE: processedAt is set by the privileged worker only.

-- ── WebhookDelivery ──────────────────────────────────────────────────────────
GRANT SELECT, UPDATE ON "WebhookDelivery" TO app_authenticated;
ALTER TABLE "WebhookDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookDelivery" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhookdelivery_admin_read ON "WebhookDelivery";
CREATE POLICY webhookdelivery_admin_read ON "WebhookDelivery"
  FOR SELECT
  USING (
    "dioceseId" = public.jwt_diocese_id()
    AND "parishId" = public.jwt_parish_id()
    AND public.jwt_has_role(VARIADIC ARRAY['parish_admin', 'global_admin'])
  );

-- Admin "retry now" flips FAILED/DEAD back to PENDING; all other writes are
-- performed by the privileged worker.
DROP POLICY IF EXISTS webhookdelivery_admin_retry ON "WebhookDelivery";
CREATE POLICY webhookdelivery_admin_retry ON "WebhookDelivery"
  FOR UPDATE
  USING (
    "dioceseId" = public.jwt_diocese_id()
    AND "parishId" = public.jwt_parish_id()
    AND public.jwt_has_role(VARIADIC ARRAY['parish_admin', 'global_admin'])
  )
  WITH CHECK (
    "dioceseId" = public.jwt_diocese_id()
    AND "parishId" = public.jwt_parish_id()
    AND public.jwt_has_role(VARIADIC ARRAY['parish_admin', 'global_admin'])
  );

-- ── Tier-2 diocese aggregate views (self-securing; counts/sums only) ─────────
-- Pattern: security_invoker = false + diocese/role predicate baked into WHERE,
-- exactly like diocese_parish_member_summary / diocese_parish_giving_summary.

-- RP-9 / DA-12: approval policy configuration across every ledger owner.
CREATE OR REPLACE VIEW public.diocese_approval_policy_dashboard
  WITH (security_invoker = false)
AS
SELECT
  ap."dioceseId" AS diocese_id,
  ap."parishId" AS parish_id,
  ap."ownerType"::text AS owner_type,
  ap."ownerId" AS owner_id,
  CASE ap."ownerType"
    WHEN 'DIOCESE' THEN 'Diocese'
    WHEN 'PARISH' THEN COALESCE(par.name, 'Parish')
    ELSE COALESCE(org.name, 'Organization')
  END AS owner_label,
  ap."entityKind"::text AS entity_kind,
  ap.mode::text AS mode,
  ap."thresholdCents" AS threshold_cents,
  ap."minApprovals" AS min_approvals,
  ap."approverRoles"::text[] AS approver_roles,
  ap."sensitiveKinds"::text[] AS sensitive_kinds,
  ap."isActive" AS is_active,
  ap."updatedAt" AS updated_at
FROM "ApprovalPolicy" ap
LEFT JOIN "Parish" par ON par.id = ap."ownerId" AND ap."ownerType" = 'PARISH'
LEFT JOIN "Organization" org ON org.id = ap."ownerId" AND ap."ownerType" = 'ORGANIZATION'
WHERE ap."dioceseId" = public.jwt_diocese_id()
  AND public.jwt_has_role(VARIADIC ARRAY[
    'diocese_admin','diocese_staff','diocese_report_viewer','global_admin'
  ]);

GRANT SELECT ON public.diocese_approval_policy_dashboard TO app_authenticated;

CREATE OR REPLACE VIEW public.diocese_approval_request_summary
  WITH (security_invoker = false)
AS
SELECT
  ar."dioceseId" AS diocese_id,
  ar."parishId" AS parish_id,
  ar."entityKind"::text AS entity_kind,
  ar.status::text AS status,
  count(*)::int AS request_count,
  (sum(ar."amountCents"))::bigint AS total_amount_cents,
  min(ar."createdAt") AS oldest_created_at
FROM "ApprovalRequest" ar
WHERE ar."dioceseId" = public.jwt_diocese_id()
  AND public.jwt_has_role(VARIADIC ARRAY[
    'diocese_admin','diocese_staff','diocese_report_viewer','global_admin'
  ])
GROUP BY ar."dioceseId", ar."parishId", ar."entityKind", ar.status;

GRANT SELECT ON public.diocese_approval_request_summary TO app_authenticated;

CREATE OR REPLACE VIEW public.diocese_parish_membership_trend
  WITH (security_invoker = false)
AS
SELECT
  m."dioceseId" AS diocese_id,
  m."parishId" AS parish_id,
  date_trunc('month', m."createdAt")::date AS month,
  count(*)::int AS new_member_count
FROM "Member" m
WHERE m."dioceseId" = public.jwt_diocese_id()
  AND public.jwt_has_role(VARIADIC ARRAY[
    'diocese_admin','diocese_staff','diocese_report_viewer','global_admin'
  ])
GROUP BY m."dioceseId", m."parishId", date_trunc('month', m."createdAt");

GRANT SELECT ON public.diocese_parish_membership_trend TO app_authenticated;

-- SacramentalRecord has no dioceseId — the Parish join supplies it.
CREATE OR REPLACE VIEW public.diocese_parish_sacramental_summary
  WITH (security_invoker = false)
AS
SELECT
  p."dioceseId" AS diocese_id,
  sr."parishId" AS parish_id,
  sr."sacramentType"::text AS sacrament_type,
  extract(year FROM sr."occurredOn")::int AS year,
  count(*)::int AS record_count
FROM "SacramentalRecord" sr
JOIN "Parish" p ON p.id = sr."parishId"
WHERE sr."isActive"
  AND p."dioceseId" = public.jwt_diocese_id()
  AND public.jwt_has_role(VARIADIC ARRAY[
    'diocese_admin','diocese_staff','diocese_report_viewer','global_admin'
  ])
GROUP BY p."dioceseId", sr."parishId", sr."sacramentType", extract(year FROM sr."occurredOn");

GRANT SELECT ON public.diocese_parish_sacramental_summary TO app_authenticated;

CREATE OR REPLACE VIEW public.diocese_parish_attendance_summary
  WITH (security_invoker = false)
AS
SELECT
  a."dioceseId" AS diocese_id,
  a."parishId" AS parish_id,
  date_trunc('month', s."scheduledAt")::date AS month,
  count(DISTINCT a."sessionId")::int AS session_count,
  count(*) FILTER (WHERE a.status = 'PRESENT')::int AS present_count,
  count(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent_count,
  count(*) FILTER (WHERE a.status = 'EXCUSED')::int AS excused_count
FROM "ProgramSessionAttendance" a
JOIN "ProgramSession" s ON s.id = a."sessionId"
WHERE a."dioceseId" = public.jwt_diocese_id()
  AND public.jwt_has_role(VARIADIC ARRAY[
    'diocese_admin','diocese_staff','diocese_report_viewer','global_admin'
  ])
GROUP BY a."dioceseId", a."parishId", date_trunc('month', s."scheduledAt");

GRANT SELECT ON public.diocese_parish_attendance_summary TO app_authenticated;

CREATE OR REPLACE VIEW public.diocese_parish_event_summary
  WITH (security_invoker = false)
AS
SELECT
  e."dioceseId" AS diocese_id,
  e."parishId" AS parish_id,
  date_trunc('month', e."startAt")::date AS month,
  count(DISTINCT e.id)::int AS event_count,
  count(ea.id) FILTER (WHERE ea."rsvpStatus" = 'YES')::int AS rsvp_yes_count,
  count(ea.id) FILTER (WHERE ea.attended)::int AS attended_count
FROM "Event" e
LEFT JOIN "EventAttendance" ea ON ea."eventId" = e.id
WHERE e."dioceseId" = public.jwt_diocese_id()
  AND public.jwt_has_role(VARIADIC ARRAY[
    'diocese_admin','diocese_staff','diocese_report_viewer','global_admin'
  ])
GROUP BY e."dioceseId", e."parishId", date_trunc('month', e."startAt");

GRANT SELECT ON public.diocese_parish_event_summary TO app_authenticated;

CREATE OR REPLACE VIEW public.diocese_parish_pledge_summary
  WITH (security_invoker = false)
AS
SELECT
  pl."dioceseId" AS diocese_id,
  pl."parishId" AS parish_id,
  count(DISTINCT pl."campaignId")::int AS campaign_count,
  count(*)::int AS pledge_count,
  (sum(pl."amountCents"))::bigint AS pledged_cents,
  (sum(pl."fulfilledCents"))::bigint AS fulfilled_cents
FROM "Pledge" pl
WHERE pl."parishId" IS NOT NULL
  AND pl."dioceseId" = public.jwt_diocese_id()
  AND public.jwt_has_role(VARIADIC ARRAY[
    'diocese_admin','diocese_staff','diocese_report_viewer','global_admin'
  ])
GROUP BY pl."dioceseId", pl."parishId";

GRANT SELECT ON public.diocese_parish_pledge_summary TO app_authenticated;
