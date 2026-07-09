# Phase 5 Implementation Plan — Design System, App Shell & Auth Foundation (MVP2)  *(Release R1 · Module M0)*

> **Release R1 — People Core · Module M0 (UI shell).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 5. This is the **foundation phase of MVP2**: the
> authenticated application shell, design system, auth/session, and shared data/loading/error
> patterns that every later UI phase composes into. It introduces **no** new tenant-scoped
> business logic — it wires the existing MVP1 APIs into a real application.

**Phase goal:** replace the throwaway `mvp1-console` with a themed, role-aware, accessible app
shell; establish the data layer, route guards, and the shared UI patterns MVP2 depends on.

**Load-bearing principle (from the master plan):** the UI is not the security boundary. Nav
hiding and route guards are UX; every destination remains independently RLS/permission-guarded
server-side and must degrade gracefully on `401`/`403`.

---

## 1. Current state (MVP1 exit)

| Area | State | Evidence |
| ---- | ----- | -------- |
| shadcn/ui primitives | ✅ ~40 installed | `components/ui/**` |
| App shell / nav / layout | ❌ none | `app/layout.tsx` is bare |
| Auth UI | ⚠️ minimal login only | `app/login/page.tsx` |
| Session API | ✅ GET/DELETE | `app/api/session/route.ts` |
| Bootstrap API | ✅ POST | `app/api/bootstrap/route.ts` |
| Data fetching | ⚠️ ad-hoc `fetch` per page | `app/mvp1-console.tsx`, `app/directory/page.tsx` |
| Shared states (loading/empty/error/forbidden) | ❌ none | — |
| Role → nav derivation | ❌ none | claims exist via `getSessionClaims()` in `lib/auth.ts` |

---

## 2. Central decisions

- **Server-state:** prefer native Next.js Server Components, streaming, and route refresh for
  read-heavy screens. Introduce TanStack Query only for client-heavy workflows that need shared
  cache, optimistic updates, or fine-grained invalidation.
- **API client:** `lib/api-client.ts` wraps `fetch`, parses `{ ok, error }`, and normalizes
  `401`→re-auth, `403`→`ForbiddenState`, `5xx`→toast. Reuse the resilient body-parsing pattern
  already in `mvp1-console.tsx` (`api<T>()`).
- **Nav derivation:** `lib/nav/menu.ts` maps role claims → nav tree; pure + unit-tested.
- **Server vs client:** shell layout is a Server Component reading session; interactive islands
  (nav, user menu, forms) are client. Read `node_modules/next/dist/docs/` before adding routes.
- **Theme:** Mar Thoma diocese palette as CSS tokens in `app/globals.css`; light/dark optional.

---

## 3. Work breakdown (PRs)

- **PR 5-1 — Data layer & patterns.** `lib/api-client.ts`, TanStack Query provider,
  `components/patterns/{Skeleton,EmptyState,ErrorState,ForbiddenState,ConfirmDialog,PageHeader,DataTable}.tsx`.
- **PR 5-2 — App shell.** `app/(app)/layout.tsx` with responsive sidebar/topbar, breadcrumb,
  user menu, sign-out (`DELETE /api/session`), and the **tenant context control** (see §7 —
  multi-parish member switcher **and** diocese-admin “work in parish” mode). `lib/nav/menu.ts`
  + tests.
- **PR 5-3 — Auth & guards.** Polished `/login`, session-expiry re-auth, route guard helper
  (`requireSession` redirect for pages), password-reset stub. Redirect unauthenticated → `/login`,
  unauthorized → `ForbiddenState`.
- **PR 5-4 — Role dashboards.** `/` routes each role to its landing surface (diocese, parish,
  member, guest). Dashboard cards and empty destinations must respect **portal scope** (§7):
  parish-scoped roles never see diocese destinations (even as disabled/placeholder cards).
- **PR 5-5 — First-run provisioning wizard.** Multi-step form over `POST /api/bootstrap`
  (diocese + first admin), replacing the console bootstrap.
- **PR 5-6 — Retire console.** Delete `app/mvp1-console.tsx`; `app/page.tsx` renders the
  role dashboard. Migrate anything still needed into shell pages.
- **PR 5-7 — Exit-gate tests** (`@mvp2 @phase:5`).

---

## 4. Tests

- **Unit:** `menu.ts` role→items truth table; `api-client` error mapping (`401`/`403`/`5xx`).
- **Integration:** page route guards return correct redirect/status per session state.
- **E2E:** each seeded role signs in → lands on correct dashboard; sign-out; expired session →
  re-auth; unauthenticated user blocked from every protected route.
