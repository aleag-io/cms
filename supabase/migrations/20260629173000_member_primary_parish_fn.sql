-- ============================================================
-- MM-17: set a member's primary parish atomically
--
-- A member may belong to multiple parishes (MemberParish) with exactly
-- one primary (enforced by the partial unique index on isPrimary). Flipping
-- the primary touches rows in two different parishes, which the per-parish
-- MemberParish write RLS policy cannot express for a single caller.
--
-- This SECURITY DEFINER function performs the flip in one transaction after
-- validating that the member already holds a membership in the target parish.
-- It is the only sanctioned path to change the primary parish, so authorization
-- is enforced by the calling route (Parish Admin) plus the membership check here.
-- ============================================================

CREATE OR REPLACE FUNCTION set_member_primary_parish(
  p_member_id uuid,
  p_parish_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "MemberParish"
    WHERE "memberId" = p_member_id AND "parishId" = p_parish_id
  ) THEN
    RAISE EXCEPTION 'Member % has no membership in parish %', p_member_id, p_parish_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Demote every membership first so the partial unique index (one primary
  -- per member) is never violated mid-flip, then promote the target.
  UPDATE "MemberParish"
    SET "isPrimary" = false, "membershipType" = 'SECONDARY', "updatedAt" = now()
    WHERE "memberId" = p_member_id;

  UPDATE "MemberParish"
    SET "isPrimary" = true, "membershipType" = 'PRIMARY', "updatedAt" = now()
    WHERE "memberId" = p_member_id AND "parishId" = p_parish_id;

  -- Keep the denormalized home-parish pointer on Member in sync.
  UPDATE "Member"
    SET "parishId" = p_parish_id, "updatedAt" = now()
    WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_member_primary_parish(uuid, uuid) TO app_authenticated;
