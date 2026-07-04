-- ═══════════════════════════════════════════════════════════════════════════
-- R1 (Phase 9) — Member self-service: a member may UPDATE their OWN Member row.
--
-- The base member_parish_write policy only admits admin/staff roles, so the
-- self-service profile edit (own contact details) needs a dedicated UPDATE
-- policy scoped to auth.uid(). Field-level limits (email/phone only) are
-- enforced by the API route; this policy constrains the ROW scope and pins the
-- tenant columns via WITH CHECK so a member cannot move their row across
-- parish/diocese boundaries.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS member_self_update ON "Member";

CREATE POLICY member_self_update ON "Member"
  FOR UPDATE
  USING ("userId" = auth.uid())
  WITH CHECK (
    "userId" = auth.uid()
    AND "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );
