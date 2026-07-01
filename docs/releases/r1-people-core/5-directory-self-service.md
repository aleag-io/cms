# Phase 9 Implementation Plan — Directory, Member Self-Service & Self-Registration (MVP2)  *(Release R1 · Module M1)*

> **Release R1 — People Core · Module M1 (UI, self-service).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 9. The member-facing
> portal and the public → member intake pipeline. Depends on Phase 8 (member/family model).

**Phase goal:** upgrade the parish directory, ship member self-service (own profile/family,
comms opt-in/out, RSVP entry, giving placeholder), and the self-registration → approval flow.

---

## 1. APIs consumed

`/api/parish/directory` · `/api/members/[id]` (own) · `/api/families/[id]` (own) ·
`/api/registrations` · `/api/registrations/[id]/approve`.

## 2. Work breakdown (PRs)

- **PR 9-1 — Directory upgrade.** Extend `app/directory/page.tsx` with search, pagination, and
  card/list views — basic contact fields only, no pastoral dates (MM-14).
- **PR 9-2 — Member self-service.** Own profile + own family (read/limited edit); communications
  opt-in/out; event-RSVP entry points; giving-history placeholder (wired in the finance MVP).
- **PR 9-3 — Self-registration (public).** Registration form (`/api/registrations`) creating a
  PENDING, directory-invisible member.
- **PR 9-4 — Approval queue.** Parish Admin/Staff review/approve/reject
  (`/api/registrations/[id]/approve`) with configurable auto-approve.
- **PR 9-5 — Exit-gate tests** (`@mvp2 @phase:9`).

## 3. Tests

- **Integration:** a self-registered member is **invisible in the directory** until approved
  (reuse the Phase 3 assertion at the UI layer); approval makes them visible.
- **E2E:** Member edits own profile but not another's; directory shows no DOB; guest submits
  self-registration → appears in queue → approved → appears in directory.
- **a11y:** axe on directory, self-service, registration form.

## 4. Exit gate

1. Pending self-registrations never appear in the directory (proven end-to-end).
2. A Member reaches only own records + the basic directory (proven by E2E against RLS).
3. Comms opt-out choices persist and are honored by the Phase 11 composer.
