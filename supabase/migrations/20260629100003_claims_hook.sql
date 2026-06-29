-- ============================================================
-- Supabase custom access-token hook
--
-- Applied via `supabase db push` in production (privileged user).
-- Skipped gracefully in local Supabase dev and CI (plain Postgres)
-- where the auth schema is not accessible.
--
-- After applying in production, register the hook in
-- supabase/config.toml:
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://postgres/auth/custom_access_token_hook"
-- ============================================================

DO $$
BEGIN
  BEGIN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION auth.custom_access_token_hook(event jsonb)
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, auth
      AS $hook$
      DECLARE
        claims   jsonb;
        app_meta jsonb;
        user_rec record;
        member_id uuid;
        clergy_parish_ids uuid[];
        user_found boolean := false;
      BEGIN
        claims := event->'claims';
        SELECT
          lower(role::text) AS role_name,
          "dioceseId"       AS diocese_id,
          "parishId"        AS parish_id
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

        IF user_found THEN
          app_meta := jsonb_build_object(
            'diocese_id', user_rec.diocese_id,
            'parish_id',  user_rec.parish_id,
            'roles',      CASE
              WHEN array_length(clergy_parish_ids, 1) > 0
                THEN jsonb_build_array(user_rec.role_name, 'clergy')
              ELSE jsonb_build_array(user_rec.role_name)
            END,
            'member_id', member_id,
            'clergy_parish_ids', to_jsonb(clergy_parish_ids)
          );
          claims := jsonb_set(
            claims,
            '{app_metadata}',
            coalesce(claims->'app_metadata', '{}'::jsonb) || app_meta
          );
        END IF;
        RETURN jsonb_set(event, '{claims}', claims);
      END;
      $hook$
    $func$;

    -- Grant invoke to Supabase auth runner when present (production).
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION auth.custom_access_token_hook(jsonb) TO supabase_auth_admin';
    END IF;

    RAISE NOTICE 'custom_access_token_hook installed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping custom_access_token_hook: insufficient privilege on auth schema — apply manually in Supabase dashboard';
  END;
END $$;
