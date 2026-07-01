# Delivery Plan — Phased MVPs with Test Gates

## Purpose

This document breaks the CMS requirements (see [requirements.md](requirements.md),
[features.md](features.md), [access-control.md](access-control.md),
[user-roles.md](user-roles.md)) into **incremental, independently shippable phases**.
Each phase has a clear scope, the requirement IDs it satisfies, the tests written
*as part of* the work, and a **validation gate** that must pass before the next phase
starts.

Two principles drive the ordering:

1. **Security and tenancy first.** Parish data sovereignty (RLS, audit, isolation) is
   the spine of this product. It is built and tested before any feature rides on top
   of it — retrofitting isolation later is how tenant-leak bugs ship.
2. **Tests are written with the code, not after.** Every phase adds to a living test
   suite. A phase is not "done" because the UI renders; it is done when its validation
   gate is green in CI.

### Current baseline (starting point)

- Next.js 16 (App Router) + React 19, Prisma 6 schema with `Diocese`, `Parish`,
  `AppUser`, `Family`, `Member`, `AuditEntry`.
- Placeholder auth (`lib/auth.ts` — cookie holding a user id). **Not** Supabase Auth yet.
- A few API routes (`bootstrap`, `members`, `families`, `parishes`, `session`, `audit`)
  and an `mvp1-console` page.
- **No test framework, no RLS, no CI test gate.** Phase 0 fixes this.

---

## Testing strategy (applies to every phase)

The stack maps to a concrete test pyramid. We set this up in Phase 0 and add to it
continuously.

| Layer | Tool | What it covers | Runs |
| ----- | ---- | -------------- | ---- |
| Static | `tsc --noEmit`, `eslint` | Types, lint rules | Every PR (fast) |
| Unit | **Vitest** | Pure logic: ID formatting, permission resolver, double-entry balancing, anonymization projection, redaction | Every PR |
| Integration (API + DB) | **Vitest** against an ephemeral Postgres (Supabase local / Testcontainers) | Route handlers + Prisma against a real DB, audit rows written, validation errors | Every PR |
| **RLS / policy** | **pgTAP** (SQL) + Vitest using per-role JWT-claim DB sessions | Row-level isolation: Parish A cannot read Parish B; grant gates Tier-3 access; private notes clergy-only; pastoral-date masking | Every PR — **first-class, not optional** |
| E2E | **Playwright** | Critical user journeys per role through the real UI | Every PR (smoke) + nightly (full) |
| Accessibility | `@axe-core/playwright` | WCAG 2.1 AA on key screens | Nightly + pre-release |
| Performance / load | **k6** (or autocannon) | p95 latency, aggregate-query budgets, search at 100k rows | Pre-release per phase that ships hot paths |

**RLS testing is the highest-leverage investment.** Because access control is enforced
at the database layer, the authoritative tests run SQL as a simulated user (setting the
`request.jwt.claims` GUC / `app_metadata`) and assert *zero rows* are returned across the
boundary — not just that the UI hides a button. Every protected table gets a
"cross-tenant returns nothing" test the moment its RLS policy lands.

**Test data:** a deterministic seed builds a fixed fixture diocese with ≥2 parishes,
overlapping roles (including multi-parish clergy), and sample families/members. The same
seed powers integration, RLS, and E2E runs so scenarios are reproducible.

**Definition of Done (every issue):** code + tests merged; access-control behavior
verified by a test; audit entry asserted where the action is auditable; docs/changelog
updated. (This matches the DoD already drafted in `.tmp/create_github_issues.sh`.)

---

## Phase map at a glance

| Phase | Theme | Primary requirements | Exit gate headline |
| ----- | ----- | -------------------- | ------------------ |
| 0 | Engineering foundations & test harness | NFR tooling, CI/CD | CI runs unit+integration+RLS+E2E; coverage gate on |
| 1 | Identity, tenancy & core membership | MT-1–6, AU-1–11, FM-*, MM core, SE-3/6 | Parish A cannot touch Parish B (proven by RLS tests) |
| 2 | Intra-parish access control & sensitive fields | MM-12/15/18/19, PA-11/12, SE-9 | Private notes clergy-only & pastoral dates masked (RLS-proven) |
| 3 | Parish operations | PA-3/4/5/6/8/14/15/16, MM-8 | Exclusive-membership constraint enforced at DB layer |
| 4 | Data-sharing governance & diocese aggregate | MT-5/7–15, DA-1/6, SE-4 | Grant gates Tier-3; revocation immediate; aggregates never leak rows |
| 5 | Finance core | PA-9/13/17–24, giving | Ledger always balances; maker-checker enforced; periods lock |
| 6 | Reporting, statements & integrations | RP-*, IN-* | Exports respect role projections; Stripe webhook idempotent |
| 7 | Hardening: performance, security, a11y, DR | PE-*, SE-5/7, UX-2, AV-* | p95 targets met; security review closed; WCAG AA; DR drill passed |

