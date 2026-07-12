-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260629182000_phase3_parish_operations_rls.sql
-- SHA-256: 9d0b293075f2452aaf35ecb1ed998b93ffe9303cb5eeebf4a2a3904b0f94658b

-- ============================================================
-- Phase 3 — Parish operations: RLS, DB constraints, triggers
--
-- Prisma owns the Phase 3 tables/columns/enums/indexes. This file owns:
--   * explicit grants to app_authenticated for the new tables
--   * ENABLE + FORCE row level security + deny-by-default policies
--   * parish-scoped baseline (Parish Admin/Staff) + member-facing reads
--   * sub-parish leader scoping (Ministry/Organization Leader) via
--     SECURITY DEFINER helper functions (avoids same-table policy recursion)
--   * PA-16 exclusive-membership partial unique index (+ denormalize/propagate
--     triggers that keep it honest)
--   * PA-5 facility booking exclusion constraint (btree_gist)
--   * self-registration intake policies
--
-- Re-runnable: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Grants (explicit — do not rely on default privileges)
-- ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "Program"                  TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProgramEnrollment"        TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProgramSession"           TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProgramSessionAttendance" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Organization"             TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationMembership"   TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationOfficer"      TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Event"                    TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EventAttendance"          TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Facility"                 TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FacilityBooking"          TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Message"                  TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MessageRecipient"         TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MessageTemplate"          TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CommunicationPreference"  TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "VolunteerAssignment"      TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MemberRegistration"       TO app_authenticated;

-- ────────────────────────────────────────────────────────────
-- Helper functions — sub-parish leader scope (§2.1)
--
-- SECURITY DEFINER so they read the assignment tables without being
-- bound by the very policies they help define (no recursion). They
-- resolve scope from claims.member_id, so they are always current.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_program_leader_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT pid), ARRAY[]::uuid[])
  FROM (
    SELECT p.id AS pid
      FROM "Program" p
     WHERE p."coordinatorMemberId" =
           nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
    UNION
    SELECT pe."programId" AS pid
      FROM "ProgramEnrollment" pe
     WHERE pe."memberId" =
           nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
       AND pe.role IN ('COORDINATOR','FACILITATOR')
  ) s
$$;

CREATE OR REPLACE FUNCTION public.current_org_leader_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT oid), ARRAY[]::uuid[])
  FROM (
    SELECT oo."organizationId" AS oid
      FROM "OrganizationOfficer" oo
     WHERE oo."memberId" =
           nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
       AND oo."isActive" = true
    UNION
    SELECT om."organizationId" AS oid
      FROM "OrganizationMembership" om
     WHERE om."memberId" =
           nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
       AND om.role = 'LEADER'
       AND om."leftAt" IS NULL
  ) s
$$;

GRANT EXECUTE ON FUNCTION public.current_program_leader_ids() TO app_authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_leader_ids() TO app_authenticated;

-- ════════════════════════════════════════════════════════════
-- Program  (PA-3)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "Program" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Program" FORCE ROW LEVEL SECURITY;

-- Catalog: any user in the parish may read the program list.
DROP POLICY IF EXISTS program_parish_read ON "Program";
CREATE POLICY program_parish_read ON "Program"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

-- Parish Admin/Staff: full management within their parish.
DROP POLICY IF EXISTS program_parish_write ON "Program";
CREATE POLICY program_parish_write ON "Program"
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

-- ════════════════════════════════════════════════════════════
-- ProgramEnrollment  (PA-3, MM-3) — leader-scoped (gate item 2)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "ProgramEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramEnrollment" FORCE ROW LEVEL SECURITY;

-- Member: read own enrollments.
DROP POLICY IF EXISTS program_enrollment_self_read ON "ProgramEnrollment";
CREATE POLICY program_enrollment_self_read ON "ProgramEnrollment"
  FOR SELECT
  USING (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
  );

-- Member: self-request enrollment (PENDING) into a program in their parish.
DROP POLICY IF EXISTS program_enrollment_self_request ON "ProgramEnrollment";
CREATE POLICY program_enrollment_self_request ON "ProgramEnrollment"
  FOR INSERT
  WITH CHECK (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- Parish Admin/Staff: full management within parish.
DROP POLICY IF EXISTS program_enrollment_parish_write ON "ProgramEnrollment";
CREATE POLICY program_enrollment_parish_write ON "ProgramEnrollment"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  );

-- Ministry Leader: additive read/write only for programs they lead.
DROP POLICY IF EXISTS program_enrollment_leader_rw ON "ProgramEnrollment";
CREATE POLICY program_enrollment_leader_rw ON "ProgramEnrollment"
  FOR ALL
  USING (
    "programId" = ANY (public.current_program_leader_ids())
  )
  WITH CHECK (
    "programId" = ANY (public.current_program_leader_ids())
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- ════════════════════════════════════════════════════════════
-- ProgramSession  (MM-4)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "ProgramSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramSession" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_session_parish_read ON "ProgramSession";
CREATE POLICY program_session_parish_read ON "ProgramSession"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

DROP POLICY IF EXISTS program_session_parish_write ON "ProgramSession";
CREATE POLICY program_session_parish_write ON "ProgramSession"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  );

DROP POLICY IF EXISTS program_session_leader_rw ON "ProgramSession";
CREATE POLICY program_session_leader_rw ON "ProgramSession"
  FOR ALL
  USING (
    "programId" = ANY (public.current_program_leader_ids())
  )
  WITH CHECK (
    "programId" = ANY (public.current_program_leader_ids())
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- ════════════════════════════════════════════════════════════
-- ProgramSessionAttendance  (MM-4) — leader-scoped (gate item 2)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "ProgramSessionAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramSessionAttendance" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_attendance_self_read ON "ProgramSessionAttendance";
CREATE POLICY program_attendance_self_read ON "ProgramSessionAttendance"
  FOR SELECT
  USING (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
  );

DROP POLICY IF EXISTS program_attendance_parish_write ON "ProgramSessionAttendance";
CREATE POLICY program_attendance_parish_write ON "ProgramSessionAttendance"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  );

-- Ministry Leader: capture attendance only for sessions of programs they lead.
DROP POLICY IF EXISTS program_attendance_leader_rw ON "ProgramSessionAttendance";
CREATE POLICY program_attendance_leader_rw ON "ProgramSessionAttendance"
  FOR ALL
  USING (
    "sessionId" IN (
      SELECT ps.id FROM "ProgramSession" ps
      WHERE ps."programId" = ANY (public.current_program_leader_ids())
    )
  )
  WITH CHECK (
    "sessionId" IN (
      SELECT ps.id FROM "ProgramSession" ps
      WHERE ps."programId" = ANY (public.current_program_leader_ids())
    )
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- ════════════════════════════════════════════════════════════
-- Organization  (PA-14/15)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_parish_read ON "Organization";
CREATE POLICY organization_parish_read ON "Organization"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

DROP POLICY IF EXISTS organization_parish_write ON "Organization";
CREATE POLICY organization_parish_write ON "Organization"
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

-- ════════════════════════════════════════════════════════════
-- OrganizationMembership  (PA-16) — leader-scoped (gate item 2)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "OrganizationMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationMembership" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_membership_self_read ON "OrganizationMembership";
CREATE POLICY org_membership_self_read ON "OrganizationMembership"
  FOR SELECT
  USING (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
  );

DROP POLICY IF EXISTS org_membership_parish_write ON "OrganizationMembership";
CREATE POLICY org_membership_parish_write ON "OrganizationMembership"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  );

-- Organization Leader: manage roster only for orgs they lead.
DROP POLICY IF EXISTS org_membership_leader_rw ON "OrganizationMembership";
CREATE POLICY org_membership_leader_rw ON "OrganizationMembership"
  FOR ALL
  USING (
    "organizationId" = ANY (public.current_org_leader_ids())
  )
  WITH CHECK (
    "organizationId" = ANY (public.current_org_leader_ids())
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- ════════════════════════════════════════════════════════════
-- OrganizationOfficer  (PA-15) — leader-scoped (gate item 2)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "OrganizationOfficer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationOfficer" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_officer_parish_read ON "OrganizationOfficer";
CREATE POLICY org_officer_parish_read ON "OrganizationOfficer"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

DROP POLICY IF EXISTS org_officer_parish_write ON "OrganizationOfficer";
CREATE POLICY org_officer_parish_write ON "OrganizationOfficer"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  );

