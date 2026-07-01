# Phase 10 Implementation Plan — Programs, Ministries & Organizations UI (MVP2)  *(Release R2 · Module M5)*

> **Release R2 — Parish Operations · Module M5 (UI).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 10. Parish sub-units
> with **leader-scoped** UIs, including the DB-enforced exclusive-org constraint (PA-16) surfaced
> as a real resolve-conflict workflow rather than a raw error. Depends on Phase 8.

**Phase goal:** programs/ministries (enrollment + attendance, Ministry-Leader-scoped) and
organizations (typed, exclusivity-aware rosters + officers, Organization-Leader-scoped).

---

## 1. APIs consumed

`/api/programs` · `/api/programs/[id]/enrollments` · `/api/organizations` ·
`/api/organizations/[id]/memberships`.

## 2. Work breakdown (PRs)

- **PR 10-1 — Programs/ministries.** CRUD, enrollment, session-attendance grid
  (`/api/programs`, `/[id]/enrollments`). **Ministry Leader** view scoped to own program rosters.
- **PR 10-2 — Organizations.** CRUD with required type (PA-14) and membership-mode
  default-from-type (PA-15); membership roster + org officers
  (`/api/organizations`, `/[id]/memberships`). **Organization Leader** view scoped to own org.
- **PR 10-3 — Exclusive-membership conflict UX.** Adding a member to a second exclusive org of
  the same type returns the DB `409` (PA-16) → resolve-conflict dialog (move vs cancel); open
  mode allows multiple.
- **PR 10-4 — Exit-gate tests** (`@mvp2 @phase:10`).

## 3. Tests

- **E2E:** Ministry/Org Leader sees only own program/org (proven against RLS scoping); no
  cross-program/org data rendered.
- **Integration:** exclusive-org duplicate surfaces the 409 → conflict dialog; open mode allows
  multiple; enrollment/attendance write audit.
- **Unit:** attendance-grid state; membership-mode default derivation display.
- **a11y:** axe on program/org detail + roster.

## 4. Exit gate

1. Leader scoping holds in the UI (no cross-program/org data), backed by RLS.
2. The exclusive-membership conflict is user-resolvable and originates from the **DB constraint**,
   not client validation.
