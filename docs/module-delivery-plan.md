# Module-Based Delivery Plan  *(canonical top-level plan)*

> The **canonical** organizing view of delivery. Modules define cohesive product areas and
> ownership; **releases (R0–R7)** define what ships together as usable increments. The
> per-work-item implementation plans live under [`releases/`](releases/) — one folder per
> release (e.g. [`releases/r1-people-core/`](releases/r1-people-core/)) — and carry the concrete
> RLS policies, migrations, and test gates each module reuses. Engineering standards (test
> pyramid + Definition of Done) are in §8; UI build conventions and the MVP1-API→screen map live
> in [`releases/r1-people-core/1-design-system-shell.md`](releases/r1-people-core/1-design-system-shell.md).

---

## 0. Two lenses, reconciled

The phase plan is organized **horizontally** (tenancy → access control → operations → sharing →
finance) because **the security spine (RLS, audit, claims, `withTenant`) is a shared foundation
every feature rides on, and retrofitting isolation is how tenant-leak bugs ship.** That constraint
does not disappear in a module view — it becomes **Module 0 (Platform Foundation)**, a hard
dependency of every other module.

Modules add a **vertical** axis better suited to product planning, team ownership, and
incremental release: each module is an independently describable (and largely independently
shippable) product area, a **release** is a set of modules taken to a usable state (backend + UI),
and a squad can own a module end-to-end (schema → RLS → API → UI → reports).

---

## 1. Module catalog

Grounded in the schema (`prisma/schema.prisma`), API surface (`app/api/**`), `lib/**`, and
[features.md](features.md). **State** reflects what exists after MVP1 (Phases 0–4): backend/API +
RLS shipped, UI mostly not.

| # | Module | Backend/API state | UI state | Core entities / source |
| - | ------ | ----------------- | -------- | ---------------------- |
| M0 | **Platform Foundation** | ✅ shipped | ⚠️ shell not built | RLS, claims, audit, `withTenant`, migration split, design system |
| M1 | **People & Membership** | ✅ shipped | ❌ | Diocese, Parish, Family, Member, MemberParish, MemberRelationship, MemberPrivateNote, MemberPastoralData, MemberRegistration |
| M2 | **Parish Administration & Governance** | ✅ shipped | ⚠️ partial | ParishOfficer, AppUser, ParishPermissionOverride, VolunteerAssignment |
| M3 | **Diocese Management & Aggregate** | ✅ shipped | ❌ | Diocese, `diocese_*_summary` views |
| M4 | **Data Sharing & Sovereignty** | ✅ shipped | ✅ (R3) | DataSharingRequest, DataSharingGrant, EmergencyAccessGrant, ContextualShare |
| M5 | **Organizations & Ministries** | ✅ shipped | ❌ | Program*, Organization*, enrollment/attendance, officers |
| M6 | **Events & Facilities** | ✅ shipped | ❌ | Event, EventAttendance, Facility, FacilityBooking |
| M7 | **Communications** | ✅ shipped | ❌ | Message*, MessageTemplate, CommunicationPreference |
| M8 | **Sacramental Records** | ✅ shipped (R4) | ✅ | SacramentalRecord register + pastoral date dual-write — [R4 plan](releases/r4-sacramental-liturgical/1-sacramental-records.md) |
| M9 | **Liturgical Calendar** | ✅ shipped (R4) | ✅ | LiturgicalObservance diocese/parish + events overlay — [R4 plan](releases/r4-sacramental-liturgical/2-liturgical-calendar.md) |
| M10 | **Finance & Giving** *(giving + ledger, one module)* | ❌ not built | ❌ | Donation, Campaign, Pledge, ChartOfAccounts, JournalEntry, Period, Budget, VendorBill, ApprovalRequest (planned) |
| M11 | **Reporting & Analytics** | ✅ shipped (R6) | ✅ | report registry + role-safe CSV/PDF exports, Receipts & Payments, policy + diocese dashboards — [R6 plan](releases/r6-reporting-integrations/1-reporting-analytics.md) |
| M12 | **Integrations & API** | ✅ shipped (R6) *(REST API deferred)* | ✅ | webhooks (outbox + signed delivery), CSV import, cron jobs, Stripe — [R6 plan](releases/r6-reporting-integrations/2-integrations.md) |
| M13 | **Public / Guest Experience** | ⚠️ partial | ❌ | public parish profile, calendar, contact, online-giving entry |
| M14 | **Platform Hardening (NFR)** | ⚠️ continuous | ⚠️ continuous | performance, security, a11y, DR, observability |

