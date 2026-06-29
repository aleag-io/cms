-- ============================================================
-- Audit immutability (AU-10)
--
-- AuditEntry rows must never be updated or deleted. Two layers:
--
--  1. REVOKE — app_authenticated cannot UPDATE/DELETE at all
--     (the GRANT in 20260629100000 gives only INSERT + SELECT)
--
--  2. Trigger — defence-in-depth for any privileged role that
--     bypasses the grant, including during migrations.
--
-- The audit INSERT path uses the privileged Prisma client
-- (lib/prisma.ts) so it is not constrained by app_authenticated
-- grants — this means DENIED outcomes can always be written even
-- when the request itself is rejected by RLS.
-- ============================================================

-- Explicit revoke (belt-and-suspenders; the role was never
-- GRANTed UPDATE/DELETE so this is a documented safeguard).
REVOKE UPDATE, DELETE ON "AuditEntry" FROM app_authenticated;

-- Trigger blocks even privileged roles from mutating audit rows.
CREATE OR REPLACE FUNCTION audit_entry_immutable()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'AuditEntry rows are immutable: UPDATE and DELETE are forbidden (AU-10)';
END;
$$;

DROP TRIGGER IF EXISTS audit_entry_no_mutate ON "AuditEntry";

CREATE TRIGGER audit_entry_no_mutate
  BEFORE UPDATE OR DELETE ON "AuditEntry"
  FOR EACH ROW EXECUTE FUNCTION audit_entry_immutable();