Phases 1–4 are the **secure platform**. Phases 5–6 are **feature breadth**. Phase 7 is
**production readiness** and can partly overlap once Phase 4 lands. Phases 5 and 6 have
some independence and can be parallelized by a second stream if staffing allows, but both
depend on Phases 1–4.

---

## Phase 0 — Engineering Foundations & Test Harness

**Goal:** make it impossible to merge untested code, and stand up the environments the
later phases assume.

**Deliverables**
- Test runners wired: Vitest (unit + integration), Playwright (E2E), pgTAP harness for
  RLS, axe + k6 scaffolding.
- Supabase local stack reproducible; ephemeral test DB spun up per CI run; deterministic
  seed/fixtures script.
- GitHub Actions pipeline: `typecheck → lint → unit → integration → rls → e2e-smoke`,
  with coverage threshold and required-status-check on `main`.
- Decide and document the Prisma ↔ Supabase migration story (Prisma for schema,
  Supabase SQL migrations for RLS policies/triggers/views) so they coexist cleanly.
- Replace the placeholder cookie auth seam with an injectable session interface so Phase 1
  can drop in Supabase Auth without rewriting callers.

**Tests written this phase**
- A trivial unit test, an integration test that hits one existing route against the test
  DB, one RLS smoke test, and one Playwright smoke test — all green in CI. This proves
  every layer of the pyramid actually runs before features arrive.

**Validation gate (Phase 0 exit)**
- A PR that drops below the coverage threshold or breaks any suite is **blocked by CI**.
- `make`/npm scripts run the full suite locally in one command.
- Seeded fixture DB is identical across local and CI.

---

## Phase 1 — Identity, Tenancy & Core Membership

**Goal:** a secure, multi-tenant baseline. Real auth, real isolation, real audit, and the
Diocese → Parish → Family → Member core.

**Requirements covered:** MT-1–6, AU-1–11, IN-7, FM-1–7, MM-1/6/10/16, SE-3/6, parts of
DA (parish provisioning), PA-1/2.

**Deliverables**
- Supabase Auth integration (email/password to start), `@supabase/ssr` session handling,
  JWT custom claims injecting `diocese_id`, `parish_id`, `roles` (architecture §4.2).
- Baseline **deny-by-default RLS** for every tenant-scoped table: a row is visible only to
  its own parish (or diocese-level structural reads).
- Append-only **audit utility** with correlation IDs, used by auth events and all CRUD;
  no update/delete path for audit rows (AU-10).
- Diocese/parish onboarding + parish profile (PA-1); assign Parish Admin (provisioning).
- Family CRUD + configurable family-number scheme (MM-10) and derived member identifier
  `<family>.<index>` (MM-16).
- Member CRUD (create/update/deactivate/transfer-stub) with status lifecycle (MM-6).

**Tests written this phase**
- Unit: family-number formatter (prefix/width/start), member-identifier derivation,
  uniqueness rules.
- Integration: each route writes the expected audit entry; validation rejects bad input;
  unauthorized/forbidden paths return correct status.
- **RLS (the centerpiece):** as a Parish-A user, every read/write against Parish-B rows
  returns zero rows / is rejected — for members, families, and audit. Diocese user sees
  Tier-1 structural data but **zero** raw member rows (SE-3).
- E2E: Parish Admin logs in, creates a family, adds a member, deactivates a member.

**Validation gate (Phase 1 exit)**
- RLS cross-tenant suite proves Parish A ⟂ Parish B for all Phase-1 tables.
- Every audited action has an asserted audit row; audit table rejects mutation.
- Auth/session E2E passes for at least Diocese Admin and Parish Admin roles.

---

## Phase 2 — Intra-Parish Access Control & Sensitive Fields

**Goal:** correct *within-parish* visibility — the subtle, high-risk privacy rules.