### Module detail

**M0 — Platform Foundation** *(cross-cutting substrate; hard dependency of all)*
Multi-tenant RLS + `app_authenticated` role, the claims pipeline (`claimsFromUser`/
`getSessionClaims`), append-only audit, `lib/db/withTenant.ts`, the Prisma↔Supabase migration
split, and — on the UI side — the design system/app shell/auth/data layer (Phase 5), including
**portal-aware nav** and **tenant context switcher** (parish-only portal vs diocese portal +
diocese-admin “work in parish” mode — shell plan §7; partially shipped: role nav only).

**M1 — People & Membership** *(the core domain everything references)*
Diocese→Parish→Family→Member hierarchy, member identifiers (`<family>.<index>`), status
lifecycle, extended-family relationships, multi-parish membership + primary parish, the
role-projected sensitive fields (private notes = clergy-only, pastoral dates, work notes),
parish directory, member self-service, and public self-registration → approval.

**M2 — Parish Administration & Governance**
Parish profile/settings, member-ID scheme config, officers/board + **Clergy derivation**
(`ParishOfficer.officer_type='clergy'`), parish user & role management, the permission-override
matrix (PA-12), staff/volunteer assignment (PA-6, `VolunteerAssignment`), and parish-scope
audit viewer.

**M3 — Diocese Management & Aggregate**
Diocese profile/settings, parish lifecycle (create/configure/deactivate, assign Parish Admin),
diocese users, the **Tier-2 aggregate** dashboards/views (counts & totals, never raw rows), and
the diocese-scope audit viewer.

**M4 — Data Sharing & Sovereignty** *(the parish-data-sovereignty control plane)*
DataSharingRequest lifecycle, grant create/scope/expiry/revoke, grant-aware Tier-3 RLS
(`has_active_grant()`), emergency access (≤7 days, view-only), universal contextual sharing
(user/role/secure-link) with hashed tokens + anonymized projection, and the public secure-link
viewer.

**M5 — Organizations & Ministries**
Programs/ministries with enrollment + session attendance and Ministry-Leader scoping;
organizations with required type, membership-mode-from-type, DB-enforced **exclusive membership**
(PA-16), rosters, and Organization-Leader scoping + officers.

**M6 — Events & Facilities**
Events (recurrence, RSVP with capacity, attendance, reminders) and facilities (booking with
DB-enforced double-booking prevention via `btree_gist` EXCLUDE).

**M7 — Communications**
Email (Resend) + SMS (Twilio), audience selection, templates, opt-out/`CommunicationPreference`,
async send via the idempotent cron worker, and delivery-status tracking; notification settings.

**M8 — Sacramental Records** *(new module — People-adjacent)*
Baptism, chrismation/confirmation, first communion, marriage, ordination, and funeral records;
certificate/register numbers, officiant, and location; sacramental register management and
sacramental reports (feeds M11). Today only the **sacramental dates** exist, masked inside
`MemberPastoralData` (Phase 2); full record management (features §2.3) is greenfield. Clergy /
Parish Admin write; access follows the same role-projection rules as M1's pastoral fields.
**Depends on M1.**

**M9 — Liturgical Calendar** *(new module — scheduling)*
Diocese and parish liturgical calendar: feast days, liturgical seasons, and lectionary
references (features §1.6), overlaid on the parish events calendar (M6). Greenfield.
**Depends on M6 (calendar surface) and M3 (diocese-level publishing).**

