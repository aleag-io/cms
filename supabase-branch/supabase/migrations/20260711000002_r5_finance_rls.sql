-- GENERATED FILE - DO NOT EDIT.
-- Source: supabase/migrations/20260711000002_r5_finance_rls.sql
-- SHA-256: 6a4ef779255813b5698c17d5a106956cefa57f98df90d270eda32bef2bcefe73

-- ============================================================
-- R5 / M10 — Finance RLS + invariant triggers (multi-level)
-- Ledgers: DIOCESE | PARISH | ORGANIZATION (diocese or parish org)
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON "Fund" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "Account" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "AccountingPeriod" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "JournalEntry" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "JournalLine" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "ApprovalPolicy" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "ApprovalRequest" TO app_authenticated;
GRANT SELECT, INSERT ON "ApprovalDecision" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "ExternalDonor" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "Campaign" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "DonationBatch" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "Donation" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DonationAllocation" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "Pledge" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "Vendor" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "VendorBill" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "Payment" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "Budget" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "BudgetLine" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "ReconciliationRun" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "BankStatementLine" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "GivingStatement" TO app_authenticated;
GRANT SELECT ON "StripeEvent" TO app_authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Fund','Account','AccountingPeriod','JournalEntry','JournalLine',
    'ApprovalPolicy','ApprovalRequest','ApprovalDecision',
    'ExternalDonor','Campaign','DonationBatch','Donation','DonationAllocation',
    'Pledge','Vendor','VendorBill','Payment','Budget','BudgetLine',
    'ReconciliationRun','BankStatementLine','GivingStatement','StripeEvent'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ── Invariant triggers ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_journal_balanced()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_entry uuid := COALESCE(NEW."journalEntryId", OLD."journalEntryId");
  v_debit bigint; v_credit bigint; v_lines int;
BEGIN
  SELECT
    COALESCE(sum("amountCents") FILTER (WHERE "direction" = 'DEBIT'), 0),
    COALESCE(sum("amountCents") FILTER (WHERE "direction" = 'CREDIT'), 0),
    count(*)
  INTO v_debit, v_credit, v_lines
  FROM "JournalLine" WHERE "journalEntryId" = v_entry;
  IF v_lines = 0 THEN RETURN NULL; END IF;
  IF v_lines < 2 THEN RAISE EXCEPTION 'JournalEntry % must have >= 2 lines', v_entry; END IF;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'JournalEntry % unbalanced: debit=% credit=%', v_entry, v_debit, v_credit;
  END IF;
  IF v_debit = 0 THEN RAISE EXCEPTION 'JournalEntry % zero-total', v_entry; END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS journal_balanced ON "JournalLine";
CREATE CONSTRAINT TRIGGER journal_balanced
  AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_balanced();

CREATE OR REPLACE FUNCTION public.assert_period_open()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status "PeriodStatus";
BEGIN
  SELECT status INTO v_status FROM "AccountingPeriod" WHERE id = NEW."periodId";
  IF v_status IS NULL OR v_status = 'CLOSED' THEN
    RAISE EXCEPTION 'Cannot write JournalEntry into a closed/missing period';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS journal_period_open ON "JournalEntry";
CREATE TRIGGER journal_period_open
  BEFORE INSERT OR UPDATE OF "periodId" ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION public.assert_period_open();

CREATE OR REPLACE FUNCTION public.assert_posted_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'POSTED' THEN RAISE EXCEPTION 'POSTED journal entries are immutable'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'POSTED' THEN
    IF NEW.status = 'VOID'
       AND NEW."postedAt" IS NOT DISTINCT FROM OLD."postedAt"
       AND NEW."periodId" = OLD."periodId"
       AND NEW."ownerType" = OLD."ownerType"
       AND NEW."ownerId" = OLD."ownerId"
       AND NEW."entryDate" = OLD."entryDate"
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'POSTED journal entries are immutable';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS journal_posted_immutable ON "JournalEntry";
CREATE TRIGGER journal_posted_immutable
  BEFORE UPDATE OR DELETE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION public.assert_posted_immutable();

CREATE OR REPLACE FUNCTION public.assert_posted_lines_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status "JournalStatus";
  v_entry uuid := COALESCE(NEW."journalEntryId", OLD."journalEntryId");
BEGIN
  SELECT status INTO v_status FROM "JournalEntry" WHERE id = v_entry;
  IF v_status = 'POSTED' THEN
    RAISE EXCEPTION 'POSTED journal lines are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS journal_line_posted_immutable ON "JournalLine";
