# Phase 8 Implementation Plan — Family & Member Management UI (MVP2 core)  *(Release R1 · Module M1)*

> **Release R1 — People Core · Module M1 (UI, core).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 8. The heart of MVP2:
> full family and member management with **role-projected sensitive fields**. This is where the
> "UI is not the security boundary" principle is proven hardest — the API withholds fields per
> role (`lib/projection.ts`); the UI renders exactly what arrives.

**Phase goal:** family + member CRUD, the composed member profile with role-gated sections
(pastoral dates, private notes, work notes, relationships, multi-parish), and role-projected export.

**Depends on:** Phase 7 (Clergy derivation drives private-note/pastoral-date visibility).

---

## 1. APIs consumed

`/api/families` · `/api/families/[id]` · `/api/members` · `/api/members/[id]` ·
`/api/members/[id]/pastoral-data` · `/api/members/[id]/private-note` ·
`/api/members/[id]/relationships` · `/api/members/[id]/parishes` · `/api/members/export`.

## 2. Work breakdown (PRs)

- **PR 8-1 — Family management.** List/search, create, edit, merge, deactivate; family detail
  with member roster + derived `<family>.<index>` identifiers.
- **PR 8-2 — Member CRUD + list.** Create (with/without family), edit, status lifecycle,
  deactivate, transfer stub; searchable/paginated member list.
- **PR 8-3 — Member profile (composed, role-gated sections).**
  - Basic/contact — always.
  - Pastoral-sensitive dates (`/api/members/[id]/pastoral-data`) — rendered only when present.
  - Private notes (`/api/members/[id]/private-note`) — Clergy-only, rendered only when present.
  - Work notes — Admin/Staff/responsible leaders.
- **PR 8-4 — Relationships.** Extended-family links (`/api/members/[id]/relationships`).
- **PR 8-5 — Multi-parish membership.** List memberships + atomic set-primary
  (`/api/members/[id]/parishes`).
- **PR 8-6 — Export.** Role-projected CSV download (`/api/members/export`) with a "sensitive
  fields excluded" note.
- **PR 8-7 — Exit-gate tests** (`@mvp2 @phase:8`).

## 3. Tests

- **E2E per role (centerpiece):** Member/Staff/Clergy/Admin open the *same* member profile;
  assert the DOM contains exactly the entitled fields — DOB absent for non-privileged, private
  notes only for Clergy, work notes absent for Members. Proves the **API** withholds data.
- **Integration:** create/edit/deactivate/transfer + private-note/pastoral-data writes audit;
  set-primary-parish is atomic; export CSV omits sensitive fields for non-privileged roles.
- **Unit:** identifier display; form ↔ zod ↔ API validation parity.
- **a11y:** axe on member profile + family detail.

## 4. Exit gate

1. No sensitive field (private notes, work notes, pastoral dates) appears in any non-privileged
   role's rendered profile or export (automated DOM + CSV assertions).
2. Multi-parish set-primary and relationship edits reflect immediately and are audited.
3. Family merge/deactivate preserves member-identifier integrity.
