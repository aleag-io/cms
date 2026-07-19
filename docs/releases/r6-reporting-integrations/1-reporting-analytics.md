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

---

## Delivery notes (2026-07-18)

**Shipped.** Report registry + role-safe exports, the annual Receipts & Payments statement, the
Global Finance Approval Policy Dashboard, richer diocese Tier-2 dashboards (deferred from R3), plus
the M12 integrations covered in [2-integrations.md](./2-integrations.md).

### Report framework

`lib/reports/` is a code-defined registry. Each `ReportDefinition` declares its scope
(parish/diocese), the roles allowed to run it, whether it needs a ledger owner, its parameters, and
a `run(tx, ctx, params)` that returns a `ReportResult`. One generic route serves them all:

- `GET /api/reports` — catalog for the caller's roles and portal.
- `GET /api/reports/[id]?format=json|csv|pdf&…` — run and render.

Rows are **flat records of display-ready cells**. That is what lets one CSV renderer, one PDF
renderer, and — critically — the cross-cutting leak gate iterate every entry generically: adding a
report puts it under the gate with no test edit. `renderReportPdf` consumes *only* a `ReportResult`
(a unit test asserts it imports no data-layer module), so scanning the JSON covers the PDF.

Reports shipped: `receipts-payments`, `membership-status`, `sacramental-register`,
`program-attendance`, `event-attendance`, `giving-summary`, `pledge-fulfillment`,
`income-vs-budget`, `fund-balances`, and the diocese-scope `diocese-membership`,
`diocese-sacramental`, `diocese-giving`, `diocese-pledges`.

### Receipts & Payments

Cash-basis annual statement modeled on the real parish annual report: receipts are `GivingCategory`
line items grouped by `section`; payments are expense accounts grouped by the new
`Account.reportSection`; Budget/Actual/Variance come from the fiscal-year `Budget`. Income accounts
carry credit balances, so actuals are flipped positive; expense accounts stay debit-positive.
Income with no category falls into "Other receipts"; expenses with a null section into "Other
payments" — so no activity can silently vanish from the statement.

`seedDefaultChart` now sets `reportSection` on the default expense accounts **and backfills it onto
existing rows**, otherwise ledgers seeded before R6 would report everything under "Other payments".

### New diocese Tier-2 views

`diocese_approval_policy_dashboard`, `diocese_approval_request_summary`,
`diocese_parish_membership_trend`, `diocese_parish_sacramental_summary`,
`diocese_parish_attendance_summary`, `diocese_parish_event_summary`,
`diocese_parish_pledge_summary` — all self-securing (`security_invoker = false` with the diocese and
reporting-role predicate baked into the view body), counts and sums only.

### Access control

Two permission resources added: `report` (read/export) and `member_import` (write), so
`/settings/permissions` can govern who runs and exports reports. **`diocese_report_viewer` had no
entry in `DEFAULT_PERMISSIONS` at all** — a silent-403 trap for the one role whose entire purpose is
reporting; R6 adds it. `MEMBER` appears in no report definition (PA-22): members see their own
giving through R5 self-service statements, and giving reports are category/month aggregates with no
donor identities. Membership demographics are status × gender only — deliberately no DOB or age
bands, keeping pastoral dates out of report surfaces entirely.

### Exit gate

`tests/integration/api/r6-sensitive-leak.test.ts` poisons the fixture parish with unique sentinel
values (work notes, private note, pastoral dates, sacramental notes, donation dedication) and sweeps
every registry report × permitted role × json/csv, the member CSV export per role, all ten diocese
views, and every stored webhook payload. It asserts a minimum number of surfaces actually checked,
so the sweep cannot silently pass by checking nothing.

### Deferred

- **RP-3 ad-hoc query builder → R7.** Highest leak surface in the release; wanted the registry-driven
  gate proven first.
- **IN-1 public REST API + scoped API keys → later.** No external consumer exists yet.
- **Real `.xlsx` export.** CSV opens in Excel; not worth a heavyweight dependency until asked for.
- **Resend/Twilio production adapters** — see [2-integrations.md](./2-integrations.md) §3.