**M10 — Finance & Giving** *(one module — giving and the general ledger together)*
Donor-facing **giving** (donations with family-default / member-attributed reporting — PA-22,
campaigns, pledges, annual giving statements, Stripe ingestion) **and** the **general ledger**
(chart of accounts, double-entry journal with DB-enforced balancing, periods with audited reopen,
budgets, vendor bills & payments, CSV bank reconciliation, the configurable maker-checker approval
engine, and organization-scoped ledgers). Giving and finance ship **as one release** because
donations post directly into the ledger — building them together avoids standing up giving on
standalone totals and reworking it when the ledger lands. Implementation plan:
[`releases/r5-finance-giving/1-finance-giving.md`](releases/r5-finance-giving/1-finance-giving.md).
**Depends on M1 (donors).**

**M11 — Reporting & Analytics** *(greenfield)*
Standard reports (membership, sacramental, attendance, program, giving, financial), exports
(PDF/CSV/Excel) that respect role projections, ad-hoc query builder, statement packs, audit
reports, and the Global Finance Approval Policy Dashboard. **Aggregates data from every prior
module.**

**M12 — Integrations & API** *(cross-cutting; partial)*
Public REST API, event webhooks, CSV import/export, provider wiring (Resend/Twilio/Stripe), and
scheduled jobs (comms worker + sharing/emergency expiry are already live).

**M13 — Public / Guest Experience**
Per-parish public pages (profile, Mass schedule, public calendar — overlaps M9), contact form,
online-giving entry (→ M10), and the self-registration CTA.

**M14 — Platform Hardening (NFR)** *(cross-cutting)*
Performance budgets/indexes/search, external security review, WCAG 2.1 AA, backup/DR drill, and
audit-pipeline observability.

---

## 2. Module dependency graph

```
M0 Platform Foundation
 └─▶ M1 People & Membership
      ├─▶ M2 Parish Admin & Governance   (Clergy derivation → M1 sensitive fields)
      ├─▶ M3 Diocese Management & Aggregate
      ├─▶ M5 Organizations & Ministries
      ├─▶ M6 Events & Facilities ─▶ M9 Liturgical Calendar
      ├─▶ M7 Communications              (audience = M1 members, opt-out state)
      ├─▶ M8 Sacramental Records         (records hang off members)
      └─▶ M10 Finance & Giving           (donors = M1 members/families; donations auto-journal)
 M3 + M2 ─▶ M4 Data Sharing & Sovereignty  (diocese requests ⟷ parish grants)
 M1..M10 ─▶ M11 Reporting & Analytics       (reports aggregate every module's data)
 (all) ─▶ M12 Integrations & API,  M13 Public,  M14 Hardening
```

**Key edges:** M0 precedes everything; M1 is the second hard prerequisite (nearly every module
references a member/family). M2's Clergy derivation gates M1's and M8's sensitive fields. M4 needs
both the diocese (M3) and parish (M2) sides. M10 is internally coherent — giving posts into the
same ledger, so it is one module, not two.

---

## 3. Module → phase mapping (nothing is lost)

| Module | Backend/API (built) | UI / build plan |
| ------ | ------------------- | --------------- |
| M0 | Phase 0, Phase 1 | Phase 5 |
| M1 | Phase 1, Phase 2 | Phase 8, Phase 9 (+ parts of 6/7) |
| M2 | Phase 2 | Phase 7 |
| M3 | Phase 4 | Phase 6 |
| M4 | Phase 4 | Phase 12 |
| M5 | Phase 3 | Phase 10 |
| M6 | Phase 3 | Phase 11 |
| M7 | Phase 3 | Phase 11 |
| M8 | *(dates: Phase 2; full records: new)* | *(new — R4)* |
| M9 | *(new)* | *(new — R4)* |
| M10 | Phase 20 | *(with Phase 20)* |
| M11 | Phase 21 | *(with Phase 21)* |
| M12 | parts of Phase 3/4 (crons); Phase 21 | — |
| M13 | — | Phase 13 |
| M14 | Phase 22 | Phase 13 (a11y/responsive) + Phase 22 |

