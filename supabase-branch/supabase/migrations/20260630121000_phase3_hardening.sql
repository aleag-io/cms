-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260630121000_phase3_hardening.sql
-- SHA-256: 880dacaf4f87309a7e93d06c82daa5bf9d3c2ec8fde0db7234f00d00329da550

-- ============================================================
-- Phase 3 hardening
--
-- This migration closes policy shortcuts and enforces tenant consistency for
-- denormalized Phase 3 child tables at the database layer. The route layer may
-- still validate inputs for user-friendly errors, but these triggers/policies
-- are the production safety boundary.
-- ============================================================

CREATE OR REPLACE FUNCTION public.app_has_any_role(required_roles text[])
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT coalesce((auth.jwt()->'app_metadata'->'roles') ?| required_roles, false)
$$;

CREATE OR REPLACE FUNCTION public.assert_same_tenant(
  label text,
  row_diocese_id uuid,
  row_parish_id uuid,
  ref_diocese_id uuid,
  ref_parish_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path = public
AS $$
BEGIN
  IF ref_diocese_id IS NULL OR ref_parish_id IS NULL THEN
    RAISE EXCEPTION '% tenant reference not found', label
      USING ERRCODE = '23503';
  END IF;

  IF row_diocese_id IS DISTINCT FROM ref_diocese_id
     OR row_parish_id IS DISTINCT FROM ref_parish_id THEN
    RAISE EXCEPTION '% tenant mismatch', label
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Policy hardening: every parish admin/staff write policy must include its
-- role predicate in WITH CHECK so INSERT cannot bypass the USING predicate.
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS program_parish_write ON "Program";
CREATE POLICY program_parish_write ON "Program"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS program_enrollment_self_request ON "ProgramEnrollment";
CREATE POLICY program_enrollment_self_request ON "ProgramEnrollment"
  FOR INSERT
  WITH CHECK (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND role = 'PARTICIPANT'
    AND status = 'PENDING'
  );

DROP POLICY IF EXISTS organization_parish_write ON "Organization";
CREATE POLICY organization_parish_write ON "Organization"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS event_parish_write ON "Event";
CREATE POLICY event_parish_write ON "Event"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS event_attendance_parish_write ON "EventAttendance";
CREATE POLICY event_attendance_parish_write ON "EventAttendance"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS facility_parish_write ON "Facility";
CREATE POLICY facility_parish_write ON "Facility"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS facility_booking_parish_write ON "FacilityBooking";
CREATE POLICY facility_booking_parish_write ON "FacilityBooking"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS message_parish_rw ON "Message";
CREATE POLICY message_parish_rw ON "Message"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS message_recipient_parish_rw ON "MessageRecipient";
CREATE POLICY message_recipient_parish_rw ON "MessageRecipient"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS message_template_parish_rw ON "MessageTemplate";
CREATE POLICY message_template_parish_rw ON "MessageTemplate"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS comm_pref_parish_rw ON "CommunicationPreference";
CREATE POLICY comm_pref_parish_rw ON "CommunicationPreference"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS volunteer_parish_rw ON "VolunteerAssignment";
CREATE POLICY volunteer_parish_rw ON "VolunteerAssignment"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

DROP POLICY IF EXISTS member_registration_parish_rw ON "MemberRegistration";
CREATE POLICY member_registration_parish_rw ON "MemberRegistration"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NOT NULL
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND public.app_has_any_role(array['parish_admin','parish_staff'])
  );

