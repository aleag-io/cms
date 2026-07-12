-- ============================================================
-- R5 / M10 — Finance hardening: approval-gate + period-lock on post
-- Idempotent. Applies after 20260711000002_r5_finance_rls.sql.
-- ============================================================

-- ── Period lock also covers posting a DRAFT after its period closed ──
-- Previously fired only on INSERT / UPDATE OF "periodId", so a draft created
-- in an OPEN period and posted after the period CLOSED bypassed the lock.
CREATE OR REPLACE FUNCTION public.assert_period_open()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status "PeriodStatus";
BEGIN
  -- Only guard writes that place or keep an entry in a period: any INSERT, a
  -- period change, or a transition INTO POSTED. Draft edits and VOID pass.
  IF TG_OP = 'UPDATE'
     AND NEW."periodId" = OLD."periodId"
     AND NOT (NEW.status = 'POSTED' AND OLD.status IS DISTINCT FROM 'POSTED') THEN
    RETURN NEW;
  END IF;
  SELECT status INTO v_status FROM "AccountingPeriod" WHERE id = NEW."periodId";
  IF v_status IS NULL OR v_status = 'CLOSED' THEN
    RAISE EXCEPTION 'Cannot write JournalEntry into a closed/missing period';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS journal_period_open ON "JournalEntry";
CREATE TRIGGER journal_period_open
  BEFORE INSERT OR UPDATE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION public.assert_period_open();

-- ── Maker-checker DB backstop (exit gate #2) ────────────────
-- A MANUAL journal cannot reach POSTED without an APPROVED/AUTO_APPROVED
-- ApprovalRequest. System-generated entries (donations, Stripe, reversals,
-- vendor-bill/payment auto-journals) are gated by their own entity approval and
-- are exempt here (they carry a non-MANUAL source).
CREATE OR REPLACE FUNCTION public.assert_journal_approved()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'POSTED'
     AND OLD.status IS DISTINCT FROM 'POSTED'
     AND NEW.source = 'MANUAL' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "ApprovalRequest" r
      WHERE r."entityKind" = 'JOURNAL'
        AND r."entityId" = NEW.id
        AND r.status IN ('APPROVED', 'AUTO_APPROVED')
    ) THEN
      RAISE EXCEPTION 'MANUAL journal % cannot post without an approved request', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS journal_approval_gate ON "JournalEntry";
CREATE TRIGGER journal_approval_gate
  BEFORE UPDATE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_approved();