---

## 4. Module state summary

- **Fully backed + UI shipped (R0–R3):** M0 (incl. shell), M1, M2, M3 (core Tier-2 UI),
  M4 (sharing console + secure-link viewer), M5, M6, M7.
- **Deferred from R3:** richer M3 advanced diocese dashboards (beyond `/diocese/aggregate`)
  → **R6 Reporting**.
- **Fully backed + UI shipped (R4):** M8 (sacramental register), M9 (liturgical calendar).
- **Fully backed + UI shipped (R5):** M10 (finance & giving).
- **Fully backed + UI shipped (R6):** M11 (reporting), M12 (integrations — public REST API
  deferred; RP-3 query builder moved to R7).
- **Partial/continuous:** M13 (public), M14 (hardening).

---

## 5. Module-based MVP / release plan

Each release takes a coherent set of modules to a **usable, shippable state** (backend + UI +
tests + audit). Releases are additive and independently demoable to real parishes.

### R0 — Platform Foundation *(shipped — MVP1 backend)*
- **Modules:** M0 (backend) + backend/API of M1–M7 and M4.
- **State:** ✅ complete. Security spine, RLS, audit, and the full API surface exist.
- **Gap:** no usable UI. **Outcome:** a proven secure, multi-tenant platform with an HTTP API.

### R1 — People Core *(the Minimum Lovable Product)*
- **Modules:** **M0 UI (shell)** · **M1** · **M2** · **M3 (core)**.
- **Delivers:** app shell + auth; family/member CRUD with role-projected sensitive fields;
  directory; member self-service; self-registration → approval; parish admin (officers/clergy,
  users/roles, permissions, member-ID); diocese manages parishes + Tier-2 aggregates.
- **Phases:** 5, 6, 7, 8, 9.
- **Outcome:** **a parish office runs membership end-to-end; a diocese oversees parishes.** First
  release worth deploying to a pilot parish.

### R2 — Parish Operations *(shipped)*
- **Modules:** **M5** · **M6** · **M7**.
- **Delivers:** programs/ministries (leader-scoped rosters + attendance), organizations
  (exclusive-membership conflicts), events (RSVP/attendance), facilities (booking-conflict UI),
  communications composer.
- **Phases:** 10, 11.  **Outcome:** daily parish life runs in the system.
- **State:** ✅ complete (UI + API extensions + exit-gate tests).

### R3 — Sovereignty & Sharing *(shipped)*
- **Modules:** **M4** (UI); M3 core Tier-2 aggregate retained from R1.
- **Delivers:** request→approve→grant→revoke lifecycle UI, emergency access, contextual sharing +
  secure-link viewer. Richer diocese dashboards deferred to R6.
- **Phases:** 12.  **Outcome:** the data-sovereignty model is operable, not just DB-enforced.
- **State:** ✅ complete (UI + peer-review hardening + unit/integration/E2E). Plan:
  [`releases/r3-sovereignty-sharing/1-data-sharing-ui.md`](releases/r3-sovereignty-sharing/1-data-sharing-ui.md).
- *(UI-only — all backend exists. Completes the MVP2 UI train, phases 5–12.)*

### R4 — Sacramental Records & Liturgical Calendar *(shipped)*
- **Modules:** **M8** · **M9** (greenfield backend + UI). **Build order: M8 first, then M9.**
- **Delivers:** full sacramental register management (seven sacraments per PA-7), certificates;
  the diocese/parish liturgical calendar overlaid on parish events.
- **Outcome:** church-specific record-keeping and the liturgical year.
- **State:** ✅ complete (schema + RLS + API + UI + tests).
- **Plans:**
  [`releases/r4-sacramental-liturgical/1-sacramental-records.md`](releases/r4-sacramental-liturgical/1-sacramental-records.md)
  (M8) ·
  [`releases/r4-sacramental-liturgical/2-liturgical-calendar.md`](releases/r4-sacramental-liturgical/2-liturgical-calendar.md)
  (M9).