CREATE TRIGGER journal_line_posted_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION public.assert_posted_lines_immutable();

CREATE OR REPLACE FUNCTION public.assert_line_same_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  et "LedgerOwnerType"; eid uuid; at "LedgerOwnerType"; aid uuid;
BEGIN
  SELECT "ownerType", "ownerId" INTO et, eid FROM "JournalEntry" WHERE id = NEW."journalEntryId";
  SELECT "ownerType", "ownerId" INTO at, aid FROM "Account" WHERE id = NEW."accountId";
  IF et IS DISTINCT FROM at OR eid IS DISTINCT FROM aid THEN
    RAISE EXCEPTION 'JournalLine account must belong to same ledger owner as entry';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS journal_line_same_ledger ON "JournalLine";
CREATE TRIGGER journal_line_same_ledger
  BEFORE INSERT OR UPDATE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION public.assert_line_same_ledger();

CREATE OR REPLACE FUNCTION public.assert_no_self_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_maker uuid;
BEGIN
  SELECT "makerUserId" INTO v_maker FROM "ApprovalRequest" WHERE id = NEW."approvalRequestId";
  IF v_maker IS NOT NULL AND v_maker = NEW."approverUserId" THEN
    RAISE EXCEPTION 'Approver cannot be the maker (no self-approval)';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS approval_no_self ON "ApprovalDecision";
CREATE TRIGGER approval_no_self
  BEFORE INSERT ON "ApprovalDecision"
  FOR EACH ROW EXECUTE FUNCTION public.assert_no_self_approval();

CREATE OR REPLACE FUNCTION public.assert_donation_allocations_sum()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_donation uuid := COALESCE(NEW."donationId", OLD."donationId");
  v_sum bigint; v_total bigint; v_count int;
BEGIN
  SELECT "amountCents" INTO v_total FROM "Donation" WHERE id = v_donation;
  IF v_total IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(sum("amountCents"), 0), count(*) INTO v_sum, v_count
  FROM "DonationAllocation" WHERE "donationId" = v_donation;
  IF v_count = 0 THEN RETURN NULL; END IF;
  IF v_sum <> v_total THEN
    RAISE EXCEPTION 'Donation % allocations sum % != amount %', v_donation, v_sum, v_total;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS donation_allocations_sum ON "DonationAllocation";
CREATE CONSTRAINT TRIGGER donation_allocations_sum
  AFTER INSERT OR UPDATE OR DELETE ON "DonationAllocation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_donation_allocations_sum();

-- ── Access helpers ──────────────────────────────────────────

-- JWT helpers
CREATE OR REPLACE FUNCTION public.jwt_diocese_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.jwt_parish_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.jwt_has_role(VARIADIC roles text[]) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt()->'app_metadata'->'roles') ?| roles;
$$;

