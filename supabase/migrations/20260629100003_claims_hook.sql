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
        IF FOUND THEN
          app_meta := jsonb_build_object(
            'diocese_id', user_rec.diocese_id,
            'parish_id',  user_rec.parish_id,
            'roles',      jsonb_build_array(user_rec.role_name)
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