### R5 — Finance & Giving
- **Modules:** **M10** (backend + UI), plus M12 Stripe wiring.
- **Delivers:** giving (donations, campaigns, pledges, member/family statements, Stripe) **and**
  the general ledger (chart of accounts, DB-balanced journal, periods, budgets, vendor
  bills/payments, CSV reconciliation, maker-checker, org ledgers) — **one release**; donations
  auto-journal.
- **Phases:** 20.  **Outcome:** full parish/org accounting + stewardship, highest-correctness area.

### R6 — Reporting & Analytics *(shipped)*
- **Modules:** **M11** · **M12 (completion)**.
- **Delivers:** the report registry + role-safe CSV/PDF exports, the annual Receipts & Payments
  statement, the Global Finance Approval Policy Dashboard (RP-9/DA-12), richer diocese Tier-2
  dashboards (deferred from R3), outbound webhooks (transactional outbox + HMAC-signed delivery
  with retry/dead-letter), and member CSV import.
- **Phases:** 21.  **Outcome:** the data becomes decisions; external systems integrate.
- **State:** ✅ complete. **Deferred:** RP-3 ad-hoc query builder → R7; IN-1 public REST API +
  scoped API keys → later (no external consumer yet); real `.xlsx` export; Resend/Twilio
  production adapters (seam stubbed; Stripe is live).
- **Plans:** [`releases/r6-reporting-integrations/1-reporting-analytics.md`](releases/r6-reporting-integrations/1-reporting-analytics.md)
  (M11) · [`releases/r6-reporting-integrations/2-integrations.md`](releases/r6-reporting-integrations/2-integrations.md) (M12).

### R7 — Public & Hardening
- **Modules:** **M13** · **M14**.
- **Delivers:** public/guest parish pages + online-giving entry; the performance/security/a11y/DR
  hardening pass and per-persona acceptance suite.
- **Phases:** 13 + 22.  **Outcome:** production-ready, publicly presentable, load/DR-proven.

### Release map at a glance

| Release | Modules | New backend? | Primary value | Ref phases |
| ------- | ------- | :----------: | ------------- | ---------- |
| R0 | M0 + M1–M7/M4 backend | ✅ (done) | Secure platform | 0–4 |
| R1 | M0 UI, M1, M2, M3 | — (UI only) | **Usable membership product** | 5–9 |
| R2 | M5, M6, M7 | — (UI only) | Parish operations | 10, 11 |
| R3 | M4 | — (UI only) | Data sovereignty operable | 12 (done) |
| R4 | M8, M9 | ✅ | Sacramental records + liturgical calendar | R4 plans |
| R5 | M10 | ✅ | Finance & giving (accounting + stewardship) | 20 |
| R6 | M11, M12 | ✅ (done) | Reports + integrations | 21 |
| R7 | M13, M14 | ✅ | Public site + hardening | 13, 22 |

---

## 6. Sequencing rationale

1. **Foundation is non-negotiably first.** M0 (and the R0 backend) precede every feature — the same
   reason the phase plan is security-first. Already done.
2. **People before everything else.** Nearly every module references a member or family. R1 is both
   the shortest path to a *usable* product and a prerequisite for donors (M10), audiences (M7),
   rosters (M5), RSVPs (M6), and sacramental records (M8).
3. **Finish the UI-over-existing-API train first (R1–R3).** These releases ship UI on top of
   already-built, RLS-guarded APIs — the cheapest, lowest-risk value. They complete MVP2 (phases
   5–12) before any greenfield backend begins.
4. **Keep Finance and Giving as one release (R5).** Donations post directly into the ledger, so
   splitting them would mean building giving on standalone totals and reworking it when the ledger
   lands. Shipping M10 whole keeps the double-entry invariant coherent from day one — at the cost
   of a larger release, which is the right trade for the highest-correctness area.
