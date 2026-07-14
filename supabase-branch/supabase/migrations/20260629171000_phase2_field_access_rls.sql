-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260629171000_phase2_field_access_rls.sql
-- SHA-256: 6fa482c4b52680ce339e6cf51288b79be24beaa5a253557f81aa14b6ce2a142b

-- ============================================================
-- Phase 2 RLS: intra-parish field protection and directory projection
-- ============================================================

-- Ensure app_authenticated can access new tables and view surface.
GRANT SELECT, INSERT, UPDATE, DELETE ON "ParishOfficer" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MemberPrivateNote" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MemberPastoralData" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FamilyPastoralData" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MemberRelationship" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MemberParish" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ParishPermissionOverride" TO app_authenticated;

-- Enable and force RLS on all new tables.
ALTER TABLE "ParishOfficer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParishOfficer" FORCE ROW LEVEL SECURITY;

ALTER TABLE "MemberPrivateNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberPrivateNote" FORCE ROW LEVEL SECURITY;

ALTER TABLE "MemberPastoralData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberPastoralData" FORCE ROW LEVEL SECURITY;

ALTER TABLE "FamilyPastoralData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FamilyPastoralData" FORCE ROW LEVEL SECURITY;

ALTER TABLE "MemberRelationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberRelationship" FORCE ROW LEVEL SECURITY;

ALTER TABLE "MemberParish" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberParish" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ParishPermissionOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParishPermissionOverride" FORCE ROW LEVEL SECURITY;

-- Parish officer table: broad read inside parish; parish admin manages records.
DROP POLICY IF EXISTS parish_officer_parish_read ON "ParishOfficer";
CREATE POLICY parish_officer_parish_read ON "ParishOfficer"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    OR "parishId" IN (
      SELECT mp."parishId"
      FROM "MemberParish" mp
      WHERE mp."memberId" = (auth.jwt()->'app_metadata'->>'member_id')::uuid
    )
  );

DROP POLICY IF EXISTS parish_officer_parish_admin_write ON "ParishOfficer";
CREATE POLICY parish_officer_parish_admin_write ON "ParishOfficer"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- Private notes: clergy-only and scoped to clergy assignment in the target parish.
-- Both USING (read/delete) and WITH CHECK (insert/update) require the caller to hold
-- an active clergy officer position in the note's parish — clergy serve via
-- ParishOfficer, not necessarily parish membership, so WITH CHECK mirrors USING.
DROP POLICY IF EXISTS private_note_clergy_rw ON "MemberPrivateNote";
CREATE POLICY private_note_clergy_rw ON "MemberPrivateNote"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM "ParishOfficer" po
      WHERE po."memberId" = (auth.jwt()->'app_metadata'->>'member_id')::uuid
        AND po."parishId" = "MemberPrivateNote"."parishId"
        AND po."officerType" = 'CLERGY'
        AND po."isActive" = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "ParishOfficer" po
      WHERE po."memberId" = (auth.jwt()->'app_metadata'->>'member_id')::uuid
        AND po."parishId" = "MemberPrivateNote"."parishId"
        AND po."officerType" = 'CLERGY'
        AND po."isActive" = true
    )
  );

-- Pastoral data: clergy/parish admin/pastoral accessor only.
DROP POLICY IF EXISTS member_pastoral_privileged_rw ON "MemberPastoralData";
CREATE POLICY member_pastoral_privileged_rw ON "MemberPastoralData"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['clergy','parish_admin','pastoral_data_accessor']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

DROP POLICY IF EXISTS family_pastoral_privileged_rw ON "FamilyPastoralData";
CREATE POLICY family_pastoral_privileged_rw ON "FamilyPastoralData"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['clergy','parish_admin','pastoral_data_accessor']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- Member relationships: same-parish read and parish-admin/staff write.
DROP POLICY IF EXISTS member_relationship_read ON "MemberRelationship";
CREATE POLICY member_relationship_read ON "MemberRelationship"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

DROP POLICY IF EXISTS member_relationship_write ON "MemberRelationship";
CREATE POLICY member_relationship_write ON "MemberRelationship"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- Multi-parish mapping table: members can read their own mapping; admins/staff manage within parish.
DROP POLICY IF EXISTS member_parish_self_or_parish_read ON "MemberParish";
CREATE POLICY member_parish_self_or_parish_read ON "MemberParish"
  FOR SELECT
  USING (
    "memberId" = (auth.jwt()->'app_metadata'->>'member_id')::uuid
    OR "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

DROP POLICY IF EXISTS member_parish_admin_write ON "MemberParish";
CREATE POLICY member_parish_admin_write ON "MemberParish"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- Parish permission overrides: parish admin only.
DROP POLICY IF EXISTS permission_override_read ON "ParishPermissionOverride";
CREATE POLICY permission_override_read ON "ParishPermissionOverride"
  FOR SELECT
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

DROP POLICY IF EXISTS permission_override_write ON "ParishPermissionOverride";
CREATE POLICY permission_override_write ON "ParishPermissionOverride"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );

-- Tighten member table read policy so bare member role cannot read full rows.
DROP POLICY IF EXISTS member_parish_read ON "Member";

CREATE POLICY member_parish_read ON "Member"
  FOR SELECT
  USING (
    (
      (auth.jwt()->'app_metadata'->'roles') ?| array[
        'global_admin',
        'diocese_admin',
        'diocese_staff',
        'parish_admin',
        'parish_staff',
        'clergy',
        'ministry_leader',
        'organization_leader',
        'pastoral_data_accessor'
      ]
      AND (
        "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
        OR "parishId" IN (
          SELECT mp."parishId"
          FROM "MemberParish" mp
          WHERE mp."memberId" = (auth.jwt()->'app_metadata'->>'member_id')::uuid
        )
      )
    )
    OR "userId" = auth.uid()
  );

-- Member write policy keeps writes scoped to current parish.
DROP POLICY IF EXISTS member_parish_write ON "Member";

CREATE POLICY member_parish_write ON "Member"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','global_admin','parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

-- Directory view (MM-14): basic contact fields of ACTIVE members in the caller's
-- parish(es), available to ANY authenticated same-parish member — including the bare
-- `member` role, which the base "Member" RLS denies.
--
-- This is a SECURITY DEFINER view (no `security_invoker`): it runs as the view owner
-- (a BYPASSRLS role), so the base-table RLS does not collapse it to the caller's own
-- row. The view therefore does its OWN tenant-scoping in the WHERE clause via the JWT
-- claims, and only ever projects the `parish_directory_basic` columns — pastoral dates
-- and private notes live in satellite tables and are structurally unreachable here.
DROP VIEW IF EXISTS parish_member_directory;

CREATE VIEW parish_member_directory AS
SELECT
  m.id,
  m."parishId",
  m."memberIdentifier",
  m."firstName",
  m."lastName",
  m.email,
  m.phone,
  m.status
FROM "Member" m
WHERE m.status = 'ACTIVE'
  AND (
    m."parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    OR m."parishId" IN (
      SELECT mp."parishId"
      FROM "MemberParish" mp
      WHERE mp."memberId" = (auth.jwt()->'app_metadata'->>'member_id')::uuid
    )
  );

GRANT SELECT ON parish_member_directory TO app_authenticated;
