# Reporting, Statements & Integrations  *(Release R6 · Modules M11, M12)*

> **Release R6 — Reporting & Integrations · Modules M11, M12.** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Aggregates data from every prior
> module into role-safe reports and opens the external interfaces. Its role-specific UI
> (report/statement builders, export surfaces) is built with this release, reusing the R1 design
> system.

**Goal:** turn the data into role-safe reports, statements, and external interfaces.

**Requirements covered:** RP-1–9, IN-1/2/3/4/5/6, features §4, §2.11.9/.10.

---

## Deliverables

- Standard reports (membership, sacramental, attendance, program, giving, pledge) at
  diocese/parish scope (RP-1/4); exports PDF/CSV/Excel (RP-2).
- Annual giving statements — family and member-only variants (RP-5/8); financial report pack
  (RP-6/7).
- Ad-hoc query builder for power users (RP-3); operational workflow-policy view (RP-9) + Global
  Finance Approval Policy Dashboard (DA-12).
- REST API for integrations (IN-1); webhooks for key events (IN-2); CSV import/export (IN-3);
  confirm Resend/Twilio/Stripe wiring (IN-4/5/6).

## Tests written this release

- **Projection tests:** every export/report respects role projections — private notes, work
  notes, and pastoral dates never appear for unauthorized recipients; anonymized shares strip
  identifiers. (Reuse the R0 access-control + R3 sharing projection assertions against report
  output.)
- Unit: report aggregation math vs known fixtures; statement totals reconcile to ledger.
- Integration: export format integrity (CSV parses, PDF generated, Excel opens); REST API authz
  per role; webhook signature verification + retry.
- RLS: a diocese report over shared data shows only granted categories; report viewer gets
  summary-only.
- E2E: generate and download a family giving statement; run a standard report and export.

## Validation gate (exit)

- A single "sensitive-field leak" test runs across **all** report/export/share outputs and passes
  (no private notes / work notes / pastoral dates / PII leakage).
- REST API and webhooks pass authz + signature + idempotency tests.

## Dependencies

Depends on the data produced by R0–R5 (people, operations, sharing, sacramental, finance & giving).