- **a11y:** axe on shell, `/login`, dashboard.

## 5. Exit gate (must all be green in CI)

1. `mvp1-console` removed; `/` is a role-aware dashboard.
2. No session → no protected route reachable (E2E).
3. Nav shows only role-appropriate destinations (unit + E2E); hidden destinations still `403`.
4. axe clean on shell/login/dashboard.
5. **Portal scope (§7):** parish-scoped users never see Diocese section / diocese dashboard
   cards; diocese-admin “work in parish X” mode shows parish-and-below nav only and is audited.

## 6. AGENTS.md update (on completion)

Mark this R1 item complete: app shell, design system, auth foundation, data layer, role
dashboards; `mvp1-console` retired.

---

## 7. Tenant context & portal scope *(product requirement — gap as of R2)*

### 7.1 Intent

The product has **two portal layers** that must not bleed into each other in the UI:

| Portal | Who (default) | Sees |
| ------ | ------------- | ---- |
| **Diocese portal** | `GLOBAL_ADMIN`, `DIOCESE_ADMIN`, `DIOCESE_STAFF`, `DIOCESE_REPORT_VIEWER` with no active parish work-context | Diocese settings, parish portfolio, aggregate, diocese users/audit, sharing (diocese side) |
| **Parish portal** | Anyone with an active `parish_id` (Parish Admin/Staff/Clergy/leaders/members) **or** a Diocese Admin who has **entered** a parish work-context | People, Parish ops (R2), parish administration, parish-scope sharing — **nothing diocese-only** |

**UX-12** (requirements): nav is role-aware *and* tenant-scope-aware. Role alone is not enough
once a diocese admin can “work inside” a parish.

### 7.2 What is already accounted for

| Behavior | Status | Where |
| -------- | ------ | ----- |
| Nav items filtered by **role** (`lib/nav/menu.ts`) | ✅ shipped | Parish Admin does **not** receive Diocese Settings / Parishes / Aggregate / Diocese Users links |
| Header badge “Parish context” vs “Diocese context” | ⚠️ **display-only** | `components/app/app-shell.tsx` — derived from `user.parishId`; **not** a switcher |
| Multi-parish **member** default/primary parish (MM-17) | ⚠️ planned, partial | Phase 5 PR 5-2 text (“context switcher for multi-parish users”); Phase 2 access-control plan; no full switcher UX yet |
| Security: parish data isolation for diocese roles without grants | ✅ shipped | RLS — diocese claims without grants see **zero** raw member/family rows |

### 7.3 What is **not** accounted for (gaps)

1. **Parish Admin (and other parish-only roles) must not see diocese *chrome* at all.**  
   Today the dashboard still renders a “Diocese” card with “Not available for this role” for
   parish users — that is still diocese-facing UI and fails the “parish and below only” rule.
   Fix: hide diocese destinations/cards entirely for parish-scoped sessions (not merely disable).

2. **Diocese Admin “work in parish” context switch is not designed or built.**  
   There is no way for a diocese admin to select Parish X and get a **parish-portal** nav
   (people, programs, events, parish settings, …) while suppressing diocese-only nav. The header
   badge is not interactive. Parish-scoped APIs generally require `parish_id` on the actor, which
   diocese admins lack (`parishId = null`).

3. **Session / claims model for temporary parish work-context is unspecified.**  
   Need an explicit, auditable mechanism (below) — not silent role elevation to `PARISH_ADMIN`.

### 7.4 Target design — tenant context control (header)

Replace the static badge with a **context control** in the top bar (right side):

#### A. Parish-scoped users (Parish Admin, Staff, Clergy, leaders, members)

- Control shows **current parish name** (not “Diocese context”).
- **No diocese destinations** in sidebar, dashboard, or breadcrumbs.
- If the user has **multiple parish memberships** (MM-17): control is a **select/switcher** of
  parishes they belong to; switching updates working parish context (primary default) and
  refreshes nav/data. Members cannot switch into parishes they are not a member of.

#### B. Diocese-scoped users (Diocese Admin / Staff / Report Viewer, Global Admin)

- Default: **Diocese context** — diocese portal only (structural + aggregate; no raw parish ops
  unless separately granted).
- Control is a **dropdown**: “Diocese (all parishes)” + list of parishes (from
  `GET /api/parishes` structural list).
- Choosing a parish enters **parish work-context**:
  - UI switches to **parish portal** nav only (People, Parish ops, parish Administration /
    Sharing as permitted by **effective** role in that mode).
  - Diocese-only items (Diocese Settings, Aggregate, Diocese Users, diocese-wide Parish
    portfolio management) are **hidden** until the user returns to Diocese context.
  - Breadcrumb or chip: `Working in: {Parish Name}` with clear **Exit parish context**.

