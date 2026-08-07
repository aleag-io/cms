# M0 Shell Close-Out — Tenant Context & Portal Scope

> **Release:** R1 follow-up (shell) · **Module:** M0 Platform Foundation (UI) · **Depends on:** R1 shell
> (shipped), Phase 2 `MemberParish`/`set_member_primary_parish()` (shipped).
> **Spec:** [1-design-system-shell.md §7](1-design-system-shell.md) — this item closes the gaps
> called out in §7.3 and proves the §7.7 acceptance criteria.

## 0. What already exists (verified 2026-08-06 — do not rebuild)

| Piece | Where | State |
| ----- | ----- | ----- |
| Work-context cookie + resolver | [lib/context/working-parish.ts](../../../lib/context/working-parish.ts) | ✅ `WORKING_PARISH_COOKIE` (HttpOnly, 7-day), `portalForUser`, `resolveWorkingParish(Id)`, `withWorkingParishScope`, `elevatedRolesForWorkContext` |
| Context API | [app/api/session/context/route.ts](../../../app/api/session/context/route.ts) | ✅ GET (portal/workingParish/homeParish), PUT (enter, diocese-only, validates parish∈diocese+active), DELETE (exit); **audit rows** `context.parish.enter` / `context.parish.exit`; logout clears cookie ([app/api/session/route.ts](../../../app/api/session/route.ts)) |
| Role elevation in work-context | `elevatedRolesForWorkContext` + `withWorkingParishApplied` in [lib/auth.ts](../../../lib/auth.ts) | ✅ Diocese Admin → parish operator roles; Staff → staff/member; Report Viewer → member only (read-oriented). `AppUser.role` is **not** mutated |
| Portal-aware nav | [lib/nav/menu.ts](../../../lib/nav/menu.ts) | ✅ `NavItem.portals`, `visibleNavItems(roles, { portal })`; unit matrix in [tests/unit/lib/nav-menu.test.ts](../../../tests/unit/lib/nav-menu.test.ts) |
| Header switcher | [components/app/tenant-context-switcher.tsx](../../../components/app/tenant-context-switcher.tsx) | ✅ Diocese roles: dropdown (Diocese + parish list); parish-home roles: static label; wired in [components/app/app-shell.tsx](../../../components/app/app-shell.tsx) |
| Portal-aware dashboard | [components/app/dashboard/dashboard-view.tsx](../../../components/app/dashboard/dashboard-view.tsx), `quick-links.tsx` | ✅ Diocese cards suppressed in parish portal |
| Unit tests | [tests/unit/lib/working-parish.test.ts](../../../tests/unit/lib/working-parish.test.ts), `nav-menu.test.ts` | ✅ portal×role matrix, elevation map |

## 1. Remaining gaps (this work item)

| # | Gap | §7 reference |
| - | --- | ------------ |
| G1 | **Multi-parish member switcher (MM-17 UX)** — `MemberParish` + `set_member_primary_parish()` exist and a member can manage links on their profile ([app/api/members/[id]/parishes/route.ts](../../../app/api/members/[id]/parishes/route.ts)), but there is **no header switcher** for members with >1 parish: `GET /api/session/context` hard-codes `canSwitchParish: isDioceseScopedRole(raw.role)` and the PUT guard rejects parish-home roles outright. | §7.4-A |
| G2 | **No integration tests** for `/api/session/context` — enter/exit audit rows, 403 for parish-home roles, 404 cross-diocese/unknown parish, report-viewer read-only scope. | §7.4-C, §7.7-4 |
| G3 | **No E2E coverage** for the §7.7 acceptance journey — parish admin sees zero diocese chrome (incl. direct-URL → forbidden), diocese admin enter → parish-only nav → exit. | §7.7 |
| G4 | **Direct-URL guard verification** — a diocese admin in *diocese* portal hitting `/programs` (and a parish admin hitting `/diocese/aggregate`) must get a forbidden/empty state, not leaked data. APIs are RLS-guarded already; the **page-level** behavior needs asserting (and fixing where a page renders misleading content instead of a forbidden state). | §7.7-1 |
| G5 | **Docs drift** — shell plan §7 still titled "gap as of R2"; AGENTS.md / copilot-instructions M0 line still says "partially shipped: role nav only". | §7 |

## 2. Design decisions (G1 — the only new design work)

**Members switch *working parish*, not identity.** Mirror the diocese mechanism with the least
new machinery:

1. **Reuse the cookie.** `cms_working_parish_id` also stores a member's working parish. Members
   may only set it to a parish where they hold an **active** `MemberParish` row. No JWT refresh
   and no role mutation — the member keeps `role: MEMBER` and their home `parishId`; the working
   parish only overrides the *scope* used by APIs, exactly like the diocese path
   (`withWorkingParishApplied` already centralizes this).
2. **Resolver change (server).** Extend `resolveWorkingParish` /
   `resolveWorkingParishId` in [lib/context/working-parish.ts](../../../lib/context/working-parish.ts):
   - diocese-scoped roles → current behavior (parish must be in their diocese, active).
   - parish-home roles → valid iff a `MemberParish` row exists for `(user.memberId, candidate)`
     with active membership. **Open question to resolve at implementation start:** `AppUser`
     does not carry `memberId` today — resolve it via `Member.appUserId` lookup (single indexed
     query) rather than widening the claims pipeline; cache per-request.
   - Security invariant: a member can **never** select a parish they do not belong to; the
     parish list offered is computed from their own `MemberParish` rows, never from
     `GET /api/parishes`.
3. **API change.** `PUT /api/session/context`: replace the blanket `isDioceseScopedRole` 403 with
   a branch — diocese roles take the existing path; parish-home roles validate via `MemberParish`.
   Both paths write the same audit rows (`context.parish.enter` / `.exit`). `GET` returns
   `canSwitchParish: true` for members with ≥2 active `MemberParish` rows plus a
   `switchableParishes` list (id + name) so the client does not need a second fetch.
4. **Claims/RLS interaction.** RLS keys off `request.jwt.claims.parish_id`. The working-parish
   override already flows through `withWorkingParishApplied` → claims in `withTenant`; verify in
   an RLS test that a member in working-parish B **reads parish B data they are entitled to** and
   **cannot read parish A data while scoped to B** (no dual-scope leakage within one request).
5. **Switcher UI.** `TenantContextSwitcher` becomes data-driven from `GET /api/session/context`:
   - diocese role → current dropdown (unchanged);
   - multi-parish member → dropdown of `switchableParishes`, same enter/exit endpoints, label =
     working parish name, "primary" badge on the home parish;
   - single-parish users → current static label (unchanged).
6. **Out of scope (explicitly):** changing *primary* parish from the switcher (stays on the
   profile via `set_member_primary_parish()`); write-surface widening for `DIOCESE_REPORT_VIEWER`
   (stays read/member-level); any JWT/Supabase-hook change.

## 3. Work breakdown

### PR 1 — Member working-parish (G1) *(tests first per DoD)*

1. **RLS test first** — `tests/rls/m0-member-working-parish.test.ts`: member with `MemberParish`
   rows in parishes A+B; session scoped to B sees B directory rows, not A rows; attempt to set
   working parish to C (no membership) is rejected at the resolver level.
2. **Integration test** — `tests/integration/api/m0-session-context.test.ts`:
   member PUT enter (valid/invalid parish), audit row asserted, GET reflects working parish,
   DELETE exit + audit; diocese-role paths re-asserted (G2 lands here too — same file).
3. **Implementation:** resolver branch in `lib/context/working-parish.ts`; PUT/GET branch in
   `app/api/session/context/route.ts`; memberId resolution helper (e.g.
   `memberIdForAppUser(tx, appUserId)`) — confirm whether `getSessionUser` already joins Member
   before adding a query.
4. **UI:** extend `TenantContextSwitcher` + `ShellContext` in
   [components/app/app-shell.tsx](../../../components/app/app-shell.tsx) and
   [app/(app)/layout.tsx](../../../app/(app)/layout.tsx) to pass `switchableParishes`; unit-test
   the render branches (member multi-parish vs single-parish vs diocese) alongside
   `nav-menu.test.ts` conventions.

### PR 2 — E2E acceptance (G3, G4)

New `tests/e2e/m0-tenant-context.test.ts`:

1. Parish admin: sidebar + dashboard contain **no** Diocese section/card; direct URL
   `/diocese/aggregate` → forbidden state (assert the actual behavior; if a page renders a
   misleading empty state instead of 403, fix the page guard as part of G4).
2. Diocese admin: default portal = diocese (no `/programs` link); enter Parish X via switcher →
   nav is parish-only, chip shows parish name; exit → diocese portal restored.
3. Multi-parish member: switcher lists only their parishes; switching scopes directory data
   (seed a distinguishing member per parish); a parish they don't belong to never appears.
4. Report viewer: can enter work-context, sees read surfaces, write affordances absent
   (e.g. no "New member" button).
5. axe check on the switcher dropdown (follow `r1-a11y.test.ts` pattern).

### PR 3 — Docs & status sync (G5)

1. Rewrite [1-design-system-shell.md §7](1-design-system-shell.md) header from "gap as of R2" to
   "shipped (R1 follow-up, 2026-08)"; keep the design as the canonical spec, annotate what is
   implemented.
2. Update the M0 row in [docs/module-delivery-plan.md §1/§4](../../module-delivery-plan.md)
   ("tenant context switcher shipped").
3. Update `project-status` in [AGENTS.md](../../../AGENTS.md) **and**
   [.github/copilot-instructions.md](../../../.github/copilot-instructions.md) (keep the two in
   sync — working agreement).

## 4. Definition of Done (this item)

- [x] Member working-parish switch proven at **RLS** level (no cross-parish leak either direction)
      — `tests/rls/m0-member-working-parish.test.ts`.
- [x] Integration suite covers both actor classes + audit rows for enter/exit
      — `tests/integration/api/m0-session-context.test.ts` (9 tests).
- [x] E2E covers §7.7 items 1–5; axe gate on the switcher
      — `tests/e2e/m0-tenant-context.test.ts` (5 tests).
- [x] `npm run ci` green (unit / integration / rls / e2e).
- [x] Docs updated in all three places (shell plan, module plan, AGENTS/copilot status).

> **Implemented 2026-08-06.** G4 fixes landed with it: `/diocese/aggregate` renders a
> `ForbiddenState` for parish-scoped roles, and the diocese dashboard no longer links into
> parish-ops member pages in diocese mode (`newMembers` suppressed; stat-card hrefs scoped).

## 5. Risks / watch-items

- **`AppUser.memberId` lookup cost** — one indexed query per request for parish-home users;
  acceptable, but do not widen the JWT claims hook without a separate design note.
- **Claims caching** — if `getSessionClaims()` caches per request, ensure the working-parish
  override is applied *after* any cache read, or key the cache on the cookie value.
- **Stale cookie after membership removal** — resolver must re-validate `MemberParish` on every
  request (it already re-validates parish active-ness for diocese roles; same pattern).
- **Seed data** — E2E needs a two-parish member fixture; add to `tests/helpers/db.ts` rather
  than ad-hoc seeding in the test.