-- ────────────────────────────────────────────────────────────
-- Tenant consistency triggers for denormalized child rows.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.phase3_program_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  member_tenant record;
BEGIN
  IF NEW."coordinatorMemberId" IS NOT NULL THEN
    SELECT "dioceseId", "parishId" INTO member_tenant
      FROM "Member"
     WHERE id = NEW."coordinatorMemberId";
    PERFORM public.assert_same_tenant(
      'Program.coordinatorMemberId',
      NEW."dioceseId",
      NEW."parishId",
      member_tenant."dioceseId",
      member_tenant."parishId"
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_program_guard_trg ON "Program";
CREATE TRIGGER phase3_program_guard_trg
  BEFORE INSERT OR UPDATE ON "Program"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_program_guard();

CREATE OR REPLACE FUNCTION public.phase3_program_enrollment_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  program_tenant record;
  member_tenant record;
BEGIN
  SELECT "dioceseId", "parishId" INTO program_tenant
    FROM "Program"
   WHERE id = NEW."programId";
  SELECT "dioceseId", "parishId" INTO member_tenant
    FROM "Member"
   WHERE id = NEW."memberId";

  PERFORM public.assert_same_tenant('ProgramEnrollment.programId', NEW."dioceseId", NEW."parishId", program_tenant."dioceseId", program_tenant."parishId");
  PERFORM public.assert_same_tenant('ProgramEnrollment.memberId', NEW."dioceseId", NEW."parishId", member_tenant."dioceseId", member_tenant."parishId");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_program_enrollment_guard_trg ON "ProgramEnrollment";
CREATE TRIGGER phase3_program_enrollment_guard_trg
  BEFORE INSERT OR UPDATE ON "ProgramEnrollment"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_program_enrollment_guard();

CREATE OR REPLACE FUNCTION public.phase3_program_session_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  program_tenant record;
BEGIN
  SELECT "dioceseId", "parishId" INTO program_tenant
    FROM "Program"
   WHERE id = NEW."programId";
  PERFORM public.assert_same_tenant('ProgramSession.programId', NEW."dioceseId", NEW."parishId", program_tenant."dioceseId", program_tenant."parishId");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_program_session_guard_trg ON "ProgramSession";
CREATE TRIGGER phase3_program_session_guard_trg
  BEFORE INSERT OR UPDATE ON "ProgramSession"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_program_session_guard();

CREATE OR REPLACE FUNCTION public.phase3_program_attendance_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  session_tenant record;
  member_tenant record;
BEGIN
  SELECT "dioceseId", "parishId" INTO session_tenant
    FROM "ProgramSession"
   WHERE id = NEW."sessionId";
  SELECT "dioceseId", "parishId" INTO member_tenant
    FROM "Member"
   WHERE id = NEW."memberId";

  PERFORM public.assert_same_tenant('ProgramSessionAttendance.sessionId', NEW."dioceseId", NEW."parishId", session_tenant."dioceseId", session_tenant."parishId");
  PERFORM public.assert_same_tenant('ProgramSessionAttendance.memberId', NEW."dioceseId", NEW."parishId", member_tenant."dioceseId", member_tenant."parishId");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_program_attendance_guard_trg ON "ProgramSessionAttendance";
CREATE TRIGGER phase3_program_attendance_guard_trg
  BEFORE INSERT OR UPDATE ON "ProgramSessionAttendance"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_program_attendance_guard();

CREATE OR REPLACE FUNCTION public.org_membership_denormalize()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  org record;
  member_tenant record;
BEGIN
  SELECT "organizationType", "membershipMode", "parishId", "dioceseId"
    INTO org
    FROM "Organization"
   WHERE id = NEW."organizationId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization % not found', NEW."organizationId"
      USING ERRCODE = '23503';
  END IF;

  NEW."organizationType" := org."organizationType";
  NEW."membershipMode"   := org."membershipMode";
  NEW."parishId"         := org."parishId";
  NEW."dioceseId"        := org."dioceseId";

  SELECT "dioceseId", "parishId" INTO member_tenant
    FROM "Member"
   WHERE id = NEW."memberId";
  PERFORM public.assert_same_tenant('OrganizationMembership.memberId', NEW."dioceseId", NEW."parishId", member_tenant."dioceseId", member_tenant."parishId");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_membership_denormalize_trg ON "OrganizationMembership";
CREATE TRIGGER org_membership_denormalize_trg
  BEFORE INSERT OR UPDATE ON "OrganizationMembership"
  FOR EACH ROW EXECUTE FUNCTION public.org_membership_denormalize();

CREATE OR REPLACE FUNCTION public.phase3_org_officer_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  org_tenant record;
  member_tenant record;
BEGIN
  SELECT "dioceseId", "parishId" INTO org_tenant
    FROM "Organization"
   WHERE id = NEW."organizationId";
  SELECT "dioceseId", "parishId" INTO member_tenant
    FROM "Member"
   WHERE id = NEW."memberId";

  PERFORM public.assert_same_tenant('OrganizationOfficer.organizationId', NEW."dioceseId", NEW."parishId", org_tenant."dioceseId", org_tenant."parishId");
  PERFORM public.assert_same_tenant('OrganizationOfficer.memberId', NEW."dioceseId", NEW."parishId", member_tenant."dioceseId", member_tenant."parishId");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_org_officer_guard_trg ON "OrganizationOfficer";
CREATE TRIGGER phase3_org_officer_guard_trg
  BEFORE INSERT OR UPDATE ON "OrganizationOfficer"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_org_officer_guard();

CREATE OR REPLACE FUNCTION public.phase3_event_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  facility_tenant record;
BEGIN
  IF NEW."endAt" <= NEW."startAt" THEN
    RAISE EXCEPTION 'Event endAt must be after startAt'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."facilityId" IS NOT NULL THEN
    SELECT "dioceseId", "parishId" INTO facility_tenant
      FROM "Facility"
     WHERE id = NEW."facilityId";
    PERFORM public.assert_same_tenant('Event.facilityId', NEW."dioceseId", NEW."parishId", facility_tenant."dioceseId", facility_tenant."parishId");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_event_guard_trg ON "Event";
CREATE TRIGGER phase3_event_guard_trg
  BEFORE INSERT OR UPDATE ON "Event"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_event_guard();

CREATE OR REPLACE FUNCTION public.phase3_event_attendance_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  event_tenant record;
  member_tenant record;
BEGIN
  SELECT "dioceseId", "parishId" INTO event_tenant
    FROM "Event"
   WHERE id = NEW."eventId";
  SELECT "dioceseId", "parishId" INTO member_tenant
    FROM "Member"
   WHERE id = NEW."memberId";

  PERFORM public.assert_same_tenant('EventAttendance.eventId', NEW."dioceseId", NEW."parishId", event_tenant."dioceseId", event_tenant."parishId");
  PERFORM public.assert_same_tenant('EventAttendance.memberId', NEW."dioceseId", NEW."parishId", member_tenant."dioceseId", member_tenant."parishId");

  IF NOT public.app_has_any_role(array['parish_admin','parish_staff']) THEN
    IF TG_OP = 'INSERT' AND NEW.attended IS TRUE THEN
      RAISE EXCEPTION 'Only parish staff may mark event attendance'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.attended IS DISTINCT FROM OLD.attended THEN
      RAISE EXCEPTION 'Only parish staff may mark event attendance'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_event_attendance_guard_trg ON "EventAttendance";
CREATE TRIGGER phase3_event_attendance_guard_trg
  BEFORE INSERT OR UPDATE ON "EventAttendance"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_event_attendance_guard();

CREATE OR REPLACE FUNCTION public.phase3_facility_booking_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  facility_tenant record;
  event_tenant record;
BEGIN
  IF NEW."endAt" <= NEW."startAt" THEN
    RAISE EXCEPTION 'FacilityBooking endAt must be after startAt'
      USING ERRCODE = '23514';
  END IF;

  SELECT "dioceseId", "parishId" INTO facility_tenant
    FROM "Facility"
   WHERE id = NEW."facilityId";
  PERFORM public.assert_same_tenant('FacilityBooking.facilityId', NEW."dioceseId", NEW."parishId", facility_tenant."dioceseId", facility_tenant."parishId");

  IF NEW."eventId" IS NOT NULL THEN
    SELECT "dioceseId", "parishId" INTO event_tenant
      FROM "Event"
     WHERE id = NEW."eventId";
    PERFORM public.assert_same_tenant('FacilityBooking.eventId', NEW."dioceseId", NEW."parishId", event_tenant."dioceseId", event_tenant."parishId");
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_facility_booking_guard_trg ON "FacilityBooking";
CREATE TRIGGER phase3_facility_booking_guard_trg
  BEFORE INSERT OR UPDATE ON "FacilityBooking"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_facility_booking_guard();

CREATE OR REPLACE FUNCTION public.phase3_message_recipient_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  message_tenant record;
  member_tenant record;
BEGIN
  SELECT "dioceseId", "parishId" INTO message_tenant
    FROM "Message"
   WHERE id = NEW."messageId";
  SELECT "dioceseId", "parishId" INTO member_tenant
    FROM "Member"
   WHERE id = NEW."memberId";

  PERFORM public.assert_same_tenant('MessageRecipient.messageId', NEW."dioceseId", NEW."parishId", message_tenant."dioceseId", message_tenant."parishId");
  PERFORM public.assert_same_tenant('MessageRecipient.memberId', NEW."dioceseId", NEW."parishId", member_tenant."dioceseId", member_tenant."parishId");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_message_recipient_guard_trg ON "MessageRecipient";
CREATE TRIGGER phase3_message_recipient_guard_trg
  BEFORE INSERT OR UPDATE ON "MessageRecipient"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_message_recipient_guard();

CREATE OR REPLACE FUNCTION public.phase3_comm_pref_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  member_tenant record;
BEGIN
  SELECT "dioceseId", "parishId" INTO member_tenant
    FROM "Member"
   WHERE id = NEW."memberId";
  PERFORM public.assert_same_tenant('CommunicationPreference.memberId', NEW."dioceseId", NEW."parishId", member_tenant."dioceseId", member_tenant."parishId");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_comm_pref_guard_trg ON "CommunicationPreference";
CREATE TRIGGER phase3_comm_pref_guard_trg
  BEFORE INSERT OR UPDATE ON "CommunicationPreference"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_comm_pref_guard();

CREATE OR REPLACE FUNCTION public.phase3_volunteer_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  member_tenant record;
  scope_tenant record;
BEGIN
  SELECT "dioceseId", "parishId" INTO member_tenant
    FROM "Member"
   WHERE id = NEW."memberId";
  PERFORM public.assert_same_tenant('VolunteerAssignment.memberId', NEW."dioceseId", NEW."parishId", member_tenant."dioceseId", member_tenant."parishId");

  IF NEW."scopeType" = 'PROGRAM' THEN
    IF NEW."programId" IS NULL OR NEW."organizationId" IS NOT NULL OR NEW."eventId" IS NOT NULL THEN
      RAISE EXCEPTION 'VolunteerAssignment PROGRAM scope requires only programId'
        USING ERRCODE = '23514';
    END IF;
    SELECT "dioceseId", "parishId" INTO scope_tenant FROM "Program" WHERE id = NEW."programId";
    PERFORM public.assert_same_tenant('VolunteerAssignment.programId', NEW."dioceseId", NEW."parishId", scope_tenant."dioceseId", scope_tenant."parishId");
  ELSIF NEW."scopeType" = 'ORGANIZATION' THEN
    IF NEW."organizationId" IS NULL OR NEW."programId" IS NOT NULL OR NEW."eventId" IS NOT NULL THEN
      RAISE EXCEPTION 'VolunteerAssignment ORGANIZATION scope requires only organizationId'
        USING ERRCODE = '23514';
    END IF;
    SELECT "dioceseId", "parishId" INTO scope_tenant FROM "Organization" WHERE id = NEW."organizationId";
    PERFORM public.assert_same_tenant('VolunteerAssignment.organizationId', NEW."dioceseId", NEW."parishId", scope_tenant."dioceseId", scope_tenant."parishId");
  ELSIF NEW."scopeType" = 'EVENT' THEN
    IF NEW."eventId" IS NULL OR NEW."programId" IS NOT NULL OR NEW."organizationId" IS NOT NULL THEN
      RAISE EXCEPTION 'VolunteerAssignment EVENT scope requires only eventId'
        USING ERRCODE = '23514';
    END IF;
    SELECT "dioceseId", "parishId" INTO scope_tenant FROM "Event" WHERE id = NEW."eventId";
    PERFORM public.assert_same_tenant('VolunteerAssignment.eventId', NEW."dioceseId", NEW."parishId", scope_tenant."dioceseId", scope_tenant."parishId");
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_volunteer_guard_trg ON "VolunteerAssignment";
CREATE TRIGGER phase3_volunteer_guard_trg
  BEFORE INSERT OR UPDATE ON "VolunteerAssignment"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_volunteer_guard();

CREATE OR REPLACE FUNCTION public.phase3_member_registration_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  member_tenant record;
BEGIN
  IF NEW."approvedMemberId" IS NOT NULL THEN
    SELECT "dioceseId", "parishId" INTO member_tenant
      FROM "Member"
     WHERE id = NEW."approvedMemberId";
    PERFORM public.assert_same_tenant('MemberRegistration.approvedMemberId', NEW."dioceseId", NEW."parishId", member_tenant."dioceseId", member_tenant."parishId");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_member_registration_guard_trg ON "MemberRegistration";
CREATE TRIGGER phase3_member_registration_guard_trg
  BEFORE INSERT OR UPDATE ON "MemberRegistration"
  FOR EACH ROW EXECUTE FUNCTION public.phase3_member_registration_guard();