DROP POLICY IF EXISTS org_officer_leader_rw ON "OrganizationOfficer";
CREATE POLICY org_officer_leader_rw ON "OrganizationOfficer"
  FOR ALL
  USING (
    "organizationId" = ANY (public.current_org_leader_ids())
  )
  WITH CHECK (
    "organizationId" = ANY (public.current_org_leader_ids())
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- ════════════════════════════════════════════════════════════
-- Event  (PA-4) — public calendar readable by the whole parish
-- ════════════════════════════════════════════════════════════
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_parish_read ON "Event";
CREATE POLICY event_parish_read ON "Event"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

DROP POLICY IF EXISTS event_parish_write ON "Event";
CREATE POLICY event_parish_write ON "Event"
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

-- ════════════════════════════════════════════════════════════
-- EventAttendance  (MM-4) — members RSVP for themselves
-- ════════════════════════════════════════════════════════════
ALTER TABLE "EventAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventAttendance" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_attendance_self_rw ON "EventAttendance";
CREATE POLICY event_attendance_self_rw ON "EventAttendance"
  FOR ALL
  USING (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
  )
  WITH CHECK (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

DROP POLICY IF EXISTS event_attendance_parish_write ON "EventAttendance";
CREATE POLICY event_attendance_parish_write ON "EventAttendance"
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

-- ════════════════════════════════════════════════════════════
-- Facility  (PA-5)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "Facility" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Facility" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facility_parish_read ON "Facility";
CREATE POLICY facility_parish_read ON "Facility"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

DROP POLICY IF EXISTS facility_parish_write ON "Facility";
CREATE POLICY facility_parish_write ON "Facility"
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

-- ════════════════════════════════════════════════════════════
-- FacilityBooking  (PA-5)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "FacilityBooking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FacilityBooking" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facility_booking_parish_read ON "FacilityBooking";
CREATE POLICY facility_booking_parish_read ON "FacilityBooking"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
  );

DROP POLICY IF EXISTS facility_booking_parish_write ON "FacilityBooking";
CREATE POLICY facility_booking_parish_write ON "FacilityBooking"
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

-- ════════════════════════════════════════════════════════════
-- Message  (PA-8)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_parish_rw ON "Message";
CREATE POLICY message_parish_rw ON "Message"
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

-- ════════════════════════════════════════════════════════════
-- MessageRecipient  (PA-8)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "MessageRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageRecipient" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_recipient_self_read ON "MessageRecipient";
CREATE POLICY message_recipient_self_read ON "MessageRecipient"
  FOR SELECT
  USING (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
  );

DROP POLICY IF EXISTS message_recipient_parish_rw ON "MessageRecipient";
CREATE POLICY message_recipient_parish_rw ON "MessageRecipient"
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

-- ════════════════════════════════════════════════════════════
-- MessageTemplate  (PA-8)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "MessageTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageTemplate" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_template_parish_rw ON "MessageTemplate";
CREATE POLICY message_template_parish_rw ON "MessageTemplate"
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

-- ════════════════════════════════════════════════════════════
-- CommunicationPreference  (PA-8) — member manages own opt-outs
-- ════════════════════════════════════════════════════════════
ALTER TABLE "CommunicationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunicationPreference" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comm_pref_self_rw ON "CommunicationPreference";
CREATE POLICY comm_pref_self_rw ON "CommunicationPreference"
  FOR ALL
  USING (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
  )
  WITH CHECK (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

DROP POLICY IF EXISTS comm_pref_parish_rw ON "CommunicationPreference";
CREATE POLICY comm_pref_parish_rw ON "CommunicationPreference"
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

-- ════════════════════════════════════════════════════════════
-- VolunteerAssignment  (PA-6)
-- ════════════════════════════════════════════════════════════
ALTER TABLE "VolunteerAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolunteerAssignment" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS volunteer_self_read ON "VolunteerAssignment";
CREATE POLICY volunteer_self_read ON "VolunteerAssignment"
  FOR SELECT
  USING (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
  );

DROP POLICY IF EXISTS volunteer_parish_rw ON "VolunteerAssignment";
CREATE POLICY volunteer_parish_rw ON "VolunteerAssignment"
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

-- ════════════════════════════════════════════════════════════
-- MemberRegistration  (MM-8) — intake INSERT via privileged client only;
-- Parish Admin/Staff review.
-- ════════════════════════════════════════════════════════════
ALTER TABLE "MemberRegistration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberRegistration" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_registration_parish_rw ON "MemberRegistration";
CREATE POLICY member_registration_parish_rw ON "MemberRegistration"
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

-- ════════════════════════════════════════════════════════════
-- PA-16 — exclusive-membership enforcement
--
-- A member may hold at most one ACTIVE (leftAt IS NULL) membership across
-- organizations sharing the same organizationType in the same parish, WHEN
-- that membership's mode is EXCLUSIVE. The partial unique index is atomic
-- (race-safe); OPEN-mode rows are exempt.
-- ════════════════════════════════════════════════════════════

-- Denormalize parent columns onto each membership at insert time so the index
-- can't be bypassed by a client supplying mismatched values.
CREATE OR REPLACE FUNCTION public.org_membership_denormalize()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  org record;
BEGIN
  SELECT "organizationType", "membershipMode", "parishId", "dioceseId"
    INTO org
    FROM "Organization"
   WHERE id = NEW."organizationId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization % not found', NEW."organizationId";
  END IF;
  NEW."organizationType" := org."organizationType";
  NEW."membershipMode"   := org."membershipMode";
  NEW."parishId"         := org."parishId";
  NEW."dioceseId"        := org."dioceseId";
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_membership_denormalize_trg ON "OrganizationMembership";
CREATE TRIGGER org_membership_denormalize_trg
  BEFORE INSERT ON "OrganizationMembership"
  FOR EACH ROW EXECUTE FUNCTION public.org_membership_denormalize();

-- Parent → child propagation: when an org's type/mode changes, push it to the
-- active memberships in the same transaction. If this would create a conflict
-- the partial unique index rejects the UPDATE, which rejects the org edit.
CREATE OR REPLACE FUNCTION public.org_membership_propagate()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW."organizationType" IS DISTINCT FROM OLD."organizationType"
     OR NEW."membershipMode" IS DISTINCT FROM OLD."membershipMode" THEN
    UPDATE "OrganizationMembership"
       SET "organizationType" = NEW."organizationType",
           "membershipMode"   = NEW."membershipMode",
           "updatedAt"        = now()
     WHERE "organizationId" = NEW.id
       AND "leftAt" IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_membership_propagate_trg ON "Organization";
CREATE TRIGGER org_membership_propagate_trg
  AFTER UPDATE ON "Organization"
  FOR EACH ROW EXECUTE FUNCTION public.org_membership_propagate();

-- The enforcement itself (race-safe, declarative).
CREATE UNIQUE INDEX IF NOT EXISTS org_membership_exclusive_active
  ON "OrganizationMembership" ("parishId", "organizationType", "memberId")
  WHERE "leftAt" IS NULL AND "membershipMode" = 'EXCLUSIVE';

-- ════════════════════════════════════════════════════════════
-- PA-5 — facility double-booking prevention (exclusion constraint)
-- ════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "FacilityBooking" DROP CONSTRAINT IF EXISTS no_facility_overlap;
ALTER TABLE "FacilityBooking" ADD CONSTRAINT no_facility_overlap
  EXCLUDE USING gist (
    "facilityId" WITH =,
    tstzrange("startAt", "endAt") WITH &&
  ) WHERE ("status" = 'CONFIRMED');
