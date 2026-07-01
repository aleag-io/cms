# Phase 7 Implementation Plan — Parish Setup & Administration UI (MVP2)  *(Release R1 · Module M2)*

> **Release R1 — People Core · Module M2 (UI).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 7. The Parish Admin
> control surface. Notably delivers **officers/clergy derivation** and the **permission matrix**
> — the switches that govern Phase 8's member sensitive-field visibility.

**Phase goal:** parish profile, member-ID scheme, officers/board (+ Clergy derivation), parish
users/roles, the permission-override matrix, and the parish-scope audit log.

---

## 1. APIs consumed

`/api/parishes/[id]` · `/api/parish-officers` · `/api/permissions/overrides` ·
`/api/audit` (parish scope).

## 2. Work breakdown (PRs)

- **PR 7-1 — Parish profile & settings.** Profile edit + member-number scheme config
  (MM-10 prefix/width/start) via `/api/parishes/[id]`.
- **PR 7-2 — Officers/board + Clergy.** Manage `ParishOfficer` records (`/api/parish-officers`);
  marking `officer_type = 'clergy'` derives the Clergy capability. Surface which members are
  clergy — this is the switch Phase 8 keys on.
- **PR 7-3 — Parish user management.** Assign Parish Staff, Data Sharing Manager, Ministry/Org
  Leader, Clergy supplementary roles.
- **PR 7-4 — Permissions matrix.** Finish `app/settings/permissions/page.tsx`
  (`/api/permissions/overrides`): role×resource×action overrides with the "can't grant what you
  don't hold" escalation guard surfaced inline; every change toasts + audits.
- **PR 7-5 — Parish audit viewer.** `/api/audit` parish scope.
- **PR 7-6 — Exit-gate tests** (`@mvp2 @phase:7`).

## 3. Tests

- **Unit:** override editor honors the escalation guard (mirror the resolver truth table in
  `lib/permissions`).
- **Integration:** officer/clergy assignment, role assignment, and overrides each write audit rows.
- **E2E:** Parish Admin promotes a member to clergy → the private-notes affordance becomes
  available in Phase 8 flows; a non-admin cannot reach `/settings`.
- **a11y:** axe on settings + permissions matrix.

## 4. Exit gate

1. Overrides cannot escalate beyond the actor's own grants (UI guard **and** API rejection).
2. Clergy derivation is drivable end-to-end from this UI (the Phase 8 dependency).
3. All officer/role/override changes are audited (asserted).