-- Can write a ledger owner?
-- DIOCESE books: diocese_admin / diocese_staff / global_admin
-- PARISH books: parish_admin / parish_staff / global_admin in that parish
-- ORGANIZATION books: org leader of that org; diocese staff if diocese-org (parishId null);
--                     parish staff do NOT write parish-org books (org leader only)
CREATE OR REPLACE FUNCTION public.finance_can_write_ledger(
  p_owner_type "LedgerOwnerType",
  p_owner_id uuid,
  p_diocese_id uuid,
  p_parish_id uuid
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT
    p_diocese_id = public.jwt_diocese_id()
    AND (
      -- Global admin anywhere in diocese
      public.jwt_has_role(VARIADIC ARRAY['global_admin'])
      OR (
        -- Diocese general ledger
        p_owner_type = 'DIOCESE'
        AND p_owner_id = public.jwt_diocese_id()
        AND public.jwt_has_role(VARIADIC ARRAY['diocese_admin','diocese_staff','global_admin'])
      )
      OR (
        -- Parish general ledger
        p_owner_type = 'PARISH'
        AND p_owner_id = public.jwt_parish_id()
        AND p_parish_id = public.jwt_parish_id()
        AND public.jwt_has_role(VARIADIC ARRAY['parish_admin','parish_staff','global_admin'])
      )
      OR (
        -- Org ledger: leader of that org
        p_owner_type = 'ORGANIZATION'
        AND p_owner_id = ANY (public.current_org_leader_ids())
      )
      OR (
        -- Diocese-scoped org (no parish): diocese admin/staff can write
        p_owner_type = 'ORGANIZATION'
        AND p_parish_id IS NULL
        AND public.jwt_has_role(VARIADIC ARRAY['diocese_admin','diocese_staff','global_admin'])
      )
    );
$$;

-- Can read a ledger owner? (write paths + oversight reads)
CREATE OR REPLACE FUNCTION public.finance_can_read_ledger(
  p_owner_type "LedgerOwnerType",
  p_owner_id uuid,
  p_diocese_id uuid,
  p_parish_id uuid
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT
    public.finance_can_write_ledger(p_owner_type, p_owner_id, p_diocese_id, p_parish_id)
    OR (
      -- Parish admin read-only oversight of parish org ledgers
      p_owner_type = 'ORGANIZATION'
      AND p_parish_id IS NOT NULL
      AND p_parish_id = public.jwt_parish_id()
      AND public.jwt_has_role(VARIADIC ARRAY['parish_admin','global_admin'])
    )
    OR (
      -- Diocese admin/staff read parish general ledgers only with grant (Tier-3)
      p_owner_type = 'PARISH'
      AND public.jwt_parish_id() IS NULL
      AND p_diocese_id = public.jwt_diocese_id()
      AND public.jwt_has_role(VARIADIC ARRAY['diocese_admin','diocese_staff','diocese_report_viewer','global_admin'])
      AND (
        public.has_active_grant(p_parish_id, 'LEDGER_DETAIL')
        OR public.has_emergency_access(p_parish_id)
      )
    );
$$;

-- Stewardship / vendor rows at diocese or parish scope (not polymorphic ledger)
CREATE OR REPLACE FUNCTION public.finance_can_manage_scope(
  p_diocese_id uuid,
  p_parish_id uuid
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT
    p_diocese_id = public.jwt_diocese_id()
    AND (
      public.jwt_has_role(VARIADIC ARRAY['global_admin'])
      OR (
        p_parish_id IS NULL
        AND public.jwt_parish_id() IS NULL
        AND public.jwt_has_role(VARIADIC ARRAY['diocese_admin','diocese_staff'])
      )
      OR (
        p_parish_id IS NOT NULL
        AND p_parish_id = public.jwt_parish_id()
        AND public.jwt_has_role(VARIADIC ARRAY['parish_admin','parish_staff'])
      )
    );
$$;

-- ── Ledger table policies ───────────────────────────────────
DO $$
DECLARE t text; pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Fund','Account','AccountingPeriod','JournalEntry','ApprovalPolicy','ApprovalRequest',
    'DonationBatch','VendorBill','Payment','Budget','ReconciliationRun','BankStatementLine'
  ]
  LOOP
    pol := lower(t) || '_ledger_rw';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, t);
    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR ALL
      USING (public.finance_can_read_ledger("ownerType", "ownerId", "dioceseId", "parishId"))
      WITH CHECK (public.finance_can_write_ledger("ownerType", "ownerId", "dioceseId", "parishId"))
    $f$, pol, t);
  END LOOP;
END $$;

-- JournalLine via parent
DROP POLICY IF EXISTS journalline_via_entry ON "JournalLine";
CREATE POLICY journalline_via_entry ON "JournalLine"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "JournalEntry" e
      WHERE e.id = "JournalLine"."journalEntryId"
        AND public.finance_can_read_ledger(e."ownerType", e."ownerId", e."dioceseId", e."parishId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "JournalEntry" e
      WHERE e.id = "JournalLine"."journalEntryId"
        AND public.finance_can_write_ledger(e."ownerType", e."ownerId", e."dioceseId", e."parishId")
    )
  );

-- ApprovalDecision via request
DROP POLICY IF EXISTS approvaldecision_via_request ON "ApprovalDecision";
CREATE POLICY approvaldecision_via_request ON "ApprovalDecision"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "ApprovalRequest" r
      WHERE r.id = "ApprovalDecision"."approvalRequestId"
        AND public.finance_can_read_ledger(r."ownerType", r."ownerId", r."dioceseId", r."parishId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ApprovalRequest" r
      WHERE r.id = "ApprovalDecision"."approvalRequestId"
        AND public.finance_can_write_ledger(r."ownerType", r."ownerId", r."dioceseId", r."parishId")
    )
  );

