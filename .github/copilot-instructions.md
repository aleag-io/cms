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
- **Phase 1 — implemented; closing exit gate.** Identity, tenancy & core membership:
  `app_authenticated` role + grants, deny-by-default RLS on all tenant tables, audit
  immutability, access-token hook, `withTenant`, family/member/parish CRUD via `withTenant`,
  soft-deactivate (no hard delete). RLS cross-tenant suite in `tests/rls/`
  (`@phase:1 @rls`). Exit gate = `npm run test:rls` green + auth E2E.
- **Phase 2 — in progress.** Intra-parish access control & sensitive fields. Schema is
  landing in `prisma/schema.prisma` (`ParishOfficer`, `MemberPrivateNote`,
  `MemberPastoralData`, `FamilyPastoralData`, `MemberRelationship`, `MemberParish`,
  `ParishPermissionOverride`; expanded `Role` enum; `dateOfBirth`/`anniversaryDate` moving to
  satellite tables). Still needed: field-protection RLS migration, directory view, permission
  resolver, endpoints, and the `@phase:2 @rls` suite. Full plan:
  [docs/phase-2-plan.md](../docs/phase-2-plan.md). Central decision: satellite tables turn
  field-level rules into row-level RLS.

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
