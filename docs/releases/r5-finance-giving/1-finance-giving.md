# Phase 20 Implementation Plan — Finance & Giving  *(Release R5 · Module M10)*

> **Release R5 — Finance & Giving · Module M10.** Giving (donations, campaigns, pledges, annual
> statements, Stripe ingestion) ships in the **same** module/release as the general ledger —
> donations post directly into it, so they are not split. Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 20. This turns that phase's
> deliverables into an ordered, implementable work breakdown with the concrete
> architectural decisions, schema/migrations, RLS policies, invariant-enforcing triggers,
> API surface, **UI**, and tests required to reach the **Phase 20 exit gate**. It builds
> directly on the Phase 1–4 spine: `withTenant`, deny-by-default + forced RLS, the claims
> pipeline (incl. `org_leader_ids` and the `current_org_leader_ids()` SECURITY DEFINER
> helper), the permission resolver, append-only audit, the Phase 4 grant-aware Tier-3
> pattern (`has_active_grant()`), and the R1 shell/UI conventions
> ([r1 design-system-shell](../r1-people-core/1-design-system-shell.md)). It also carries
> forward the two hardening patterns learned in R4 (see
> [r4-sacramental-liturgical/1-sacramental-records.md](../r4-sacramental-liturgical/1-sacramental-records.md)
> Changelog): PA-12 overrides enforced **in RLS** via `permission_decision()` where finance
> overrides apply, and validated request bodies via a `lib/finance/validate.ts` module rather
> than ad-hoc per-route checks.
>
> **2026-07-11 revision:** this plan previously covered only the backend (schema, RLS, API,
> exit-gate tests) — module-delivery-plan.md lists R5 as **"M10 (backend + UI)"**, so §§14–22
> (giving statements/pledge reminders + eight UI PRs), the non-goals, files-to-touch, and
> Definition of Done sections below are new. See the [Changelog](#changelog) at the bottom.

**Phase goal:** a correct double-entry ledger with governed posting — the
highest-correctness-risk area of the system — **and** the screens a parish treasurer,
organization leader, and diocese finance viewer actually use to run it. Every posting
balances at the **database layer** (not just the app), closed periods reject writes,
organization ledgers are isolated from the parish general ledger, and every journal, bill,
and payment flows through a configurable maker-checker approval engine. Diocese users see
finance data only as Tier-2 aggregates unless a `ledger_detail` / `giving_detail` grant
exists (Phase 4 pattern extended to the new tables). The UI never becomes a second
enforcement point — every screen renders exactly what the RLS-guarded, role-projected API
returns.

**Requirements covered:** PA-9, PA-13, PA-17, PA-18, PA-19, PA-20, PA-21, PA-22, PA-23,
PA-24; features §2.11 (all thirteen sub-sections, including §2.11.7 pledge reminders and
§2.11.10 annual giving statements — both previously unaddressed in this plan); access-control
§2–3 (finance categories), §5, §7.

**Exit gate (must all be green in CI):**
1. **Ledger-balances invariant holds (unit + integration, property-based):** across a
   randomized suite of postings, every committed `JournalEntry` satisfies Σdebits = Σcredits;
   an unbalanced entry is **rejected by the database** (not only the app), proven by writing
   directly to the table inside a `withTenant` transaction and asserting the constraint fires.
2. **Maker-checker enforced (unit + integration):** approval-mode truth table routes
   below/above threshold correctly for `strict` / `threshold_based` / `hybrid`; a maker can
   **never** self-approve; an organization policy is independent of its parish default; an
   unapproved journal/bill/payment cannot post.
3. **Period lock + audited reopen (integration):** posting into a `CLOSED` period is rejected
   at the DB layer; reopen is permitted **only** for `GLOBAL_ADMIN` and requires a
   non-empty reason; the reopen writes an immutable `finance.period.reopen` audit entry.
4. **Stripe idempotency (integration):** the same Stripe event delivered **twice** creates
   exactly **one** donation and **one** balanced journal entry.
5. **Finance RLS (rls):** a parish's ledger is isolated from other parishes; an org leader
   reads/writes only their own organization's ledger; a parish admin has **read-only** access
   across org ledgers in their parish; a diocese role sees **zero** raw ledger/donation rows
   without a grant, and only `summary_only`/`period_scoped` aggregates otherwise (PA-22:
   family donations are never auto-allocated to member statements).
6. **UI (e2e + a11y):** every finance surface is axe-clean; a member never sees another
   family's donations or another organization's ledger in the DOM; an organization leader's
   ledger switcher never lists an organization they do not lead; a diocese user without a
   grant sees the Tier-2 aggregate view only — no raw-row table renders, not even empty rows
   with a 403 swallowed client-side.
7. **Giving statements (integration):** a generated member statement's line items are a strict
   subset of that member's `memberId`-attributed donations; a family statement never appears
   inside a member statement's line items; re-running generation for an already-sent period is
   idempotent (no duplicate `finance.statement.send` audit rows for the same recipient/period).

---

## 1. Current state (Phase 4 exit)

| Area | State | Evidence |
| ---- | ----- | -------- |
| Tenant isolation + `withTenant` | ✅ forced RLS on all tenant tables | `lib/db/withTenant.ts` |
| Claims pipeline | ✅ incl. `org_leader_ids`, `program_leader_ids`, `member_id` | `lib/auth.ts` |
| Sub-parish leader scoping | ✅ `current_org_leader_ids()` SECURITY DEFINER helper | `supabase/migrations/20260629182000_*_rls.sql` |
| Grant-aware Tier-3 RLS | ✅ `has_active_grant()` / `has_emergency_access()`; Member+Family wired | `supabase/migrations/20260630000002_*_rls.sql` |
| PA-12 override enforcement in RLS | ✅ `public.permission_decision()` pattern proven on Sacramental/Pastoral tables | `supabase/migrations/20260710100000_r4_hardening_rls.sql` |
| Finance sharing categories | ✅ `GIVING_DETAIL`, `GIVING_STATEMENTS`, `FINANCIAL_STATEMENTS`, `LEDGER_DETAIL` in `DataCategory` | `prisma/schema.prisma` |
| Append-only audit | ✅ `writeAuditEntry`, revoke+trigger on `AuditEntry` | `lib/audit.ts` |
| Permission resolver + overrides | ✅ role×resource×action with `ParishPermissionOverride` | `lib/permissions/*` |
| App shell, nav, DataTable/patterns | ✅ `components/patterns/*`, `lib/nav/menu.ts`, tenant-context ("work in parish") control | R1 Phase 5 |
| Communications queue + provider seam | ✅ `Message`/`MessageRecipient`, `lib/communications/providers.ts` (`CommProvider.send`, no attachment support yet) | Phase 3 |
| Finance schema | ❌ none — no accounts, journals, periods, donations, budgets, vendors, approvals | greenfield |
| Money/decimal convention | ❌ not established | — |
| Stripe / CSV tooling | ❌ no `stripe` SDK, no CSV parser dependency | `package.json` |
| Finance UI | ❌ none | greenfield |
| PDF generation | ❌ no PDF library in the dependency tree (R4 certificates used print-CSS only) | `package.json` |

**The headline shift:** Phases 1–4 governed *who can read which rows*. Phase 20 introduces
*correctness invariants on writes* — double-entry balancing, period locks, and maker-checker
approval — that must be enforced by the database so the ledger cannot be corrupted by an
app bug, a bad migration, or a direct SQL write inside a tenant transaction. The DB is still
the sole enforcement point; the application layer surfaces and orchestrates the workflow —
including, in this revision, the screens that make the workflow usable.

---

## 2. Central decisions

### 2.1 Money is stored as integer minor units (cents), BIGINT, currency fixed to USD (v1)

All monetary columns are `amountCents BIGINT NOT NULL` (a signed value where the column
context makes sign meaning explicit). Integer arithmetic guarantees the balancing invariant
is **exact** — no floating-point drift can make Σdebits ≈ Σcredits pass by rounding. The
Prisma type is `BigInt`; the API serializes to a string or number-of-cents and formats to
dollars only at the presentation edge. A single `currency` column (`CHAR(3)` default
`'USD'`) is stored for forward-compatibility but v1 asserts USD everywhere; mixed-currency
math is out of scope. **Never** use `Float`/`Decimal`-as-double for amounts.

### 2.2 Double-entry: `JournalEntry` header + `JournalLine` lines, balanced by a DB constraint trigger

A posting is one `JournalEntry` (date, description, reference, period, ledger owner, status)
with ≥2 `JournalLine` rows. Each line carries `accountId`, `direction` (`DEBIT`/`CREDIT`),
and `amountCents ≥ 0`. The balancing invariant — `Σ(amountCents WHERE DEBIT) =
Σ(amountCents WHERE CREDIT)` for each entry — is enforced by a **`CONSTRAINT TRIGGER …
DEFERRABLE INITIALLY DEFERRED`** on `JournalLine` that fires at COMMIT, so multi-line
inserts within a transaction are validated as a set, not row-by-row. The app-side posting
engine (`lib/finance/posting.ts`) also validates and is the primary UX path, but the trigger
is the **load-bearing** backstop and is what exit-gate #1 asserts.

Additional DB-enforced invariants (all via triggers/constraints, not app-only):
- An entry must have ≥2 lines and a non-zero total (reject empty/one-sided entries).
- A `POSTED` entry is **immutable**: `UPDATE`/`DELETE` on posted `JournalEntry`/`JournalLine`
  is blocked by trigger (corrections are made by posting a **reversing** entry, features §2.11.2).
- All lines of an entry reference accounts belonging to the **same ledger owner** as the entry
  (no cross-ledger journal lines).

### 2.3 Ledger ownership: one polymorphic ledger keyed by `(ownerType, ownerId)`

`ownerType` ∈ `PARISH | ORGANIZATION` and `ownerId` is the parish or organization id. Chart
of accounts (`Account`), `JournalEntry`, `Budget`, and approval policies all carry
`ownerType`/`ownerId`. This lets one set of tables serve both the parish general ledger and
optional per-organization ledgers (PA-13) while keeping them **physically separable** in RLS:
- Parish general ledger rows: `ownerType='PARISH'`, `ownerId = parishId`.
- Org ledger rows: `ownerType='ORGANIZATION'`, `ownerId = organizationId`, plus a
  denormalized `parishId` column (for RLS parish-scoping and the parish-admin oversight read).

Organization ledgers are **never** consolidated into parish statements without an explicit
user action (PA-23) — there is no query path that unions them by default; the parish
statement views filter `ownerType='PARISH'`.

### 2.4 Accounting periods gate posting; reopen is super-admin + mandatory reason (PA-21)

`AccountingPeriod` (per ledger owner, e.g. fiscal year + month or a single fiscal year row —
see §4) has `status` ∈ `OPEN | CLOSED`. A `BEFORE INSERT` trigger on `JournalEntry` looks up
the covering period and **rejects** the insert if it is `CLOSED` (or missing). Close/open are
app operations; **reopen of a CLOSED period is restricted to `GLOBAL_ADMIN`** and requires a
non-empty `reason`, writing an immutable `finance.period.reopen` audit entry. The reopen path
is the only one that flips `CLOSED → OPEN`; it is deliberately separate from the normal
open→close lifecycle so it is auditable and role-gated on its own.

### 2.5 Maker-checker approval engine is a first-class, config-driven state machine

Three tables:
- `ApprovalPolicy` — one active policy per `(ownerType, ownerId, entityKind)` where
  `entityKind` ∈ `JOURNAL | VENDOR_BILL | PAYMENT`. Fields: `mode`
  (`STRICT | THRESHOLD_BASED | HYBRID`), `thresholdCents` (nullable), `approverRoles`
  (`Role[]`), `minApprovals` (default 1). Each entity instance selects its own policy
  **independently**; a parent-scope default may be *suggested* by the API but never blocks
  local selection (PA-24).
- `ApprovalRequest` — created when a maker submits a journal/bill/payment. Holds
  `entityKind`, `entityId`, `makerUserId`, `amountCents`, `status`
  (`PENDING | APPROVED | REJECTED | AUTO_APPROVED`), and the resolved `requiredApprovals`.
- `ApprovalDecision` — one row per approver action (`APPROVE`/`REJECT`), with `approverUserId`.

Routing (`lib/finance/approval.ts`, pure + unit-tested truth table):
- `STRICT` → always requires approval.
- `THRESHOLD_BASED` → requires approval only when `amountCents ≥ thresholdCents`; below
  threshold is `AUTO_APPROVED`.
- `HYBRID` → requires approval above threshold **and** for a configured set of sensitive
  accounts/entity kinds; otherwise auto-approve.

Hard rule enforced in **both** app and DB: `ApprovalDecision.approverUserId ≠
ApprovalRequest.makerUserId` (no self-approval) — a DB `CHECK`/trigger backs the app guard.
An entity may transition to its terminal posted/paid state **only** when its
`ApprovalRequest.status ∈ {APPROVED, AUTO_APPROVED}`; posting a journal whose request is
`PENDING`/`REJECTED` is rejected by a trigger on `JournalEntry` status transition.

### 2.6 Donations are family-default, member-attribution is explicit and never auto-allocated (PA-22)

`Donation` carries `familyId` (default attribution) and a **nullable** `memberId` (explicit
member attribution). A **member contribution report** includes only donations where
`memberId = <that member>`; there is **no** code path that distributes a family donation
across members. This is enforced by the query shape (member statement filters
`memberId = ?`) and asserted directly in the exit-gate unit tests. Donations auto-generate a
balanced `JournalEntry` (debit cash/clearing, credit the fund income account) via the posting
engine, inside the same transaction as the donation insert.

### 2.7 Cash vs accrual basis is a report-time parameter, not a second ledger (PA-18)

The ledger is kept on an accrual foundation. Each `JournalEntry` is tagged with a
`cashImpact` boolean (or, more precisely, entries originate from an event typed
`ACCRUAL_ONLY` — e.g. a vendor bill accrual — or `CASH` — e.g. a payment or cash donation).
A report run takes `?basis=cash|accrual`:
- **accrual** → all `POSTED` entries in range.
- **cash** → only entries representing actual cash movement (`cashImpact = true`).

No data is duplicated; the basis switch is a filter. The selected basis is echoed in report
metadata (features §2.11.4). Full multi-statement report packs (income statement, balance
sheet, comparative diocese/parish/org views — features §2.11.9) land in **Phase 6/M11**;
Phase 20 delivers the basis-aware aggregation primitives and one summary endpoint + UI card to
prove the switch — see the explicit scope boundary in §2.16.

### 2.8 Stripe webhook ingestion is idempotent on the Stripe event id (PA-9, IN-6)

`POST /api/webhooks/stripe` is an **unauthenticated** public path (added to `proxy.ts`) that
verifies the Stripe signature (`STRIPE_WEBHOOK_SECRET`) using the raw request body, then
upserts a `StripeEvent(id UNIQUE)` row inside a transaction. If the event id already exists,
the handler no-ops and returns 200 (idempotent). On first delivery it creates the `Donation`
+ balanced `JournalEntry`. Uses the privileged `prisma` client (pre-auth, like the Phase 4
secure-link and self-registration paths); tenant scoping is derived from the Stripe metadata
(`parishId`/`fundId` set at Checkout creation) and validated before insert.

### 2.9 Bank reconciliation is CSV-in only; matching is app-side, status is persisted (PA-20)

`POST /api/finance/reconciliation/import` accepts a CSV (parsed by a small, audited parser —
add `papaparse` or hand-roll for the fixed column set) → `BankStatementLine` rows. A matcher
(`lib/finance/reconcile.ts`) proposes matches to `JournalLine`s by amount+date window;
matched lines set `reconciledJournalLineId`; unmatched remain flagged. No bank API. The
reconciliation run has a `status` and a summary of matched/unmatched counts.

### 2.10 Grant-aware Tier-3 RLS extends the Phase 4 pattern to finance tables

Diocese-read policies on `Donation` (category `GIVING_DETAIL`) and the parish general
`JournalEntry`/`JournalLine` (category `LEDGER_DETAIL`) reuse `has_active_grant()` /
`has_emergency_access()` exactly as Member/Family did in Phase 4 §5.4. **Organization**
ledgers are explicitly excluded from `ledger_detail` grants (access-control §2: "parish
ledger only; organization ledgers are not included"): the diocese-read policy matches
`ownerType='PARISH'` only. A new Tier-2 aggregate view `diocese_parish_giving_summary`
(sum by fund/period, **no** donor names/emails/amounts-per-donor) is added following the
Phase 4 view rules (SECURITY DEFINER, diocese/role-scoped `WHERE`, PII-free, `GRANT SELECT`
to `app_authenticated`).

### 2.11 Annual giving statements are v1-lite: server-rendered PDF, per family/member, sent individually (PA-9, §2.11.10)

**Chosen:** a dedicated `GivingStatement` record (one row per recipient per tax year — family
**or** member) rendered to PDF with `@react-pdf/renderer` (pure JS, no headless browser, works
in a Vercel Function) and delivered as an **individual email**, not through the broadcast
`Message`/`MessageRecipient` model — that model sends one body to an audience; a statement's
body is uniquely computed per recipient. `lib/communications/providers.ts`'s `CommProvider.send`
payload gains one **additive** optional field, `attachment?: { filename: string; content: Buffer;
mimeType: string }`, so the existing Resend-backed provider seam can attach a PDF without a new
send path. SMS ignores attachments (statements are email-only).

- **Family statement**: all `Donation` rows for the family in the tax year, regardless of
  `memberId`. Delivered to `Family.primaryContactEmail`.
- **Member statement**: only `Donation` rows where `memberId = <that member>` (PA-22) —
  reuses the exact filter already established in §2.6 and its own report path. Delivered to
  the member's own email when self-requested, or to the family email when parish-generated in
  batch (a member can additionally view/download their own from `/self-service`).
- **Batch generation** (`POST /api/finance/giving-statements/generate`) is idempotent per
  `(ownerId=parishId, taxYear, recipientType, recipientId)` — a unique constraint on
  `GivingStatement` plus a re-run check means re-generating an already-`SENT` statement
  **updates** the stored snapshot but does not re-send unless the caller explicitly requests
  `resend: true` (exit gate #7).
- The **PDF is never regenerated on every view** — it is rendered once at generate-time and
  the rendered bytes are stored (see §2.15 on storage) so re-downloads are stable even if
  underlying donation data is later corrected via a reversing entry.

### 2.12 Pledge reminders reuse the M7 communications queue, not a new channel (§2.11.7)

**Chosen:** a cron job (`lib/finance/pledgeReminders.ts`, wired the same way as
`processQueuedCommunications` — `/api/jobs/process-pledge-reminders`, GET/POST
secret-guarded, registered in `vercel.json`) finds `Pledge` rows where
`fulfilledCents < amountCents` and the parent `Campaign.endDate` is within a configurable
lookahead window (or already past, for a lapsed-pledge nudge), and enqueues **one**
broadcast-shaped `Message` (channel `EMAIL`, `audienceType` reusing the existing enum by
targeting the individual family/member as a size-1 audience) per pledge, honoring the
existing `CommunicationPreference` opt-out exactly like Phase 11's composer. This is
deliberately **not** folded into the giving-statement send path (§2.11) because reminders are
templated/broadcast-shaped (no PDF, no per-recipient computed ledger data) while statements
are personalized documents — reusing the queue here (unlike statements) is the right
economy because the content need is a plain templated nudge. Audit `finance.pledge.reminder`
per pledge reminder enqueued.

### 2.13 UI ledger-owner context reuses the Phase 5 tenant-context control

The Finance shell adds a **ledger-owner switcher** next to the existing "work in parish"
control (R1 Phase 5 §7): an Organization Leader who leads more than one organization
(`org_leader_ids` claim has >1 entry) picks which org's ledger they are viewing/posting into;
Parish Admin/Staff default to the parish general ledger. A **"View organization ledgers"**
toggle (read-only, PA-13) lets Parish Admin browse into any org ledger in their parish without
ever exposing a write action — the toggle simply changes which `ownerType`/`ownerId` the
already-scoped API calls request; it grants no capability the RLS policy (§5.4) doesn't
already allow. The switcher state lives in the URL (`?owner=parish` or
`?owner=org:<id>`), never in a client store that could drift from what the API actually
authorizes.

### 2.14 Money formatting is a single presentation-edge helper; never re-derive cents in a component

`lib/finance/money.ts` exports `formatCents(cents: bigint, currency = 'USD'): string` (→
`Intl.NumberFormat`) and `parseCentsInput(input: string): bigint` (dollar-string → integer
cents, rejecting fractional-cent input) — the **only** place UI code converts between cents
and a displayed dollar amount. No component does its own `/100` division or string
concatenation; this keeps the §2.1 integer-cents invariant from leaking a floating-point bug
in at the edge where it would be hardest to catch in tests.

### 2.15 Rendered statement PDFs are stored in Vercel Blob, not regenerated per download

`GivingStatement.pdfBlobUrl` (private Vercel Blob) holds the rendered bytes from §2.11's
generate step. Downloads (`GET /api/finance/giving-statements/[id]/pdf`) stream from Blob
after an RLS-equivalent permission check in the route handler (same pattern as the existing
member-export CSV route) — Blob URLs themselves are not treated as capability tokens; the API
route is always the gate.

### 2.16 Explicit scope boundary vs Phase 6/M11 reporting

Phase 20 ships: chart of accounts, the balanced ledger, periods, maker-checker, donations
(+ campaigns/pledges + statements + reminders), vendor bills/payments, annual budgets +
basis-aware summary, CSV reconciliation, Stripe ingestion — and one UI screen per area
(§§14–22). It does **not** ship: multi-report packs (income statement, balance sheet, fund
balance summary, over-budget variance report as a standalone deliverable, comparative
diocese/parish/org report views, the ad-hoc query builder, or the Global Finance Approval
Policy Dashboard) — those are M11/Phase 21 per module-delivery-plan.md §1. The `?basis=`
summary endpoint and budget-variance UI built here are the primitives Phase 21 composes into
full report packs; they are not themselves the report pack.

---

## 3. Work breakdown

Twenty PRs in dependency order. PRs 20-1/20-2 are the schema + invariant/RLS foundation;
20-3…20-11 are backend features (tests-first per the working agreement); 20-12…20-19 are
UI over that API surface; 20-20 is the exit-gate suite.

| PR | Title | Key outputs |
| -- | ----- | ----------- |
| 20-1 | Schema: money convention + core ledger models | Prisma migration; `Account`, `Fund`, `AccountingPeriod`, `JournalEntry`, `JournalLine`; enums; BIGINT cents convention |
| 20-2 | SQL: balancing + period-lock + immutability triggers, ledger RLS, grant-aware diocese read, giving aggregate view | constraint triggers, parish/org isolation policies, `diocese_parish_giving_summary` |
| 20-3 | Posting engine + chart of accounts + journal API | `lib/finance/posting.ts`, `/api/finance/accounts`, `/api/finance/journal` |
| 20-4 | Periods: open/close/reopen API + audit | `/api/finance/periods`, reopen super-admin + reason |
| 20-5 | Maker-checker approval engine | `ApprovalPolicy/Request/Decision`, `lib/finance/approval.ts`, `/api/finance/approvals`, `/api/finance/approval-policies` |
| 20-6 | Donations + campaigns + pledges (+ auto-journal) | `Donation`, `Campaign`, `Pledge`; `/api/finance/donations`, `/campaigns`, `/pledges` |
| 20-7 | Vendor bills & payments (through approval) | `Vendor`, `VendorBill`, `Payment`; lifecycle API |
| 20-8 | Budgets + reporting basis primitives | `Budget`, `BudgetLine`; variance compute; `?basis=` summary endpoint |
| 20-9 | Bank reconciliation (CSV) | `BankStatementLine`, matcher, `/api/finance/reconciliation` |
| 20-10 | Stripe webhook ingestion (idempotent) | `StripeEvent`, `/api/webhooks/stripe`, signature verify |
| 20-11 | Giving statements + pledge reminders | `GivingStatement`, PDF render + Blob storage, `CommProvider` attachment support, `/api/finance/giving-statements`, pledge-reminder cron |
| 20-12 | UI: Finance shell, ledger-owner switcher, chart of accounts + funds + periods | `/finance` layout, nav section, `/finance/accounts`, `/finance/periods` |
| 20-13 | UI: Journal register, entry form, reversing entries | `/finance/journal`, `/finance/journal/[id]` |
| 20-14 | UI: Approval queue + policy configuration | `/finance/approvals`, `/finance/approvals/policies` |
| 20-15 | UI: Donations, campaigns, pledges, giving statements (+ self-service) | `/finance/donations`, `/finance/campaigns`, `/finance/pledges`, `/finance/giving-statements`, `/self-service` "My Giving" |
| 20-16 | UI: Vendor bills & payments | `/finance/vendors`, `/finance/bills`, `/finance/payments` |
| 20-17 | UI: Budgets + variance dashboard | `/finance/budgets` |
| 20-18 | UI: Bank reconciliation | `/finance/reconciliation` |
| 20-19 | UI: Diocese Tier-2 giving/ledger oversight + parish-admin org-ledger oversight | `/diocese/finance`, org-ledger read views |
| 20-20 | Exit gate tests | `tests/rls/r5-*`, `tests/integration/api/r5-*`, `tests/unit/finance/*`, `tests/e2e/r5-*`, `tests/e2e/r5-a11y.test.ts` |

---

## 4. PR 20-1 — Schema: money convention + core ledger models

Migration timestamp: `20260701000001_r5_finance_core`

### 4.1 Enums

```sql
CREATE TYPE "LedgerOwnerType"  AS ENUM ('PARISH', 'ORGANIZATION');
CREATE TYPE "AccountType"      AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE "JournalDirection" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "JournalStatus"    AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'VOID');
CREATE TYPE "PeriodStatus"     AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "JournalSource"    AS ENUM ('MANUAL', 'DONATION', 'STRIPE', 'VENDOR_BILL', 'PAYMENT', 'REVERSAL');
```

### 4.2 Core tables (SQL sketch; Prisma models mirror these)

```sql
-- Fund: a designation within a ledger (General, Building, Missions, ...)
CREATE TABLE "Fund" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parishId"   UUID NOT NULL REFERENCES "Parish"("id"),
  "ownerType"  "LedgerOwnerType" NOT NULL,
  "ownerId"    UUID NOT NULL,
  "name"       TEXT NOT NULL,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Account: chart-of-accounts entry within a ledger owner
CREATE TABLE "Account" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parishId"   UUID NOT NULL REFERENCES "Parish"("id"),
  "ownerType"  "LedgerOwnerType" NOT NULL,
  "ownerId"    UUID NOT NULL,
  "code"       TEXT NOT NULL,               -- e.g. '4000'
  "name"       TEXT NOT NULL,
  "type"       "AccountType" NOT NULL,
  "fundId"     UUID REFERENCES "Fund"("id"),
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("ownerType", "ownerId", "code")
);

CREATE TABLE "AccountingPeriod" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parishId"    UUID NOT NULL REFERENCES "Parish"("id"),
  "ownerType"   "LedgerOwnerType" NOT NULL,
  "ownerId"     UUID NOT NULL,
  "startDate"   DATE NOT NULL,
  "endDate"     DATE NOT NULL,
  "status"      "PeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedByUserId"   UUID REFERENCES "AppUser"("id"),
  "closedAt"    TIMESTAMPTZ,
  "reopenReason" TEXT,
  "reopenedByUserId" UUID REFERENCES "AppUser"("id"),
  "reopenedAt"  TIMESTAMPTZ,
  UNIQUE ("ownerType", "ownerId", "startDate", "endDate"),
  CHECK ("endDate" >= "startDate")
);

CREATE TABLE "JournalEntry" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parishId"    UUID NOT NULL REFERENCES "Parish"("id"),
  "ownerType"   "LedgerOwnerType" NOT NULL,
  "ownerId"     UUID NOT NULL,
  "periodId"    UUID NOT NULL REFERENCES "AccountingPeriod"("id"),
  "entryDate"   DATE NOT NULL,
  "description" TEXT NOT NULL,
  "reference"   TEXT,
  "source"      "JournalSource" NOT NULL DEFAULT 'MANUAL',
  "status"      "JournalStatus" NOT NULL DEFAULT 'DRAFT',
  "cashImpact"  BOOLEAN NOT NULL DEFAULT true,   -- basis filter (see §2.7)
  "reversesEntryId" UUID REFERENCES "JournalEntry"("id"),
  "currency"    CHAR(3) NOT NULL DEFAULT 'USD',
  "createdByUserId" UUID NOT NULL REFERENCES "AppUser"("id"),
  "postedByUserId"  UUID REFERENCES "AppUser"("id"),
  "postedAt"    TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "JournalEntry" ("ownerType", "ownerId", "entryDate");
CREATE INDEX ON "JournalEntry" ("periodId");

CREATE TABLE "JournalLine" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "journalEntryId" UUID NOT NULL REFERENCES "JournalEntry"("id") ON DELETE CASCADE,
  "accountId"   UUID NOT NULL REFERENCES "Account"("id"),
  "direction"   "JournalDirection" NOT NULL,
  "amountCents" BIGINT NOT NULL CHECK ("amountCents" > 0),
  "memo"        TEXT
);
CREATE INDEX ON "JournalLine" ("journalEntryId");
CREATE INDEX ON "JournalLine" ("accountId");
```

### 4.3 Prisma models

Add the enums and models above with `amountCents BigInt`, all relations, and `@@index`
matching the SQL. Add the `Parish` and `Organization` back-relations. No `Role` enum change
is required for Phase 20 (approver sets are config-driven `Role[]` arrays, and org-leader
financial capability is expressed via the existing permission resolver — see §17). The
`proxy.ts` public-path list gains **one** new entry (`/api/webhooks/stripe`, PR 20-10).

---

## 5. PR 20-2 — SQL: invariant triggers, ledger RLS, grant-aware diocese read, giving view

Migration timestamp: `20260701000002_r5_finance_rls.sql` (in `supabase/migrations/`)

### 5.1 Grants to app_authenticated

```sql
GRANT SELECT, INSERT, UPDATE ON "Fund"             TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "Account"          TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "AccountingPeriod" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "JournalEntry"     TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "JournalLine" TO app_authenticated;  -- DELETE only for DRAFT (trigger-guarded)
-- (donations, budgets, vendors, approvals granted in their PRs)
```

### 5.2 Balancing + shape invariant (deferred constraint trigger)

```sql
CREATE OR REPLACE FUNCTION public.assert_journal_balanced()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_entry uuid := COALESCE(NEW."journalEntryId", OLD."journalEntryId");
  v_debit  bigint;
  v_credit bigint;
  v_lines  int;
BEGIN
  SELECT
    COALESCE(sum("amountCents") FILTER (WHERE "direction" = 'DEBIT'), 0),
    COALESCE(sum("amountCents") FILTER (WHERE "direction" = 'CREDIT'), 0),
    count(*)
  INTO v_debit, v_credit, v_lines
  FROM "JournalLine" WHERE "journalEntryId" = v_entry;

  -- Allow a fully-deleted entry (cascade) to pass.
  IF v_lines = 0 THEN RETURN NULL; END IF;
  IF v_lines < 2 THEN
    RAISE EXCEPTION 'JournalEntry % must have >= 2 lines', v_entry;
  END IF;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'JournalEntry % unbalanced: debit=% credit=%', v_entry, v_debit, v_credit;
  END IF;
  RETURN NULL;
END; $$;

CREATE CONSTRAINT TRIGGER journal_balanced
  AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_balanced();
```

### 5.3 Period-lock + posted-immutability + approval-gate triggers

```sql
-- Reject inserts/moves into a CLOSED (or missing) period.
CREATE OR REPLACE FUNCTION public.assert_period_open() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status "PeriodStatus";
BEGIN
  SELECT status INTO v_status FROM "AccountingPeriod" WHERE id = NEW."periodId";
  IF v_status IS NULL OR v_status = 'CLOSED' THEN
    RAISE EXCEPTION 'Cannot write JournalEntry into a closed/missing period';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER journal_period_open BEFORE INSERT OR UPDATE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION public.assert_period_open();

-- Posted entries are immutable (corrections via reversing entry only).
CREATE OR REPLACE FUNCTION public.assert_posted_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'POSTED' AND (TG_OP = 'DELETE' OR NEW.status <> 'VOID' OR NEW."postedAt" <> OLD."postedAt") THEN
    RAISE EXCEPTION 'POSTED journal entries are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER journal_posted_immutable BEFORE UPDATE OR DELETE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION public.assert_posted_immutable();

-- A JournalLine cannot mix ledger owners / point at another owner's account.
-- (Enforced by trigger comparing JournalLine.account.ownerId to entry.ownerId.)
```

The **approval-gate** trigger (DRAFT/PENDING_APPROVAL → POSTED only when the linked
`ApprovalRequest` is `APPROVED`/`AUTO_APPROVED`) is added in PR 20-5 once the approval tables
exist, to keep migrations self-contained.

### 5.4 Ledger RLS — parish isolation + org-leader scope + parish-admin oversight

```sql
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalEntry" FORCE  ROW LEVEL SECURITY;
-- (same ENABLE+FORCE for Fund, Account, AccountingPeriod, JournalLine)

-- Parish general ledger: parish admin/staff read+write their parish's PARISH-owned rows.
CREATE POLICY je_parish_rw ON "JournalEntry"
  FOR ALL USING (
    "ownerType" = 'PARISH'
    AND "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  ) WITH CHECK (
    "ownerType" = 'PARISH'
    AND "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    -- parish-belongs-to-diocese consistency guard, as in Phase 4 write policies
    AND EXISTS (
      SELECT 1 FROM "Parish" p
      WHERE p.id = "JournalEntry"."parishId"
        AND p."dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
    )
  );

-- Org ledger: an org leader reads+writes ONLY their own organization's ledger.
CREATE POLICY je_org_leader_rw ON "JournalEntry"
  FOR ALL USING (
    "ownerType" = 'ORGANIZATION'
    AND "ownerId" = ANY (public.current_org_leader_ids())
  ) WITH CHECK (
    "ownerType" = 'ORGANIZATION'
    AND "ownerId" = ANY (public.current_org_leader_ids())
  );

-- Parish admin oversight: READ-ONLY across all org ledgers in their parish (PA-13).
CREATE POLICY je_parish_admin_org_read ON "JournalEntry"
  FOR SELECT USING (
    "ownerType" = 'ORGANIZATION'
    AND "parishId" = nullif(auth.jwt()->'app_metadata'->>'parish_id','')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin']
  );
```

> Note the deliberate asymmetry: parish admins get a **SELECT-only** policy on org ledgers,
> never `FOR ALL`, so oversight can read but not post into an organization's books.
> `Account`, `Fund`, `AccountingPeriod`, and `JournalLine` mirror this triad (JournalLine
> scopes via its parent entry's owner through an `EXISTS` subquery on `JournalEntry`).

### 5.5 Grant-aware diocese read (Tier-3) — parish ledger + donations only

```sql
-- Parish general ledger, category LEDGER_DETAIL. Org ledgers are excluded by ownerType.
CREATE POLICY je_diocese_grant_read ON "JournalEntry"
  FOR SELECT USING (
    "ownerType" = 'PARISH'
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
    AND (auth.jwt()->'app_metadata'->>'diocese_id') IS NOT NULL
    AND ( has_active_grant("parishId", 'LEDGER_DETAIL') OR has_emergency_access("parishId") )
  );
-- Donation gets the analogous policy with category 'GIVING_DETAIL' (PR 20-6).
```

### 5.6 Tier-2 giving aggregate view (PII-free, follows Phase 4 rules)

```sql
CREATE VIEW public.diocese_parish_giving_summary WITH (security_invoker = false) AS
SELECT
  d."dioceseId"                               AS diocese_id,
  d."parishId"                                AS parish_id,
  p."startDate"                               AS period_start,
  p."endDate"                                 AS period_end,
  f."name"                                    AS fund_name,
  (sum(d."amountCents"))::bigint              AS total_cents,
  count(*)::int                               AS donation_count
FROM "Donation" d
JOIN "AccountingPeriod" p ON p.id = d."periodId"
JOIN "Fund" f ON f.id = d."fundId"
WHERE d."dioceseId" = nullif(auth.jwt()->'app_metadata'->>'diocese_id','')::uuid
  AND (auth.jwt()->'app_metadata'->'roles') ?| array['diocese_admin','diocese_staff','diocese_report_viewer']
GROUP BY d."dioceseId", d."parishId", p."startDate", p."endDate", f."name";
-- No donor name/email/member id/per-donor amount. Sums by fund+period only.
GRANT SELECT ON public.diocese_parish_giving_summary TO app_authenticated;
```

---

## 6. PR 20-3 — Posting engine + chart of accounts + journal API

### `lib/finance/posting.ts` (pure, heavily unit-tested)

```ts
export interface DraftLine { accountId: string; direction: 'DEBIT' | 'CREDIT'; amountCents: bigint; memo?: string; }
export function assertBalanced(lines: DraftLine[]): void {
  if (lines.length < 2) throw new PostingError('at least two lines required');
  const debit  = lines.filter(l => l.direction === 'DEBIT').reduce((a, l) => a + l.amountCents, 0n);
  const credit = lines.filter(l => l.direction === 'CREDIT').reduce((a, l) => a + l.amountCents, 0n);
  if (debit !== credit) throw new PostingError(`unbalanced: ${debit} != ${credit}`);
  if (debit === 0n) throw new PostingError('zero-total entry');
}
```

`postJournalEntry(tx, input)` resolves the covering `AccountingPeriod`, calls
`assertBalanced`, validates all accounts share the entry's ledger owner, inserts the entry +
lines inside the caller's `withTenant` transaction, and (when the entry is submitted for
posting) creates/looks up the `ApprovalRequest` (PR 20-5). The **DB trigger remains the
backstop** — the engine never assumes it is the only guard.

### API routes

- `GET/POST /api/finance/accounts` — chart of accounts CRUD; roles `PARISH_ADMIN`,
  `PARISH_STAFF`; org-scoped variant for `ORGANIZATION_LEADER` (own org). Audit
  `finance.account.create`.
- `GET/POST /api/finance/journal` — list / create a draft or submit a journal entry. `POST`
  builds lines, runs the engine, and either posts (auto-approved) or opens an approval
  request. Audit `finance.journal.create`, and `finance.journal.post` on posting.
- `POST /api/finance/journal/[id]/reverse` — creates a balanced reversing entry (source
  `REVERSAL`, `reversesEntryId` set). Audit `finance.journal.reverse`.

All reads/writes go through `withTenant` (never bare `prisma`), per the architecture spine.
Request bodies are validated in a shared `lib/finance/validate.ts` (account code format,
line count/shape, date bounds) — the R4-hardening pattern of one validation module per
feature area rather than ad-hoc per-route checks.

---

## 7. PR 20-4 — Periods: open/close/reopen API + audit (PA-21)

- `GET /api/finance/periods` — list periods for the caller's ledger owner(s).
- `POST /api/finance/periods` — create the next period (roles `PARISH_ADMIN`; org variant for
  `ORGANIZATION_LEADER`). Audit `finance.period.open`.
- `PATCH /api/finance/periods/[id]` — `{ action: 'CLOSE' }` sets `status=CLOSED`,
  `closedByUserId`, `closedAt`. Audit `finance.period.close`. A period can be closed only when
  no journal entry in it is still `DRAFT`/`PENDING_APPROVAL`.
- `POST /api/finance/periods/[id]/reopen` — **`GLOBAL_ADMIN` only**; body `{ reason }`
  required and non-empty. Sets `status=OPEN`, `reopenReason`, `reopenedByUserId`,
  `reopenedAt`. Writes the immutable `finance.period.reopen` audit entry with
  `metadata: { reason }`. This is the **only** path that reopens a period; it is deliberately
  separate from the close lifecycle and role-gated to super-admin (exit gate #3).

---

## 8. PR 20-5 — Maker-checker approval engine (PA-23/24)

### Schema (added in this PR's migration + RLS file)

`ApprovalPolicy`, `ApprovalRequest`, `ApprovalDecision` as in §2.5. Grant/RLS: policies are
managed by the entity's admin (`DIOCESE_ADMIN` for diocese scope, `PARISH_ADMIN` for parish,
`ORGANIZATION_LEADER` with finance permission for org); requests/decisions are readable by
the maker, the eligible approvers (role match), and the parish admin.

### `lib/finance/approval.ts` (pure truth table — write tests first)

```ts
export function resolveApproval(policy: Policy, amountCents: bigint, entityKind: EntityKind):
  { requiresApproval: boolean; requiredApprovals: number } {
  switch (policy.mode) {
    case 'STRICT':          return { requiresApproval: true,  requiredApprovals: policy.minApprovals };
    case 'THRESHOLD_BASED': return { requiresApproval: amountCents >= policy.thresholdCents, requiredApprovals: policy.minApprovals };
    case 'HYBRID':          return { requiresApproval: amountCents >= policy.thresholdCents || policy.sensitiveKinds.includes(entityKind), requiredApprovals: policy.minApprovals };
  }
}
```

### Org-leader finance capability via the permission resolver (not a new role)

PA-23 references an "Organization Leader **with financial management permissions**." Rather
than add a role, extend `PermissionResource` with `'finance_ledger'` and `'finance_approval'`
and gate org-ledger writes / approval-policy config through the existing resolver +
`ParishPermissionOverride`. This reuses the Phase 2 machinery and keeps the role set stable.

### API + hard rules

- `GET/POST /api/finance/approval-policies` — configure per `(ownerType, ownerId, entityKind)`.
  A parent-scope default may be **suggested** in the response but selection is local (PA-24).
- `GET /api/finance/approvals` — list pending/decided requests visible to the caller.
- `POST /api/finance/approvals/[id]/decide` — `{ decision: 'APPROVE'|'REJECT' }`. **Rejects
  with 403 if `approverUserId === makerUserId`** (no self-approval), the approver's role is
  not in `approverRoles`, or the request is already terminal. A DB `CHECK`/trigger backs the
  self-approval rule. Audit `finance.approval.request` / `finance.approval.decide`.
- Posting/paying is blocked (trigger + app) until the request is `APPROVED`/`AUTO_APPROVED`.

---

## 9. PR 20-6 — Donations + campaigns + pledges (PA-22)

- `Donation(parishId, familyId, memberId?, fundId, campaignId?, periodId, amountCents,
  method, checkNumber?, externalTxnId?, receivedAt, journalEntryId)`. `Campaign(goalCents,
  startDate, endDate, fundId, accountId)`. `Pledge(campaignId, familyId, memberId?,
  amountCents, fulfilledCents, status)`.
- `POST /api/finance/donations` — records a donation and, in the **same transaction**,
  auto-generates a balanced journal entry (debit cash/clearing, credit fund income). Audit
  `finance.donation.create` (per-record giving audit, access-control §5).
- Member contribution report path filters `memberId = ?` and **never** allocates family
  donations to members (PA-22) — asserted in exit-gate unit tests. This is the same query
  shape PR 20-11's member giving statement reuses.
- Diocese-read RLS on `Donation` with category `GIVING_DETAIL`; giving summary via the Tier-2
  view (§5.6). CSV donation-batch import (`POST /api/finance/donations/import`).

---

## 10. PR 20-7 — Vendor bills & payments (PA-19)

- `Vendor`, `VendorBill(status: DRAFT|SUBMITTED|APPROVED|POSTED|PAID|VOID, amountCents,
  dueDate, ...)`, `Payment(vendorBillId, amountCents, method, paidAt, journalEntryId)`.
- Bill submit → approval request (entityKind `VENDOR_BILL`); approve → post accrual journal
  (`cashImpact=false`); payment → approval request (entityKind `PAYMENT`) → post cash journal
  (`cashImpact=true`) and update outstanding balance / aging.
- Audit `finance.vendorbill.*`, `finance.payment.*`. All through `withTenant`.

---

## 11. PR 20-8 — Budgets + reporting-basis primitives (PA-17/18)

- `Budget(ownerType, ownerId, fiscalYear)` + `BudgetLine(accountId, originalCents,
  revisedCents)`. Variance = actual (from posted lines) − revised; over-budget flagged when
  variance crosses a threshold. Annual granularity only (PA-17).
- `GET /api/finance/summary?basis=cash|accrual&from=&to=` — returns income/expense/fund
  totals computed with the basis filter of §2.7 and echoes `{ basis }` in the response.
  Full report packs + exports are **Phase 6/M11** (§2.16); this endpoint proves the basis
  switch and feeds exit-gate tests and PR 20-17's variance dashboard.

---

## 12. PR 20-9 — Bank reconciliation (CSV only, PA-20)

- `BankStatementLine(parishId, ownerType, ownerId, postedDate, amountCents, descriptionRaw,
  reconciledJournalLineId?, status)`; `ReconciliationRun(status, matchedCount,
  unmatchedCount)`.
- `POST /api/finance/reconciliation/import` — CSV → statement lines (small audited parser).
- `POST /api/finance/reconciliation/match` — `lib/finance/reconcile.ts` proposes matches by
  amount + date window; confirmed matches set `reconciledJournalLineId`; unmatched flagged.
- Audit `finance.reconciliation.import` / `.match`. No bank API (out of scope).

---

## 13. PR 20-10 — Stripe webhook ingestion (idempotent, IN-6)

- Add `stripe` SDK. `StripeEvent(id UNIQUE, type, receivedAt, processedAt)`.
- `POST /api/webhooks/stripe` — **public** (added to `proxy.ts`), verifies the signature
  against `STRIPE_WEBHOOK_SECRET` using the **raw** body, then upserts `StripeEvent` by id.
  If the id already exists → 200 no-op (idempotent). On first delivery → create `Donation` +
  balanced `JournalEntry` (source `STRIPE`) from the event metadata
  (`parishId`/`fundId`/`familyId`), using the privileged `prisma` client (pre-auth pattern).
  Audit `finance.stripe.ingest` (never logs card data / full event secrets).

---

## 14. PR 20-11 — Giving statements + pledge reminders (§2.11.7, §2.11.10)

### Schema (migration `20260701000011_r5_giving_statements`)

```sql
CREATE TYPE "GivingStatementRecipientType" AS ENUM ('FAMILY', 'MEMBER');
CREATE TYPE "GivingStatementStatus"        AS ENUM ('GENERATED', 'SENT', 'FAILED');

CREATE TABLE "GivingStatement" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parishId"      UUID NOT NULL REFERENCES "Parish"("id"),
  "taxYear"       INT  NOT NULL,
  "recipientType" "GivingStatementRecipientType" NOT NULL,
  "familyId"      UUID REFERENCES "Family"("id"),
  "memberId"      UUID REFERENCES "Member"("id"),
  "totalCents"    BIGINT NOT NULL,
  "pdfBlobUrl"    TEXT NOT NULL,
  "status"        "GivingStatementStatus" NOT NULL DEFAULT 'GENERATED',
  "sentAt"        TIMESTAMPTZ,
  "generatedByUserId" UUID NOT NULL REFERENCES "AppUser"("id"),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    ("recipientType" = 'FAMILY'  AND "familyId" IS NOT NULL AND "memberId" IS NULL) OR
    ("recipientType" = 'MEMBER'  AND "memberId" IS NOT NULL AND "familyId" IS NULL)
  ),
  UNIQUE ("parishId", "taxYear", "recipientType", "familyId", "memberId")
);
```

RLS: parish admin/staff read+write their parish's statements; a member may `SELECT` **only**
their own `recipientType='MEMBER'` row (`memberId = current_member_id()`), never a
`FAMILY` row (a family isn't a login principal — family statements are parish-generated and
emailed, not self-service-viewable, matching PA-22's member/family attribution split).
Diocese: no read path (statements are not a Tier-2/3 category in this phase — flagged as a
possible future `GIVING_STATEMENTS` grant wiring, currently unused as a `DataCategory` value
despite being defined; see §22 non-goals).

### `lib/finance/statements.ts`

- `computeFamilyStatement(tx, familyId, taxYear)` — sums all `Donation` rows for the family in
  the calendar tax year.
- `computeMemberStatement(tx, memberId, taxYear)` — sums only `Donation` rows where
  `memberId = memberId` (reuses PR 20-6's exact filter; **no** allocation logic exists here by
  construction, closing the PA-22 gap directly in code, not just by convention).
- `renderStatementPdf(input): Buffer` — `@react-pdf/renderer` document: parish letterhead,
  recipient name, tax year, itemized donations (date, fund, amount via `formatCents`), total,
  boilerplate IRS non-cash/no-goods-or-services language.

### API

- `POST /api/finance/giving-statements/generate` — body `{ taxYear, recipientType: 'FAMILY'|'MEMBER'|'ALL' }`.
  Idempotent per §2.11: re-running for an already-`GENERATED`/`SENT` recipient **replaces** the
  stored PDF/snapshot but does not re-send. Roles: `PARISH_ADMIN`, `PARISH_STAFF`. Audit
  `finance.statement.generate` (batch summary: count generated).
- `POST /api/finance/giving-statements/send` — body `{ taxYear, resend?: boolean }`. Sends
  each `GENERATED` (or, with `resend: true`, already-`SENT`) statement's PDF via
  `CommProvider.send` with the new `attachment` field; sets `status='SENT'`, `sentAt`. Audit
  **one** `finance.statement.send` row per recipient (not per batch) so exit-gate #7's
  idempotency check (no duplicate `.send` rows for the same recipient+period) is a direct
  audit-table assertion.
- `GET /api/finance/giving-statements` — list for the parish (privileged) or `?mine=1` (member,
  own row only).
- `GET /api/finance/giving-statements/[id]/pdf` — streams the stored Blob after a permission
  check identical to the row's RLS shape (§2.15).

### Pledge reminders (`lib/finance/pledgeReminders.ts`)

- `processPledgeReminders()` — same idempotent, `FOR UPDATE SKIP LOCKED` shape as
  `processQueuedCommunications` (Phase 3), scoped to `Pledge` rows with
  `fulfilledCents < amountCents` and the parent campaign inside the reminder window. Enqueues
  one `Message`/`MessageRecipient` pair per lapsed pledge (§2.12), honoring
  `CommunicationPreference` opt-out. Audit `finance.pledge.reminder`.
- `GET/POST /api/jobs/process-pledge-reminders` — secret-guarded cron entry, registered in
  `vercel.json` alongside the existing comms-worker cron.

---

## 15. PR 20-12 — UI: Finance shell, ledger-owner switcher, chart of accounts + funds + periods

- **Nav:** extend `NavItem['section']` (`lib/nav/menu.ts`) with `'Finance'`; add items
  `Finance Overview` (`/finance`), `Chart of Accounts` (`/finance/accounts`), `Periods`
  (`/finance/periods`) gated to `parish_admin`, `parish_staff`, `organization_leader`
  (org-scoped view only — see below).
- **`app/(app)/finance/layout.tsx`** — Finance shell: the ledger-owner switcher (§2.13) reading
  `org_leader_ids`/roles from session claims; renders nothing (redirects to `/` with a toast)
  for roles with no finance surface at all (e.g. plain `member`, who instead gets the
  `/self-service` "My Giving" panel from PR 20-15).
- **`/finance/accounts`** — `DataTable` of `Account` rows grouped by `AccountType`, create/edit
  dialog (code, name, type, fund), soft-deactivate via `ConfirmDialog`. Fund management is a
  secondary tab on the same page (`/finance/accounts?tab=funds`).
- **`/finance/periods`** — list with status badges; "Close period" `ConfirmDialog` (blocked
  client-side, but the **API 4xx is the real gate**, per the "UI is not the security boundary"
  rule) when draft/pending entries exist; "Reopen" button rendered **only** for
  `global_admin`, with a required-reason textarea matching the API's non-empty-reason rule.
- Uses `lib/finance/money.ts` (§2.14) for every displayed amount; uses `lib/api-client.ts` for
  all calls — no ad-hoc `fetch`.

---

## 16. PR 20-13 — UI: Journal register, entry form, reversing entries

- **`/finance/journal`** — register `DataTable` (date, description, status, amount, source),
  filters by period/status/source; "New entry" opens the entry form.
- **Journal entry form** — dynamic line-item rows (account picker scoped to the current ledger
  owner, direction, amount via `parseCentsInput`), running debit/credit totals with an
  inline "unbalanced" indicator **before** submit (client-side UX only — `assertBalanced` and
  the DB trigger are still the enforcement, per §2.2). Submitting either posts immediately
  (auto-approved) or shows "Submitted for approval" and links to `/finance/approvals`.
- **`/finance/journal/[id]`** — read-only detail (lines, approval history if any); "Reverse
  entry" action (visible only for `POSTED`, gated the same roles as create) opens a
  confirm dialog that calls `POST /api/finance/journal/[id]/reverse` and links to the new
  reversing entry.

---

## 17. PR 20-14 — UI: Approval queue + policy configuration

- **`/finance/approvals`** — two tabs: "Pending my decision" (entries where the caller's role
  is in `approverRoles` and they are not the maker — the self-approval rule is also enforced
  by simply not rendering a Decide button for the maker's own requests, backstopped by the API
  403) and "My submissions" (maker's own requests + status). Approve/Reject buttons open a
  `ConfirmDialog`.
- **`/finance/approvals/policies`** — per-`(ownerType, ownerId, entityKind)` policy editor:
  mode selector (`strict`/`threshold_based`/`hybrid`), threshold input (via money helper),
  approver-role multi-select, `minApprovals` stepper. When a parent-scope default exists it is
  shown as a **dismissible suggestion banner**, never a disabled/forced value (PA-24).
- Both pages respect the ledger-owner switcher (§2.13): an org leader configures/decides only
  within their own org's policies/requests, enforced by the API/RLS, mirrored by the UI only
  fetching that owner's data.

---

## 18. PR 20-15 — UI: Donations, campaigns, pledges, giving statements (+ self-service)

- **`/finance/donations`** — `DataTable` (date, family/member, fund, campaign, amount, method),
  "Record donation" form (family/member picker — member picker is optional and explicitly
  labeled "attribute to member" so staff never conflate default family attribution with
  explicit member attribution, per PA-22); CSV batch import dialog.
- **`/finance/campaigns`** — list + create/edit (goal, dates, fund); campaign detail shows
  progress bar (received vs. pledged vs. goal).
- **`/finance/pledges`** — list scoped to a campaign; fulfillment status badges; manual
  "Send reminder now" action for a single lapsed pledge (calls the same path
  `processPledgeReminders` uses, scoped to one pledge) in addition to the automatic cron.
- **`/finance/giving-statements`** — batch generate (tax-year picker, recipient-type filter),
  preview list with status (`GENERATED`/`SENT`/`FAILED`), "Send" / "Resend" actions, per-row
  PDF download.
- **`/self-service` — new "My Giving" section**: a member's own `MEMBER`-attributed statements
  (list + PDF download) via `GET /api/finance/giving-statements?mine=1`. This is the only
  finance surface a plain `member` role sees; it never renders family-level totals (PA-22) or
  another member's rows.

---

## 19. PR 20-16 — UI: Vendor bills & payments

- **`/finance/vendors`** — vendor list + create/edit.
- **`/finance/bills`** — `DataTable` with lifecycle status badges (draft → submitted →
  approved → posted → paid → voided) and aging (days-outstanding) column; bill detail shows
  approval history when applicable (reuses the approval-status component from PR 20-14).
- **`/finance/payments`** — record a payment against an approved bill; posts the cash journal
  on success and updates the bill's outstanding balance shown on `/finance/bills`.

---

## 20. PR 20-17 — UI: Budgets + variance dashboard

- **`/finance/budgets`** — fiscal-year selector, `BudgetLine` grid (account, original, revised,
  actual, variance) with over-budget rows highlighted past the configured threshold; revise
  budget inline (updates `revisedCents`, keeps `originalCents` immutable for the original-vs-
  revised comparison required by PA-17).
- A basis toggle (`cash`/`accrual`) on the same page drives the `?basis=` summary endpoint
  (PR 20-8) for the "actual" column — proving the switch end-to-end per §2.7, without building
  the full report pack (§2.16 scope boundary).

---

## 21. PR 20-18 — UI: Bank reconciliation

- **`/finance/reconciliation`** — CSV upload (drag-drop + file picker) → import summary
  (rows parsed, rows rejected with reasons); matched/unmatched statement-line table with a
  per-row "Confirm match" / "Mark unmatched" action; reconciliation-run status header
  (matched/unmatched counts) updating live via route refresh (no new realtime channel — this
  reuses the existing server-refresh pattern, not a websocket).

---

## 22. PR 20-19 — UI: Diocese Tier-2 giving/ledger oversight + parish-admin org-ledger oversight

- **`/diocese/finance`** — Tier-2 aggregate only by default: renders
  `diocese_parish_giving_summary` (§5.6) grouped by parish/fund/period — sums only, no donor
  rows, matching the existing `/diocese/aggregate` page's pattern. Roles: `diocese_admin`,
  `diocese_staff`, `diocese_report_viewer`.
- When a `LEDGER_DETAIL` or `GIVING_DETAIL` grant is active for a parish (reusing the R3
  sharing console's grant lifecycle — no new grant UI is built here), an additional "View raw
  ledger" / "View raw donations" link appears **for that parish only**, landing on a read-only
  variant of `/finance/journal` / `/finance/donations` scoped to the grantee's session — same
  components as PR 20-13/20-15, no write actions rendered for a diocese session (backstopped
  by the RLS `SELECT`-only grant policy).
- **Parish-admin org-ledger oversight**: the "View organization ledgers" toggle from §2.13
  surfaces on `/finance/journal` and `/finance/accounts` for `parish_admin` — read-only,
  reusing the same components with write buttons hidden (and API-blocked) when
  `owner=org:<id>` and the caller is not that org's leader.

---

## 23. PR 20-20 — Exit gate tests

### `tests/unit/finance/posting.test.ts` (property-based)

- `fast-check`-style randomized balanced entries always pass `assertBalanced`; any perturbed
  (unbalanced) set is rejected; one-sided / single-line / zero-total entries rejected.

### `tests/unit/finance/approval.test.ts`

- Full truth table for `STRICT` / `THRESHOLD_BASED` / `HYBRID` at, below, and above threshold;
  sensitive-kind routing for `HYBRID`; `minApprovals` respected.

### `tests/unit/finance/statements.test.ts`

- `computeMemberStatement` line items are always a subset of `computeFamilyStatement`'s for the
  same family+year; a donation with `memberId = null` never appears in any member statement;
  `formatCents`/`parseCentsInput` round-trip and reject fractional cents.

### `tests/rls/r5-ledger.test.ts`

- Parish A ledger invisible to Parish B; org leader sees only own org ledger; parish admin
  can `SELECT` but **not** `INSERT` into an org ledger; diocese role sees **zero** raw
  `JournalEntry`/`Donation` rows without a grant; a `LEDGER_DETAIL` grant exposes parish
  general-ledger rows but **not** organization-ledger rows; a `GIVING_DETAIL` grant does not
  expose `LEDGER_DETAIL`.

### `tests/rls/r5-invariants.test.ts`

- Direct `INSERT` of an unbalanced entry inside a `withTenant` tx **throws** (DB trigger, not
  app); posting into a `CLOSED` period **throws**; updating a `POSTED` entry **throws**.

### `tests/rls/r5-giving-statements.test.ts`

- A member can `SELECT` only their own `MEMBER`-row statement, never a `FAMILY` row or another
  member's row; diocese has no read path on `GivingStatement`.

### `tests/integration/api/r5-finance.test.ts`

- Donation → one balanced journal entry; **replayed Stripe event creates exactly one**
  donation + one entry (idempotency); maker cannot self-approve (403); below-threshold
  auto-approves and posts; above-threshold blocks posting until approved; close period →
  posting rejected; `GLOBAL_ADMIN` reopen with reason → succeeds + `finance.period.reopen`
  audit written; non-super-admin reopen → 403; member contribution report excludes
  family-only donations (PA-22); `?basis=cash` excludes accrual-only vendor-bill entries that
  `?basis=accrual` includes; generating statements twice for the same tax year does not
  duplicate `finance.statement.send` audit rows unless `resend: true` (exit gate #7).

### `tests/e2e/r5-finance-ui.test.ts`

- Parish admin: create account → post manual journal (balanced) → close period → attempt
  post into closed period fails in the UI with the API's error surfaced (not swallowed);
  reopen visible only when signed in as `global_admin`.
- Organization leader: ledger switcher lists only their own organizations; cannot see another
  org's ledger even via direct URL (`?owner=org:<other-id>` → `ForbiddenState`, matching the
  shared shell pattern from R1).
- Member: `/self-service` "My Giving" shows only their own member-attributed statement; no
  family total, no other member's data, anywhere in the rendered DOM.
- Diocese without grant: `/diocese/finance` renders the Tier-2 summary only; no raw-row table,
  no hidden/`display:none` leak of donor rows (DOM-inspected, not just visually absent).

### `tests/e2e/r5-a11y.test.ts`

- axe scan across `/finance`, `/finance/journal`, `/finance/approvals`,
  `/finance/donations`, `/finance/giving-statements`, `/finance/budgets`,
  `/finance/reconciliation`, `/diocese/finance`.

Each auditable action asserts its exact audit `action` string (see §24).

---

## 24. Audit events (cross-reference with access-control §5, §7)

| Action | Written by |
| ------ | ---------- |
| `finance.account.create` / `.update` | chart-of-accounts API |
| `finance.journal.create` / `.post` / `.reverse` | journal API |
| `finance.period.open` / `.close` / `.reopen` | periods API (reopen = super-admin + reason) |
| `finance.approval.request` / `.decide` | approval engine |
| `finance.donation.create` / `.import` | donations API (per-record giving audit) |
| `finance.vendorbill.create` / `.approve` / `.post` / `.void` | vendor bills API |
| `finance.payment.create` / `.post` | payments API |
| `finance.budget.create` / `.revise` | budgets API |
| `finance.reconciliation.import` / `.match` | reconciliation API |
| `finance.stripe.ingest` | Stripe webhook (idempotent; no card/secret data in metadata) |
| `finance.statement.generate` | giving-statements generate API (batch summary) |
| `finance.statement.send` | giving-statements send API (one row per recipient, per exit gate #7) |
| `finance.pledge.reminder` | pledge-reminder cron (one row per pledge reminded) |

Sensitive-category reads (`ledger_detail`, `giving_detail`) that surface raw rows to a
diocese user via a grant write a per-access `finance.ledger.read` / `finance.giving.read`
audit entry, consistent with access-control §5 ("Sensitive data categories … require
per-record access audit entries").

---

## 25. Claims / permissions updates

- **Claims hook:** no structural change. Approver eligibility is evaluated from the existing
  `roles` claim; org-ledger scope reuses `org_leader_ids` / `current_org_leader_ids()`.
- **Permission resolver:** add `PermissionResource` values `'finance_ledger'`,
  `'finance_approval'`, and `'finance_giving'` (statements/donations write scope for a
  staff-with-override case, mirroring the `member_sacramental_record` precedent) to
  `lib/permissions/types.ts`, so org-leader financial capability and approval-policy
  configuration are gated through the Phase 2 resolver + `ParishPermissionOverride` rather
  than a new role (§8).
- **Nav:** `NavItem['section']` gains `'Finance'` (currently `'People' | 'Parish' | 'Diocese' |
  'Sharing' | 'Administration'`) in `lib/nav/menu.ts` — a peer of the existing module
  sections, not nested under `'Parish'`, since Finance has its own oversight (diocese) and
  self-service (member) surfaces that don't fit the parish-operations nav shape.

---

## 26. `proxy.ts` changes

Add the Stripe webhook to public paths (unauthenticated; signature-verified in the handler):

```ts
const PUBLIC_PATHS = [
  // …existing…
  '/api/webhooks/stripe',   // Stripe signature-verified in handler; no session
];
```

No other new unauthenticated routes in this phase — the giving-statement PDF route and the
pledge-reminder cron are both authenticated/secret-guarded, not public.

---

## 27. Files to touch (expected)

| Area | Paths |
| ---- | ----- |
| Schema | `prisma/schema.prisma`, `prisma/migrations/*_r5_finance_core`, `*_r5_giving_statements` |
| RLS | `supabase/migrations/*_r5_finance_rls.sql`, `*_r5_giving_statements_rls.sql` |
| API | `app/api/finance/**`, `app/api/webhooks/stripe/route.ts`, `app/api/jobs/process-pledge-reminders/route.ts` |
| Lib | `lib/finance/{posting,approval,reconcile,statements,pledgeReminders,money,validate}.ts` |
| Comms | `lib/communications/providers.ts` (additive `attachment` field on `CommProvider.send`) |
| UI | `app/(app)/finance/**`, `app/(app)/diocese/finance/**`, `app/(app)/self-service/*` (My Giving section) |
| Nav / permissions | `lib/nav/menu.ts`, `lib/permissions/types.ts` |
| Config | `proxy.ts` (Stripe webhook public path), `vercel.json` (pledge-reminder cron), `package.json` (`stripe`, `@react-pdf/renderer`, `papaparse`, `@vercel/blob` if not already present) |
| Tests | `tests/unit/finance/*`, `tests/rls/r5-*.test.ts`, `tests/integration/api/r5-*.test.ts`, `tests/e2e/r5-*.test.ts`, `tests/e2e/r5-a11y.test.ts` |
| Seed | `tests/helpers/db.ts` truncate list (all new finance tables, in FK-safe order) |

---

## 28. Explicit non-goals (M10 v1)

- Multi-currency accounting (a `currency` column exists for forward-compatibility; math
  assumes USD everywhere in v1).
- Full financial report packs (income statement, balance sheet, fund balance summary,
  comparative diocese/parish/org views, ad-hoc query builder, Global Finance Approval Policy
  Dashboard) — **M11/Phase 21** (§2.16).
- Direct bank API integration (CSV-in only, PA-20).
- Monthly/quarterly budget granularity (annual only, PA-17).
- Automatic consolidation of organization ledgers into parish statements (PA-23 — explicit
  user action only, and even then only via the read-only oversight surface in PR 20-19, never
  a merged statement).
- A `GIVING_STATEMENTS` diocese grant/read path (the `DataCategory` value exists in the enum
  from Phase 4 but is unused by any RLS policy in this phase — statements are parish-private
  and member-self-service only; wiring a diocese grant for statements is deferred until a
  concrete diocese use case is confirmed).
- Recurring-donation self-service management beyond what Stripe Checkout/Billing Portal
  provides natively (no custom subscription-management UI).
- Statement e-signature or e-file submission to the IRS — PDF generation and email delivery
  only.

---

## 29. Definition of Done

Code + tests merged; all seven exit gates (§ top of doc) green in CI; every finance screen in
§§15–22 passes the `r5-a11y` axe scan; `AGENTS.md` / `.github/copilot-instructions.md` updated
per §30; this plan's central decisions (§2) unchanged, or amended with a dated entry in the
[Changelog](#changelog) below, matching the R4 hardening precedent.

---

## 30. AGENTS.md update (on phase completion)

When all exit gates pass, add to the `## Phase status` block in `AGENTS.md` (and mirror in
`.github/copilot-instructions.md`):

```
- **Phase 20 — implemented.** Finance & Giving (M10), backend + UI. Double-entry ledger
  (Account/Fund/JournalEntry/JournalLine) with DB-enforced balancing (deferred constraint
  trigger), period lock + super-admin audited reopen (PA-21), posted-entry immutability
  (reversing entries only), polymorphic parish/organization ledgers with RLS isolation
  (org-leader scope via current_org_leader_ids(), parish-admin read-only oversight, PA-13),
  configurable maker-checker approval engine (strict/threshold/hybrid, no self-approval,
  per-entity independent selection, PA-23/24), donations (family-default, explicit member
  attribution, never auto-allocated, PA-22) + campaigns/pledges with auto-journal + lapsed-
  pledge reminders via the M7 comms queue, annual giving statements (PDF, family/member,
  idempotent batch send), vendor bills & payments (PA-19), budgets + cash/accrual reporting
  basis (PA-17/18), CSV bank reconciliation (PA-20), idempotent Stripe webhook ingestion.
  Grant-aware Tier-3 RLS extended to Donation (GIVING_DETAIL) and parish JournalEntry
  (LEDGER_DETAIL; org ledgers excluded); Tier-2 diocese_parish_giving_summary view (PII-free).
  Full UI: `/finance/*` (accounts, periods, journal, approvals, donations, campaigns,
  pledges, giving-statements, vendors, bills, payments, budgets, reconciliation),
  `/diocese/finance` Tier-2 + grant-gated raw views, `/self-service` My Giving. Migration
  20260701000001_r5_finance_core + 20260701000011_r5_giving_statements; RLS
  20260701000002_r5_finance_rls.sql + giving-statements RLS. Money stored as integer cents
  (BIGINT). Plan: `docs/releases/r5-finance-giving/1-finance-giving.md`.
```

---

## Changelog

- **2026-07-11:** Expanded from a backend-only plan to the full M10 backend+UI plan per
  module-delivery-plan.md §5 ("R5 — Modules: M10 (backend + UI)"). Added: §2.11–§2.16
  central decisions (giving statements, pledge reminders, ledger-owner switcher, money
  formatting, statement storage, M11 scope boundary); PR 20-11 (giving statements + pledge
  reminders, closing the previously-unaddressed features §2.11.7/§2.11.10 gap); PRs 20-12
  through 20-19 (UI over the full API surface); exit gate #6 (UI/a11y) and #7 (giving
  statement idempotency); §27 Files to touch, §28 Explicit non-goals, §29 Definition of Done
  (new sections, matching the R4 plan's structure). Renumbered the exit-gate test PR from
  20-11 to 20-20 and fixed a numbering inconsistency in the old §3 work-breakdown table
  (it read "5-1..5-11" while the section headers below it read "PR 20-1..PR 20-11" — now
  consistently "20-N" throughout, cross-referencing Phase 20 as used in AGENTS.md).