5. **Church-specific record-keeping (R4) before finance (R5).** Sacramental records and the
   liturgical calendar are core to a *church* management product and lower-risk than the ledger;
   they also complete the member record before money rides on the data.
6. **Reporting last among features.** R6 aggregates data from every prior module, so it is most
   valuable once that data is flowing.
7. **Hardening is continuous, with a final gate.** M14 patterns (perf indexes, a11y, pagination)
   apply as each module lands; R7 is the dedicated pass + public surface.

**Parallelism:** after R1, a second squad can take R2 (operations) while another takes R3 (sharing)
or begins R4 backend. R5 (finance & giving) should be a focused single stream given its
invariant-correctness risk.

---

## 7. Relationship to the implementation plans

This document is **canonical**. The implementation detail lives in per-work-item plans under
[`releases/`](releases/):

- Each release folder (`releases/r0-platform-foundation/`, `releases/r1-people-core/`, …) holds
  ordered work items with the exact RLS policies, migrations, DB constraints, and test gates each
  module's build reuses. Every item is headed with its owning release and module.
- Modules define ownership and scope; releases (R0–R7) define what ships together; the work-item
  plans define how each is built and proven.
- The old flat `delivery-plan.md` and `mvp2-ui-delivery-plan.md` masters were retired
  (2026-07-01); their unique content moved here (§8), into the R1 shell plan (UI conventions +
  API→screen map), and into the R0/R6/R7 work items (foundations, reporting, hardening).

**Resolved decisions (2026-07-01):** (a) Finance and Giving ship as **one** module/release (M10 /
R5) — *not split*. (b) **Sacramental Records (M8)** and **Liturgical Calendar (M9)** are their own
modules. (c) This module plan is the **canonical** top-level plan; delivery is organized under
`releases/` and linked from `AGENTS.md`.

---

## 8. Engineering standards (every work item)

### Test pyramid (set up in R0, added to continuously)

| Layer | Tool | What it covers | Runs |
| ----- | ---- | -------------- | ---- |
| Static | `tsc --noEmit`, `eslint` | Types, lint rules | Every PR (fast) |
| Unit | **Vitest** | Pure logic: ID formatting, permission resolver, double-entry balancing, anonymization projection, redaction | Every PR |
| Integration (API + DB) | **Vitest** against ephemeral Postgres (Supabase local / Testcontainers) | Route handlers + Prisma against a real DB, audit rows written, validation errors | Every PR |
| **RLS / policy** | **pgTAP** (SQL) + Vitest with per-role JWT-claim DB sessions | Row-level isolation: Parish A cannot read Parish B; grant gates Tier-3; private notes clergy-only; pastoral-date masking | Every PR — **first-class** |
| E2E | **Playwright** | Critical per-role journeys through the real UI | Every PR (smoke) + nightly (full) |
| Accessibility | `@axe-core/playwright` | WCAG 2.1 AA on key screens | Per UI work item; nightly + pre-release |
| Performance / load | **k6** (or autocannon) | p95 latency, aggregate-query budgets, search at 100k rows | Pre-release for hot paths (R7) |

**RLS testing is the highest-leverage investment.** Access control is enforced at the database
layer, so the authoritative tests run SQL as a simulated user (setting the `request.jwt.claims`
GUC / `app_metadata`) and assert *zero rows* cross the boundary — not just that the UI hides a
button. Every protected table gets a "cross-tenant returns nothing" test the moment its RLS
policy lands.

**Test data:** a deterministic seed builds a fixed fixture diocese with ≥2 parishes, overlapping
roles (incl. multi-parish clergy), and sample families/members — the same seed powers integration,
RLS, and E2E runs.

### Definition of Done (every work item)

Code + tests merged; access-control behavior verified by a test; audit row asserted where the
action is auditable; for UI, per-role rendering verified and no sensitive-field leak, axe clean
on the screen; docs updated. A work item is not done because the UI renders — it is done when its
validation gate is green in CI. **The UI is never the access-control boundary.**