#### C. Security rules for diocese → parish work-context *(non-negotiable)*

| Rule | Detail |
| ---- | ------ |
| UI is not the boundary | Entering parish work-context **never** bypasses RLS. Every API remains `withTenant` + role checks. |
| No silent role minting | Do **not** rewrite `AppUser.role` to `PARISH_ADMIN`. Prefer one of: (1) **session work-context claim** `app_metadata.working_parish_id` set via a dedicated API + short-lived cookie/JWT refresh, with server maps that treat diocese admin + working parish as **read/write parish operator only where product policy allows**, or (2) **explicit “act as Parish Admin”** that creates a time-bounded, audited assignment — product must choose; default recommendation is (1) with **least privilege**: start as **read-only parish observer** unless product explicitly requires write. |
| Audit | Every enter/exit of parish work-context writes an audit row (`context.parish.enter` / `context.parish.exit`) with actor, parish, correlation id. |
| Report Viewer | May enter parish work-context for **read-only** aggregate/structural views only — never parish write surfaces. |
| Emergency access remains separate | Emergency Access (M4) is not a substitute for work-context; it stays Tier-3 grant-scoped and time-limited. |

### 7.5 Nav derivation (updated)

`lib/nav/menu.ts` (or a successor) must take:

```
visibleNavItems(roles, { portal: 'diocese' | 'parish', parishId: string | null })
```

- `portal = 'parish'` → **exclude** all items with `section === 'Diocese'`.
- `portal = 'diocese'` → **exclude** parish-only operational destinations that require a working
  parish (programs, events, facilities, members, …) unless the product later allows diocese-wide
  lists without parish scope.
- Unit tests: parish_admin never lists diocese hrefs; diocese_admin in diocese mode never lists
  `/programs`; diocese_admin in parish work-context lists parish portal hrefs and not
  `/diocese/aggregate`.

### 7.6 Implementation placement

| Work | Suggested home |
| ---- | -------------- |
| Hide diocese chrome for parish users (dashboard cards, any residual links) | **Immediate R1 shell polish** (small PR; no schema) |
| Multi-parish member switcher (MM-17) | R1 shell / People (Phase 5–8 gap) |
| Diocese Admin parish work-context + claims/API + audit + nav portal mode | **New shell item** — track as **R1 follow-up** or early **R3** if bundling with diocese dashboards; must land before diocese users rely on parish ops UI |
| E2E: parish admin never sees “Diocese”; diocese admin enter/exit parish context | Phase 5 exit gate item 5 + dedicated E2E |

### 7.7 Acceptance criteria (for the gap close-out)

1. Logged in as **Parish Admin**: sidebar and dashboard contain **no** Diocese section, no
   “Diocese” card, no aggregate/parishes management routes (direct URL → 403/Forbidden).
2. Logged in as **Diocese Admin**: default view is diocese portal only.
3. Diocese Admin selects Parish X → nav becomes parish-and-below only; chip shows parish name;
   exit returns to diocese portal.
4. Enter/exit parish work-context produces audit rows; RLS still blocks unauthorized cross-parish
   data.
5. Unit tests encode the portal×role matrix in `nav-menu` (or equivalent).

---

## Appendix A — UI build conventions (apply to all UI work: R1–R3, R7)

These conventions are established here (the UI foundation) and reused by every later UI work item.
The load-bearing rule restated: **the UI is not the security boundary** — tenant isolation,
field-level masking, private-note gating, and grant-scoped diocese reads are enforced by Postgres
RLS and the projection helpers (`lib/projection.ts`) *behind* the API. Screens render whatever the
API returns for the current role and hide what it does not; they degrade gracefully on `401`/`403`.

1. **Data layer.** Server Components are the default for read-heavy screens. Use one typed API
   client (`lib/api-client.ts`) for browser-only requests and introduce colocated **TanStack
   Query** hooks only where a client-heavy workflow needs caching, invalidation, or optimistic
   updates. Every client hook returns `{ data, error, isLoading }`; `401`→re-auth,
   `403`→`ForbiddenState`.
2. **Server vs client components.** Server Components for read-heavy pages (directory, dashboards,
   profiles) using the session from `lib/auth.ts`; client components for interactive forms and
   TanStack Query mutations. Read `node_modules/next/dist/docs/` before adding routes — this is
   **not** the Next.js in training data (see AGENTS.md).
