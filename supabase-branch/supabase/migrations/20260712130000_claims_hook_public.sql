-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260712130000_claims_hook_public.sql
-- SHA-256: c3fa760d68fa4e0cb25f4d8102c7a3e84ac7ef6fb5a34d74ce90229a9b1c5199

-- Install the access-token hook in public. Hosted and local Supabase reserve
-- ownership of the auth schema, so native branch migration runners cannot
-- reliably create application functions there.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $hook$
DECLARE
  claims jsonb;
  app_meta jsonb;
  user_rec record;
  member_id uuid;
  clergy_parish_ids uuid[];
  program_leader_ids uuid[];
  org_leader_ids uuid[];
  user_found boolean := false;
BEGIN
  claims := event->'claims';
  SELECT
    lower(role::text) AS role_name,
    "dioceseId" AS diocese_id,
    "parishId" AS parish_id
  INTO user_rec
  FROM "AppUser"
  WHERE id = (event->>'user_id')::uuid
    AND "isActive" = true;
  user_found := FOUND;

  SELECT m.id
  INTO member_id
  FROM "Member" m
  WHERE m."userId" = (event->>'user_id')::uuid
  LIMIT 1;

  SELECT coalesce(array_agg(po."parishId"), ARRAY[]::uuid[])
  INTO clergy_parish_ids
  FROM "ParishOfficer" po
  WHERE po."memberId" = member_id
    AND po."officerType" = 'CLERGY'
    AND po."isActive" = true;

  SELECT coalesce(array_agg(DISTINCT pid), ARRAY[]::uuid[])
  INTO program_leader_ids
  FROM (
    SELECT p.id AS pid
    FROM "Program" p
    WHERE p."coordinatorMemberId" = member_id
    UNION
    SELECT pe."programId" AS pid
    FROM "ProgramEnrollment" pe
    WHERE pe."memberId" = member_id
      AND pe.role IN ('COORDINATOR', 'FACILITATOR')
  ) leaders;

  SELECT coalesce(array_agg(DISTINCT oid), ARRAY[]::uuid[])
  INTO org_leader_ids
  FROM (
    SELECT oo."organizationId" AS oid
    FROM "OrganizationOfficer" oo
    WHERE oo."memberId" = member_id
      AND oo."isActive" = true
    UNION
    SELECT om."organizationId" AS oid
    FROM "OrganizationMembership" om
    WHERE om."memberId" = member_id
      AND om.role = 'LEADER'
      AND om."leftAt" IS NULL
  ) org_leaders;

  IF user_found THEN
    app_meta := jsonb_build_object(
      'diocese_id', user_rec.diocese_id,
      'parish_id', user_rec.parish_id,
      'roles', (
        jsonb_build_array(user_rec.role_name)
        || CASE
          WHEN array_length(clergy_parish_ids, 1) > 0
            THEN jsonb_build_array('clergy')
          ELSE '[]'::jsonb
        END
        || CASE
          WHEN array_length(program_leader_ids, 1) > 0
            THEN jsonb_build_array('ministry_leader')
          ELSE '[]'::jsonb
        END
        || CASE
          WHEN array_length(org_leader_ids, 1) > 0
            THEN jsonb_build_array('organization_leader')
          ELSE '[]'::jsonb
        END
      ),
      'member_id', member_id,
      'clergy_parish_ids', to_jsonb(clergy_parish_ids),
      'program_leader_ids', to_jsonb(program_leader_ids),
      'org_leader_ids', to_jsonb(org_leader_ids)
    );
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      coalesce(claims->'app_metadata', '{}'::jsonb) || app_meta
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$hook$;

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE
      ON FUNCTION public.custom_access_token_hook(jsonb)
      TO supabase_auth_admin;
  END IF;
END $$;
