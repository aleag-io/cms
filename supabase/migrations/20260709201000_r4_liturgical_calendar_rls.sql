-- ============================================================
-- R4 / M9 — LiturgicalObservance RLS
-- Diocese-wide rows (parishId IS NULL): readable by any user in diocese;
-- writable by diocese_admin / diocese_staff only.
-- Parish-local rows: same-parish isolation; parish_admin/staff write.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON "LiturgicalObservance" TO app_authenticated;

ALTER TABLE "LiturgicalObservance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiturgicalObservance" FORCE ROW LEVEL SECURITY;

-- Read diocese-published (or draft for diocese roles) + own parish local.
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
      -- Parish-local: same parish only
      "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    )
  );

-- Diocese write only on diocese-wide rows.
DROP POLICY IF EXISTS liturgical_diocese_write ON "LiturgicalObservance";
CREATE POLICY liturgical_diocese_write ON "LiturgicalObservance"
  FOR ALL
  USING (
    "parishId" IS NULL
    AND "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array[
      'diocese_admin',
      'diocese_staff',
      'global_admin'
    ]
  )
  WITH CHECK (
    "parishId" IS NULL
    AND "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array[
      'diocese_admin',
      'diocese_staff',
      'global_admin'
    ]
  );

-- Parish write only on own parish-local rows.
DROP POLICY IF EXISTS liturgical_parish_write ON "LiturgicalObservance";
CREATE POLICY liturgical_parish_write ON "LiturgicalObservance"
  FOR ALL
  USING (
    "parishId" IS NOT NULL
    AND "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array[
      'parish_admin',
      'parish_staff'
    ]
  )
  WITH CHECK (
    "parishId" IS NOT NULL
    AND "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND "dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array[
      'parish_admin',
      'parish_staff'
    ]
  );