3. **Role- and portal-aware navigation.** `lib/nav/menu.ts` derives the visible nav tree from
   `getSessionClaims()` roles **and** active tenant portal (`diocese` vs `parish` work-context —
   §7). Nav hiding is UX only; every destination is independently guarded. Parish-scoped
   sessions never surface diocese-only destinations (including disabled dashboard cards).
4. **Shared states.** Standard `Skeleton`, `EmptyState`, `ErrorState`, `ForbiddenState`,
   `ConfirmDialog`, and toast (`sonner`) in `components/patterns/**` — no bespoke spinners.
5. **Forms.** `react-hook-form` + `zod` schemas mirroring the API's server-side validation (the
   API stays authoritative); field-level server errors render inline.
6. **Sensitive-field rendering.** Fields the API omits for the current role are absent from the
   payload; components render "—" / hide the section rather than requesting them. Private notes,
   work notes, and pastoral dates get dedicated, role-gated sections shown only when present.
7. **Accessibility from the start.** Every interactive component ships keyboard-navigable and
   labeled; `@axe-core/playwright` runs on key screens per work item (not deferred to R7).
8. **Auditability.** Screens triggering auditable actions surface the outcome (success toast,
   optimistic row, or error); the audit row is asserted in integration/E2E tests.
9. **Responsive + print.** Management tables collapse to cards on mobile; export/statement surfaces
   get a print stylesheet. Established here, enforced in the R7 hardening item.

## Appendix B — MVP1 API → screen map (traceability)

Every MVP1 (R0) API has a home in the UI. This is the traceability matrix used across R1–R3 and R7.

| MVP1 API | Method(s) | Screen(s) | Release |
| -------- | --------- | --------- | :-----: |
| `/api/session` | GET/DELETE | Session provider, sign-out, re-auth | R1 |
| `/api/bootstrap` | POST | First-run diocese/admin provisioning wizard | R1 |
| `/api/dioceses` | GET/POST | Diocese profile & settings | R1 |
| `/api/diocese/aggregate` | GET | Diocese aggregate dashboard (Tier-2, counts only) | R1 |
| `/api/parishes`, `/api/parishes/[id]` | GET/POST/PATCH | Parish list, create/configure/deactivate, profile | R1 |
| `/api/parish-officers` | GET/POST | Parish officers/board; clergy derivation | R1 |
| `/api/permissions/overrides` | GET/POST | Church Admin → Permissions matrix | R1 |
| `/api/audit` | GET | Audit log viewer (diocese + parish scope) | R1 |
| `/api/families`, `/api/families/[id]` | GET/POST/PATCH | Family list, CRUD, merge, deactivate | R1 |
| `/api/members`, `/api/members/[id]` | GET/POST/PATCH | Member list, profile, CRUD, deactivate/transfer | R1 |
| `/api/members/[id]/pastoral-data` | GET/PUT | Pastoral-sensitive dates section (Clergy/Admin) | R1 |
| `/api/members/[id]/private-note` | GET/PUT | Private notes panel (Clergy-only) | R1 |
| `/api/members/[id]/relationships` | GET/POST | Extended-family relationships | R1 |
| `/api/members/[id]/parishes` | GET/POST | Multi-parish membership + set primary | R1 |
| `/api/members/export` | GET | Member export (role-projected CSV) | R1 |
| `/api/parish/directory` | GET | Parish member directory (basic fields) | R1 |
| `/api/registrations`, `/api/registrations/[id]/approve` | GET/POST | Self-registration form + approval queue | R1 |
| `/api/programs`, `/api/programs/[id]/enrollments` | GET/POST | Programs/ministries, enrollment, attendance | R2 |
| `/api/organizations`, `/api/organizations/[id]/memberships` | GET/POST | Organizations, rosters, officers, exclusivity | R2 |
| `/api/events`, `/api/events/[id]/rsvp` | GET/POST | Events, recurrence, RSVP, attendance | R2 |
| `/api/facilities`, `/api/facilities/bookings` | GET/POST | Facilities + booking conflict UI | R2 |
| `/api/messages` | POST | Communications composer + delivery status | R2 |
| `/api/sharing/requests`, `/[id]` | GET/POST/PATCH | Sharing requests (create/approve/reject) | R3 |
| `/api/sharing/grants`, `/[id]` | GET/POST/DELETE | Grants (create/scope/expiry/revoke) | R3 |
| `/api/sharing/emergency`, `/[id]` | GET/POST/DELETE | Emergency access (invoke/expire) | R3 |
| `/api/shares`, `/[id]`, `/[id]/view`, `/link/[token]` | GET/POST/DELETE | Contextual share menu + secure-link viewer | R3 |
