-- R5 / M10 — GivingCategory RLS (owner-scoped like Fund/Account)
GRANT SELECT, INSERT, UPDATE ON "GivingCategory" TO app_authenticated;
ALTER TABLE "GivingCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GivingCategory" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS givingcategory_ledger_rw ON "GivingCategory";
CREATE POLICY givingcategory_ledger_rw ON "GivingCategory"
  FOR ALL
  USING (public.finance_can_read_ledger("ownerType", "ownerId", "dioceseId", "parishId"))
  WITH CHECK (public.finance_can_write_ledger("ownerType", "ownerId", "dioceseId", "parishId"));
