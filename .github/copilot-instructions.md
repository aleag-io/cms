# Project Status & Context

> Shared context for all AI assistants (Codex, Copilot, Grok, Cursor, Claude). Migrated
> from Claude Code session memory on 2026-06-29 so every tool works from the same picture.
> This file mirrors the `project-status` section of [AGENTS.md](../AGENTS.md) — keep the two
> in sync. Update as phases land.

## What this is

A multi-tenant **Church Management System (CMS)** for the Mar Thoma Church, Diocese of
North America. Stack: **Next.js 16** (App Router) + React 19, **Prisma 7**, **Supabase**
(Auth + Postgres + Row-Level Security). Delivery is phased — see
[docs/delivery-plan.md](../docs/delivery-plan.md) and the per-phase plans in `docs/`.

> **Next.js note:** this is Next.js 16 with breaking changes from older versions. Read the
> relevant guide in `node_modules/next/dist/docs/` before writing Next.js code; don't rely on
> training-data conventions.

## Architecture spine (load-bearing — don't bypass)

- **Tenant isolation is enforced at the database layer via Postgres RLS, not application
  code.** Parish A can never read Parish B's rows; the DB is the source of truth.
- **`lib/db/withTenant.ts`** — wraps every user-facing Prisma call in a `$transaction` that
  runs `SET LOCAL ROLE app_authenticated` and sets the JWT claims GUC
  (`request.jwt.claims`). Prisma connects as a privileged admin but **drops to the
  restricted role** for user requests. Transaction-local, so connection-pool reuse is safe.
- **Claims pipeline** — `app_metadata.{diocese_id, parish_id, roles}` drives RLS policies.
  Derived from `AppUser` via `claimsFromUser()` / `getSessionClaims()` in `lib/auth.ts`;
  injected into JWTs by the Supabase access-token hook in production.
- **Append-only audit** — `lib/audit.ts` (`writeAuditEntry`) with correlation IDs; the
  `AuditEntry` table rejects UPDATE/DELETE via grant + trigger. Audit every
  create/update/deactivate and denied attempt.
- **Migration split** — **Prisma** (`prisma/migrations/`) owns schema (tables, columns,
  enums, indexes, FKs). **Supabase SQL** (`supabase/migrations/`) owns policies, RLS
  enablement, the claims hook, triggers, views, grants, and the `app_authenticated` role.
  Apply order: `prisma migrate deploy` → Supabase SQL.

## Phase status

- **Phase 0 — complete.** Test harness: Vitest (unit + integration projects), Playwright
  E2E, coverage thresholds, deterministic DB seed (`tests/helpers/db.ts`), CI workflow
  (`.github/workflows/ci.yml`). Auth resolver seam (`_setSessionResolver`) lets integration
  tests inject users without `next/headers`.
- **Phase 1 — complete.** Identity, tenancy & core membership: `app_authenticated` role +
  grants, deny-by-default RLS on all tenant tables, audit immutability, access-token hook,
  `withTenant`, family/member/parish CRUD, soft-deactivate. RLS cross-tenant suite in
  `tests/rls/`.
- **Phase 2 — complete.** Intra-parish access control & sensitive fields. Satellite tables
  (`MemberPrivateNote`, `MemberPastoralData`, `FamilyPastoralData`) turn field-level rules
  into row-level RLS; clergy-only private notes (per-parish via `ParishOfficer` subquery,
  MM-19); security-definer `parish_member_directory` view (MM-14, members see peers, no DOB);
  `MemberRelationship` (MM-13); `MemberParish` + atomic `set_member_primary_parish()` (MM-17);
  permission resolver + `ParishPermissionOverride` + `/settings/permissions` (PA-12). Full
  suite green. Plan: [docs/phase-2-plan.md](../docs/phase-2-plan.md).
- **Phase 3 — planned.** Parish operations: programs/ministries, organizations with the
  DB-enforced exclusive-membership constraint (PA-16), events/facilities, async communications,
  staff/volunteer mgmt, member self-registration. Plan: [docs/phase-3-plan.md](../docs/phase-3-plan.md).
  Central decisions: sub-parish (leader) RLS scoping, denormalized partial unique index for
  PA-16, enqueue+cron worker for comms.

## How to run

- Tests: `npm run test:unit` · `test:integration` · `test:rls` · `test:e2e` · `ci` (full
  local pipeline). Coverage: `npm run test:coverage`.
- Apply RLS / Supabase SQL locally: `node scripts/apply-sql.js supabase/migrations/*.sql`
  (or `make db-apply-rls`).
- Local DB: Supabase local stack (`supabase start`); `DATABASE_URL` points at port 54322.
  Prisma migrate: `npx prisma migrate deploy` (reads `prisma.config.ts`).

## Working agreement

- **Definition of Done:** code + tests merged; access-control behavior verified by a test;
  audit row asserted where the action is auditable; docs updated. Write RLS / finance /
  permission tests **first**.
- Tenant-scoped reads/writes go through `withTenant` — never the bare privileged Prisma
  client (that is reserved for provisioning, the claims hook, and audit writes).