**Requirements covered:** MM-11/12/13/14/15/17/18/19, PA-11/12, SE-9, role model from
[user-roles.md](user-roles.md) §2–3, intra-parish tiers from [access-control.md](access-control.md) §1.2.

**Deliverables**
- Parish officers/board (PA-11) and automatic **Clergy** role derivation from
  `ParishOfficer` where `officer_type = 'clergy'`.
- **Private notes**: clergy-only read/write, RLS-enforced, scoped per-parish for
  multi-parish clergy (MM-12, MM-19); excluded from every export/report/share.
- **Pastoral-sensitive date** masking (DOB, anniversary, sacramental dates) — visible only
  to Vicar/Clergy, Parish Admin, Pastoral Data Accessor (MM-15, SE-9).
- **Work notes** restricted to Parish Admin/Staff/responsible org leaders; never exported
  (MM-18).
- Parish **member directory** (basic fields only) for same-parish members (MM-14).
- Extended family relationships across family records (MM-13).
- Multi-parish membership with one primary parish (MM-17).
- Granular **permission resolver** + Church Admin Settings → Permissions matrix (PA-12):
  per-role/resource/action overrides above/below defaults; "can't grant what you don't
  hold"; overrides audited.

**Tests written this phase**
- Unit: permission resolver truth table (defaults + overrides + escalation guard);
  anonymization/field-projection helpers that strip private notes & work notes.
- **RLS:** non-clergy (incl. Parish Admin) get **no** `private_notes` column/rows;
  multi-parish clergy see private notes only for their clergy parishes; member directory
  query returns basic fields and **excludes** pastoral dates for non-privileged roles.
- Integration: directory endpoint and member export confirm sensitive fields absent;
  override changes write audit rows.
- E2E: Member role sees directory without DOB; Clergy sees private notes; Parish Staff does
  not.

**Validation gate (Phase 2 exit)**
- An automated test asserts every sensitive field (`private_notes`, work notes, pastoral
  dates) is absent from directory output, exports, and a non-privileged role's API
  responses.
- Multi-parish clergy scoping proven by RLS test.

---

## Phase 3 — Parish Operations

**Goal:** the day-to-day parish modules members and staff actually use.

**Requirements covered:** PA-3/4/5/6/8/14/15/16, MM-3/4/8, features §2.4–2.7, §2.10,
§2.2.4.

**Deliverables**
- Programs & ministries with enrollment + session attendance (PA-3, MM-3/4); Ministry
  Leader scoping (RLS to own program).
- Organizations with **required type** (PA-14), membership mode default-from-type
  (`exclusive` for Prayer Group) (PA-15), and **DB-enforced exclusive constraint** —
  PostgreSQL partial unique index / trigger per PA-16; org officers.
- Events: create/recurrence/RSVP/attendance/reminders (PA-4); facilities + booking
  conflict detection (PA-5).
- Communications: email (Resend) + SMS (Twilio), audience selection, templates, opt-out
  (PA-8); async send via background job with status.
- Staff/volunteer management & role assignment (PA-6).
- Member self-registration + approval queue (MM-8), configurable auto-approve.

**Tests written this phase**
- **DB constraint test (critical):** adding a member to a second exclusive org of the same
  type in the same parish is rejected *at the database layer* (PA-16), with the app
  surfacing the resolve-conflict workflow. Open mode allows multiple.
- Unit: recurrence expansion, booking-conflict detector, opt-out filter.
- Integration: RSVP capacity limits, attendance recording, self-registration creates a
  pending member that is invisible in the directory until approved; comms send enqueues a
  job and records delivery status; outbound providers are mocked.
- RLS: Ministry Leader sees only own-program rosters; Organization Leader only own org.
- E2E: create event → RSVP → record attendance; create exclusive org → blocked duplicate.

**Validation gate (Phase 3 exit)**
- Exclusive-membership constraint proven by a failing-insert test, not just UI validation.
- Ministry/Org leader scoping proven by RLS tests.
- A queued communication is sent (against mocked providers) with delivery status and
  opt-out respected.

---

## Phase 4 — Data-Sharing Governance & Diocese Aggregate

**Goal:** the parish-data-sovereignty sharing model and the diocese's aggregate-only view.

**Requirements covered:** MT-5/7–15, DA-1/6, AU-12/13, SE-4, access-control §2–3, §6,
architecture §3.2.1–3.2.2.

**Deliverables**
- `DataSharingRequest` lifecycle (diocese creates → parish approves/rejects/auto-expire)
  with notifications (MT-8); `DataSharingGrant` create/scope/expiry/revoke (MT-9/10/11).