-- BudgetLine via budget
DROP POLICY IF EXISTS budgetline_via_budget ON "BudgetLine";
CREATE POLICY budgetline_via_budget ON "BudgetLine"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "Budget" b WHERE b.id = "BudgetLine"."budgetId"
        AND public.finance_can_read_ledger(b."ownerType", b."ownerId", b."dioceseId", b."parishId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Budget" b WHERE b.id = "BudgetLine"."budgetId"
        AND public.finance_can_write_ledger(b."ownerType", b."ownerId", b."dioceseId", b."parishId")
    )
  );

-- ── Scope-managed stewardship tables ────────────────────────
DO $$
DECLARE t text; pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ExternalDonor','Campaign','Donation','Pledge','Vendor','GivingStatement'
  ]
  LOOP
    pol := lower(t) || '_scope_rw';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, t);
    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR ALL
      USING (public.finance_can_manage_scope("dioceseId", "parishId"))
      WITH CHECK (public.finance_can_manage_scope("dioceseId", "parishId"))
    $f$, pol, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS donationallocation_via_donation ON "DonationAllocation";
CREATE POLICY donationallocation_via_donation ON "DonationAllocation"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "Donation" d WHERE d.id = "DonationAllocation"."donationId"
        AND public.finance_can_manage_scope(d."dioceseId", d."parishId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Donation" d WHERE d.id = "DonationAllocation"."donationId"
        AND public.finance_can_manage_scope(d."dioceseId", d."parishId")
    )
  );

-- Diocese grant read of parish donations
DROP POLICY IF EXISTS donation_diocese_grant_read ON "Donation";
CREATE POLICY donation_diocese_grant_read ON "Donation"
  FOR SELECT USING (
    public.jwt_parish_id() IS NULL
    AND "dioceseId" = public.jwt_diocese_id()
    AND "parishId" IS NOT NULL
    AND (
      public.has_active_grant("parishId", 'GIVING_DETAIL')
      OR public.has_emergency_access("parishId")
    )
  );

-- Member own-read (parish donations attributed to them)
DROP POLICY IF EXISTS donation_member_own_read ON "Donation";
CREATE POLICY donation_member_own_read ON "Donation"
  FOR SELECT USING (
    "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
    AND "parishId" = public.jwt_parish_id()
    AND status = 'ACTIVE'
  );

DROP POLICY IF EXISTS givingstatement_member_own_read ON "GivingStatement";
CREATE POLICY givingstatement_member_own_read ON "GivingStatement"
  FOR SELECT USING (
    "recipientType" = 'MEMBER'
    AND "memberId" = nullif(auth.jwt()->'app_metadata'->>'member_id','')::uuid
    AND "parishId" = public.jwt_parish_id()
  );

DROP POLICY IF EXISTS stripeevent_scope_read ON "StripeEvent";
CREATE POLICY stripeevent_scope_read ON "StripeEvent"
  FOR SELECT USING (
    "dioceseId" = public.jwt_diocese_id()
    AND public.finance_can_manage_scope("dioceseId", "parishId")
  );

-- Tier-2 aggregates: diocese sees parish giving sums (no donor PII)
CREATE OR REPLACE VIEW public.diocese_parish_giving_summary
  WITH (security_invoker = false)
AS
SELECT
  d."dioceseId" AS diocese_id,
  d."parishId" AS parish_id,
  date_trunc('month', d."receivedAt")::date AS period_start,
  (date_trunc('month', d."receivedAt") + interval '1 month - 1 day')::date AS period_end,
  COALESCE(f.name, 'Unallocated') AS fund_name,
  (sum(d."amountCents"))::bigint AS total_cents,
  count(*)::int AS donation_count
FROM "Donation" d
LEFT JOIN "Fund" f ON f.id = d."fundId"
WHERE d.status = 'ACTIVE'
  AND d."parishId" IS NOT NULL
  AND d."dioceseId" = public.jwt_diocese_id()
  AND public.jwt_has_role(VARIADIC ARRAY[
    'diocese_admin','diocese_staff','diocese_report_viewer','global_admin'
  ])
GROUP BY d."dioceseId", d."parishId", date_trunc('month', d."receivedAt"), f.name;

GRANT SELECT ON public.diocese_parish_giving_summary TO app_authenticated;

-- Organization.parishId may be null — ensure org RLS still works for parish match
-- (existing org policies use parishId; diocese-org policies may need a follow-up
--  if diocese-scoped org CRUD is exposed in UI. Ledger access above covers finance.)
