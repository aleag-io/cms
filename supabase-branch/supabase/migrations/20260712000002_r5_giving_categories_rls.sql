-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260712000002_r5_giving_categories_rls.sql
-- SHA-256: 97b46a7a858ed54c41040dea43511518d3390db9a900a70e77446d46d2c62026

-- R5 / M10 — GivingCategory RLS (owner-scoped like Fund/Account)
GRANT SELECT, INSERT, UPDATE ON "GivingCategory" TO app_authenticated;
ALTER TABLE "GivingCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GivingCategory" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS givingcategory_ledger_rw ON "GivingCategory";
CREATE POLICY givingcategory_ledger_rw ON "GivingCategory"
  FOR ALL
  USING (public.finance_can_read_ledger("ownerType", "ownerId", "dioceseId", "parishId"))
  WITH CHECK (public.finance_can_write_ledger("ownerType", "ownerId", "dioceseId", "parishId"));