- **Grant-aware RLS**: Tier-3 raw data readable by diocese roles **only** when an active,
  unexpired, category-matched grant exists (access-control §6.1). Revocation immediate +
  cache invalidation within the request (MT-11).
- Tier-2 **aggregate views / materialized views** — counts and totals only, never raw rows
  (access-control §6.2); diocese dashboard (DA-1) and aggregate reports (DA-6).
- **Emergency Access** override (≤7 days, justification, audited, view-only, no re-share)
  (MT-12).
- Universal **contextual sharing**: `user_share` / `role_share` / `secure_link` with
  hashed tokens (constant-time compare), expiry, max-views, anonymized projection,
  immediate revoke (MT-13/14/15, AU-12/13).
- Parish Data Sharing Manager + Diocese Report Viewer roles.

**Tests written this phase**
- **RLS (the centerpiece):** no grant → diocese query returns zero raw rows; active grant
  → exactly the granted category, nothing adjacent (`member_directory` grant does **not**
  expose `sacramental_records`); expired grant → zero rows; revoked grant → zero rows on
  the very next query.
- Unit: token hashing + constant-time compare; anonymized projection excludes direct
  identifiers & private notes; aggregate view exposes only counts (schema assertion: no PII
  columns).
- Integration: full request→approve→grant→revoke flow writes the audit entries listed in
  access-control §7; emergency access creates the special grant, notifies, expires; secure
  link denies when expired/exhausted/revoked.
- E2E: parish approves a request; diocese reads shared data then loses it on revoke
  ("no longer available").

**Validation gate (Phase 4 exit)**
- Category-scoping and expiry/revocation proven by RLS tests (the core sovereignty
  guarantee).
- Aggregate views proven to contain no row-level PII.
- Every sharing lifecycle event has an asserted audit entry; secure-link tokens never
  stored or logged in plaintext (asserted).

---

## Phase 5 — Finance Core

**Goal:** a correct double-entry ledger with governed posting — the highest-correctness-risk
area.

**Requirements covered:** PA-9/13/17/18/19/20/21/22/23/24, features §2.11.

**Deliverables**
- Chart of accounts + double-entry **journal posting engine** with balancing invariant
  (PA-9); organization-optional separate ledger (PA-13).
- Periods: open/close, **reopen super-admin + mandatory audit reason** (PA-21).
- Budgets by account/fund, original/revised/variance (PA-17); cash vs accrual basis
  (PA-18).
- Donations (family-level default; member-attributed reports) (PA-22), campaigns, pledges;
  donations auto-generate journal entries.
- Vendor bills & payments lifecycle (PA-19); bank reconciliation via **CSV import only**
  (PA-20).
- **Maker-checker** approval engine: `strict`/`threshold_based`/`hybrid`, per-scope
  (diocese/parish/org), thresholds + approver sets, independent per-entity selection
  (PA-23/24).
- Stripe webhook ingestion (idempotent) creating donation + ledger rows.

**Tests written this phase**
- **Unit (property-based where useful):** every posting balances (Σdebits = Σcredits);
  unbalanced entries rejected; basis switch reclassifies correctly; member vs family
  statement attribution never auto-allocates family donations to members (PA-22).
- Approval engine truth table: below/above threshold routes correctly per mode; maker
  cannot self-approve; org policy independent of parish default.
- Integration: closed period rejects posting; reopen requires reason and writes immutable
  audit; Stripe webhook **replayed twice creates one** donation (idempotency); CSV
  reconciliation matches and flags unmatched.
- RLS: parish ledger isolated; org leader sees only own-org ledger; parish admin read-only
  across org ledgers.
- E2E: month-end close scenario; vendor bill → approve → pay.

**Validation gate (Phase 5 exit)**
- Ledger-balances invariant holds across a randomized posting suite.
- Maker-checker enforced (no self-approval; threshold routing correct).
- Period lock + audited reopen proven; Stripe idempotency proven by double-delivery test.

---

## Phase 6 — Reporting, Statements & Integrations

**Goal:** turn the data into role-safe reports, statements, and external interfaces.

**Requirements covered:** RP-1–9, IN-1/2/3/4/5/6, features §4, §2.11.9/.10.

**Deliverables**
- Standard reports (membership, sacramental, attendance, program, giving, pledge) at
  diocese/parish scope (RP-1/4); exports PDF/CSV/Excel (RP-2).
