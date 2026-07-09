# Phase 6 Implementation Plan — Diocese Management UI (MVP2)  *(Release R1 · Module M3)*

> **Release R1 — People Core · Module M3 (UI).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 6. Builds on the
> Phase 5 shell/design-system/data-layer. Delivers the Diocese Admin / Staff / Report Viewer
> surface over MVP1 diocese and parish APIs. **No raw member/family/financial record renders
> anywhere in this UI** — the diocese sees Tier-1 structural + Tier-2 aggregate only.

**Phase goal:** parish lifecycle management, diocese settings/users, and the aggregate-only
cross-parish dashboard, with a proven guarantee that the diocese UI cannot surface a raw row.

---

## 1. APIs consumed

`/api/dioceses` · `/api/diocese/aggregate` · `/api/parishes` · `/api/parishes/[id]` ·
`/api/audit` (diocese scope) · `/api/session`.

## 2. Work breakdown (PRs)

- **PR 6-1 — Diocese settings.** Diocese profile & settings page (`/api/dioceses`).
- **PR 6-2 — Parish management.** Parish list, create/configure, deactivate, assign Parish
  Admin (`/api/parishes`, `/[id]`) — Diocese Admin only; role-gated actions.
- **PR 6-3 — Aggregate dashboard.** `/api/diocese/aggregate` rendered as counts/totals per
  parish (members, families, sacraments, giving totals, attendance) with explicit
  "aggregate — no individual records" framing. Report Viewer → summary-only.
- **PR 6-4 — Diocese user management.** Assign Diocese Staff / Report Viewer / Parish Admin.
- **PR 6-5 — Structural directory + audit viewer.** Parish structural list (Tier-1) for Diocese
  Staff; diocese-scope audit log (`/api/audit`).
- **PR 6-6 — Exit-gate tests** (`@mvp2 @phase:6`).

## 3. Tests

- **Integration:** aggregate payload asserted to contain **no PII columns** (reuse Phase 4
  schema assertion) so the UI cannot leak rows; parish create/deactivate + admin assignment
  write audit rows.
- **E2E (RLS-backed):** Diocese Admin/Staff/Report Viewer see aggregates + structural data but
  **zero raw member rows**; Report Viewer cannot reach management actions.
- **a11y:** axe on dashboard + parish management.

## 4. Exit gate

1. No individual member/family/financial record renders in the diocese UI (E2E DOM scan + API
   schema assertion).
2. Parish create/deactivate and Parish Admin assignment are audited (asserted).
3. Report Viewer is read-only, summary-only (proven).

---

## 5. Cross-reference — tenant context switcher

**Diocese Admin “work in parish X”** (enter a parish portal, hide diocese-only nav, exit back)
is **not** fully specified or built in R1 diocese UI. Canonical product rules live in
[1-design-system-shell.md §7](./1-design-system-shell.md) (Tenant context & portal scope).

Phase 6 delivers **diocese portal** surfaces only (settings, parish portfolio, aggregate,
diocese users). Opening a parish from the portfolio for **day-to-day parish operations** must
use the shell work-context control (§7.4B), not by mixing diocese and parish nav in one view.