- Annual giving statements — family and member-only variants (RP-5/8); financial report
  pack (RP-6/7).
- Ad-hoc query builder for power users (RP-3); operational workflow-policy view (RP-9) +
  Global Finance Approval Policy Dashboard (DA-12).
- REST API for integrations (IN-1); webhooks for key events (IN-2); CSV import/export
  (IN-3); confirm Resend/Twilio/Stripe wiring (IN-4/5/6).

**Tests written this phase**
- **Projection tests:** every export/report respects role projections — private notes,
  work notes, and pastoral dates never appear for unauthorized recipients; anonymized
  shares strip identifiers. (Reuse Phase 2/4 projection assertions against report output.)
- Unit: report aggregation math vs known fixtures; statement totals reconcile to ledger.
- Integration: export format integrity (CSV parses, PDF generated, Excel opens); REST API
  authz per role; webhook signature verification + retry.
- RLS: a diocese report over shared data shows only granted categories; report viewer gets
  summary-only.
- E2E: generate and download a family giving statement; run a standard report and export.

**Validation gate (Phase 6 exit)**
- A single "sensitive-field leak" test runs across **all** report/export/share outputs and
  passes (no private notes / work notes / pastoral dates / PII leakage).
- REST API and webhooks pass authz + signature + idempotency tests.

---

## Phase 7 — Hardening: Performance, Security, Accessibility, DR

**Goal:** meet the non-functional bar for production.

**Requirements covered:** PE-1–12, SE-1/2/5/7/8, AV-1–4, UX-1–15, SC-1–3, AU resilience.

**Deliverables**
- Performance: indexes per architecture §9.3, pagination everywhere (PE-7), tsvector
  member search (PE-11), aggregate query budget (PE-12), bundle/code-split budget (PE-10),
  `next/image` for photos (PE-9), caching/ISR for reference data (PE-8).
- Security: full RLS hardening pass + external/security-review skill run; audit-tamper
  alerting (SE-7); secret redaction in audit payloads (SE-8); TLS/at-rest confirmation.
- Accessibility: WCAG 2.1 AA audit closure (UX-2/10/11) via axe + manual keyboard pass.
- Reliability: backup/restore + **DR drill** (AV-2/3); audit pipeline resilience/lag
  alerting (AV-4).
- UX polish: skeletons, optimistic UI, empty states, toasts, confirmation dialogs
  (UX-4–9), role-aware nav (UX-12).

**Tests written this phase**
- **k6 load tests** asserting p95 budgets: API ≤500 ms (PE-5), DB queries ≤200 ms (PE-6),
  search ≤1 s at 100k rows (PE-11), diocese aggregate ≤3 s over 200 parishes (PE-12).
- Bundle-size CI check (no route chunk >200 KB gzipped, PE-10).
- axe accessibility assertions on all key screens; keyboard-only E2E path.
- A restore-from-backup drill validated against the seeded dataset; audit-tamper attempt
  raises an alert + immutable entry (SE-7).

**Validation gate (Phase 7 / release):**
- All p95 performance budgets met under load test.
- Security review findings triaged to zero criticals; RLS hardening pass signed off.
- WCAG AA automated + manual checks pass on key flows.
- DR drill completes within RPO; audit resilience alerting verified.

---

## How to run a phase (the repeating loop)

For each phase:

1. **Plan** — turn the phase deliverables into issues (the `.tmp/create_github_issues*.sh`
   drafts are a starting point; expand them to match the phases above).
2. **Build test-first where it pays** — for RLS, finance invariants, and permission rules,
   write the failing assertion before the implementation.
3. **Implement** behind the existing CI gates.
4. **Run the validation gate** — the phase's exit criteria are encoded as a labeled test
   suite (e.g. `@phase:4 @rls`). The phase ships only when that suite is green.
5. **Demo + sign-off** against the gate, then start the next phase.

## Suggested sequencing & parallelism

- **Strictly sequential:** 0 → 1 → 2 → 4 (the security spine). Do not start sharing
  (Phase 4) before intra-parish access control (Phase 2) is proven.
- **Can overlap:** Phase 3 (operations) can run alongside the back half of Phase 2.
  Phases 5 and 6 can be a parallel stream once Phase 4 lands.
- **Continuous:** Phase 7's performance indexes and a11y patterns should be applied as each
  feature lands, with a dedicated hardening pass at the end rather than deferring all of it.
