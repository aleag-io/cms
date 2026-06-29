# Phase 1 Implementation Plan — Identity, Tenancy & Core Membership

> Companion to [delivery-plan.md](delivery-plan.md) Phase 1. This document turns that
> phase's deliverables into an ordered, implementable work breakdown with the concrete
> architectural decisions, schema/migration changes, RLS policies, and tests required to
> reach the **Phase 1 exit gate**.

**Phase goal:** a secure, multi-tenant baseline — real auth, real isolation enforced *at the
database layer*, real append-only audit, and the Diocese → Parish → Family → Member core.

**Requirements covered:** MT-1–6, AU-1–11, IN-7, FM-1–7, MM-1/6/10/16, SE-3/6, parts of DA
(parish provisioning), PA-1/2.

**Exit gate (must all be green in CI):**
1. RLS cross-tenant suite proves Parish A ⟂ Parish B for **every** Phase-1 table
   (members, families, audit), as a real DB session — not an app-layer filter.
2. Diocese user sees Tier-1 structural data but **zero** raw member rows (SE-3).
3. Every audited action has an asserted audit row; the audit table **rejects** UPDATE/DELETE.
4. Auth/session E2E passes for Diocese Admin and Parish Admin.

---

## 1. Current state (verified starting point)

| Area | State | Evidence |
| ---- | ----- | -------- |
| Supabase Auth | ✅ wired — login, OAuth callback, SSR cookie session, resolver seam | `app/login/page.tsx`, `app/auth/callback/route.ts`, `lib/auth.ts`, `lib/supabase/server.ts` |
| Schema | ✅ `Diocese`/`Parish`/`AppUser`/`Family`/`Member`/`AuditEntry` | `prisma/schema.prisma`, migration `20260629060238_init` |
| Member/Family CRUD | 🟡 partial — create/list members, family lookup; no update/deactivate/transfer; family-number scheme not configurable | `app/api/members/route.ts`, `app/api/families/route.ts` |
| Audit utility | 🟡 writes rows with `requestId`, but **not append-only at the DB** | `lib/audit.ts` |
| JWT custom claims | ❌ not injected (`app_metadata.diocese_id/parish_id/roles`) | — |
| **RLS policies** | ❌ **none** — `init` migration contains zero `CREATE POLICY` | `prisma/migrations/20260629060238_init/migration.sql` |
| DB access path | ⚠️ Prisma over a `pg` pool with elevated creds — **bypasses RLS** | `lib/prisma.ts` |
| Tests | 🟡 unit + 1 integration skeleton; no RLS suite | `tests/` |

**The headline gap:** tenant isolation today lives only in application code (`where: { dioceseId,
parishId }`). The delivery plan requires DB-layer enforcement; everything below builds it.

---

## 2. The central decision — making Prisma honor RLS

RLS in Postgres only constrains a connection whose **role is subject to policies** and whose
session exposes the JWT via `auth.jwt()` / `current_setting('request.jwt.claims')`. Today
`lib/prisma.ts` connects with a privileged role and never sets claims, so **policies would be
silently bypassed**. We must change the access path. Three options:

| Option | How | Verdict |
| ------ | --- | ------- |
| **A. RLS-honoring Prisma (recommended)** | Connect Prisma as a **non-superuser, non-`BYPASSRLS` role**. Wrap every request's queries in a transaction that first runs `SELECT set_config('request.jwt.claims', $1, true)` with the user's claims JSON. `auth.jwt()` (a thin wrapper over that GUC) then drives policies for Prisma queries exactly as for PostgREST. | **Chosen.** Keeps Prisma as the ORM; DB is the single source of truth for isolation. |
| B. Route reads through `supabase-js` (PostgREST) | Use the Supabase data API for tenant-scoped reads so claims flow natively; keep Prisma for migrations/admin only. | Rejected for Phase 1 — bifurcates the data layer and rewrites existing handlers. |
| C. Keep Prisma privileged + app-layer scoping; test RLS separately | Leaves DB-layer enforcement off in production. | **Rejected** — violates delivery-plan principle "enforcement is at the database layer." |

### 2.1 Concrete shape of Option A

- Create a dedicated Postgres login role, e.g. `app_authenticated`, granted table privileges
  but **not** `BYPASSRLS`; Prisma's `DATABASE_URL`/`POSTGRES_URL` connects as this role.
- Define `auth.jwt()` / `auth.uid()` shims (Supabase already provides these in the `auth`
  schema; confirm they read `request.jwt.claims`) so policy SQL is portable between the
  Prisma path and the Supabase path.
- Add `lib/db/withTenant.ts`: `withTenant(claims, (tx) => …)` opens a Prisma `$transaction`,
  sets the claims GUC as **transaction-local** (`is_local = true`), runs the callback, and the
  GUC is discarded at commit. Pool reuse is therefore safe.
- Route handlers obtain `claims` from `getSessionUser()` and run all tenant-scoped Prisma work
  inside `withTenant`. A privileged client (`prismaAdmin`, current behavior) is retained
  **only** for provisioning/onboarding and the claims hook — never for member/family reads.

> This wrapper is the load-bearing primitive for Phases 2–6. Build it first and test it hard.

---

## 3. JWT custom claims pipeline

The JWT must carry `diocese_id`, `parish_id`, `roles` under `app_metadata` (architecture §4.2,
access-control §6.1).

- **Source of truth:** `AppUser` (`dioceseId`, `parishId`, `role`). `roles` is emitted as an
  array (`[role]`) so Phase 2 multi-role is additive, not a breaking change.
- **Injection:** a Supabase **custom access token hook** (Postgres function in the `auth`
  schema, or an Edge Function) that, on token mint, looks up the `AppUser` and writes
  `app_metadata.{diocese_id,parish_id,roles}` into the claims. Lives as a Supabase SQL
  migration (see §6).
- **Backfill on user creation:** provisioning writes `AppUser` + sets Supabase
  `app_metadata` via the admin client so the first token already carries claims.
- **Server propagation:** `getSessionUser()` continues to return the `AppUser`; a new
  `getSessionClaims()` derives the claims object passed to `withTenant`. The test seam
  (`_setSessionResolver`) gains a parallel `_setClaimsResolver` so integration tests inject
  claims without minting real JWTs.

---

## 4. Schema & migration changes (Prisma)

Small additions; most Phase-1 schema already exists.

1. **Family-number scheme (MM-10).** Add a per-parish configurable scheme (prefix, width,
   start, separator) — either columns on `Parish` or a `ParishSettings` row. `lib/member-identifier.ts`
   already formats; wire CRUD to read/write the stored scheme instead of hardcoding.
2. **Member ↔ user link (deferred-friendly).** Add optional `Member.userId @db.Uuid` now so the
   self-service member policy (§6.3 of access-control) and Phase 2 slot in without a later
   migration. No self-service UI in Phase 1.
3. **Member lifecycle (MM-6).** Confirm `MemberStatus` transitions (ACTIVE→INACTIVE/DECEASED/MOVED)
   and add a `transfer` **stub** field/route (full transfer is Phase 4).
4. **Audit immutability support.** No schema change; enforced by trigger/grants in SQL (§5).

Prisma owns these via `prisma migrate`. RLS/policies/hooks/triggers do **not** go in Prisma —
see §6.

---

## 5. Deny-by-default RLS (the centerpiece)

A Supabase SQL migration that, for **every tenant-scoped table** (`Parish`, `AppUser`, `Family`,
`Member`, `AuditEntry`; structural read on `Diocese`):

1. `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` **and** `FORCE ROW LEVEL SECURITY;` (so even the
   table owner is constrained).
2. **No permissive default** — absence of a matching policy = deny.
3. Parish-scoped policy (pattern from access-control §6.1):

```sql
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member" FORCE ROW LEVEL SECURITY;

CREATE POLICY member_parish_rw ON "Member"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['parish_admin','parish_staff']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );
```

4. Diocese **structural-only** read (SE-3): diocese-level users (`parish_id` IS NULL) may read
   `Parish` rows in their diocese but get **zero** rows from `Member`/`Family` (no grant model
   until Phase 4, so deny outright now).

```sql
CREATE POLICY parish_diocese_structural_read ON "Parish"
  FOR SELECT
  USING (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
  );
```

5. `AuditEntry`: parish users read their own parish's entries; diocese users read only
   diocese-level entries (`parishId` IS NULL). **No** UPDATE/DELETE policy for anyone (§5.1).
6. `GLOBAL_ADMIN`: a narrowly-scoped break-glass policy or a separate admin role — documented and
   audited, not the default path.

> **WITH CHECK** on writes prevents a user from inserting/relocating a row into another parish —
> the cross-tenant write half of the gate, which `USING` alone does not cover.

### 5.1 Append-only audit (AU-10)

- `REVOKE UPDATE, DELETE ON "AuditEntry" FROM app_authenticated;`
- Defense-in-depth trigger `BEFORE UPDATE OR DELETE ON "AuditEntry"` that `RAISE EXCEPTION`.
- Audit writes happen through the privileged path (or a dedicated `INSERT`-only grant) so a
  request that is otherwise denied can still record the `DENIED` outcome.

---

## 6. Prisma ↔ Supabase migration coexistence (resolve the Phase-0 to-do)

Lock the convention now; every later phase depends on it:

- **Prisma migrations** (`prisma/migrations/`) own **schema** — tables, columns, enums, indexes,
  FKs.
- **Supabase SQL migrations** (`supabase/migrations/`) own **policies, RLS enablement, the
  claims hook, triggers, views, grants, and the `app_authenticated` role**.
- Ordering in CI/build: `prisma migrate deploy` → `supabase db push` (or `psql` apply of the
  SQL migrations). Document this in `README`/`Makefile` and wire into the `vercel.json` build
  and `.github/workflows/ci.yml`.
- A "policies test" asserts RLS is **enabled + forced** on every tenant table, so a future
  Prisma migration that re-creates a table without its policy is caught.

---

## 7. Application work

- **Onboarding/provisioning (PA-1, DA parish provisioning):** routes to create a diocese,
  create a parish, and assign a Parish Admin (writes `AppUser` + Supabase user + `app_metadata`).
  Privileged path; fully audited.
- **Family CRUD (FM-1–7):** complete create/update/deactivate; family number from the configured
  scheme (MM-10); all reads/writes via `withTenant`.
- **Member CRUD (MM-1/6/16):** add update, deactivate (status lifecycle), and a transfer **stub**;
  derived identifier `<familyNumber>.<index>` (already in `lib/member-identifier.ts`).
- **Audit everywhere:** every create/update/deactivate/login writes an entry with `requestId`
  correlation; denied attempts log `DENIED` (AU-1–11).
- **Refactor existing handlers** (`members`, `families`) off privileged Prisma and onto
  `withTenant` so they are RLS-governed in production, not just app-filtered.

---

## 8. Test plan → exit-gate mapping

The current integration seam injects an `AppUser` and runs Prisma **privileged**, which would
make RLS tests pass vacuously. RLS tests therefore use a **real DB session as
`app_authenticated` with claims set** — not the resolver seam.

| Layer | Tests | Gate item |
| ----- | ----- | --------- |
| Unit (Vitest) | family-number formatter (prefix/width/start), identifier derivation, uniqueness rules | — |
| Integration (Vitest + DB) | each route writes the expected audit row; validation rejects bad input; 401/403 paths correct | gate 3 (audit asserted) |
| **RLS (centerpiece)** | as Parish-A claims: every read/write on Parish-B `Member`/`Family`/`AuditEntry` returns 0 rows / is rejected (incl. cross-parish **INSERT/UPDATE** via WITH CHECK); diocese claims: 0 raw member rows, Tier-1 parish rows visible | gates 1 & 2 |
| Policy/schema | RLS enabled+forced on all tenant tables; `AuditEntry` UPDATE/DELETE raises | gate 3 |
| E2E (Playwright) | Parish Admin logs in → creates family → adds member → deactivates member; Diocese Admin logs in → sees parishes, no member rows | gate 4 |

New harness pieces: `withTenantSession(claims)` test helper opening an `app_authenticated`
connection with claims set; extend `tests/helpers/db.ts` fixtures to span **two** parishes with
distinct admins (the cross-tenant pair).

---

## 9. Work breakdown (ordered PRs)

Each PR ships code **and** its tests; DoD per delivery-plan §"Definition of Done".

1. **DB role + RLS wrapper** — `app_authenticated` role, `auth.jwt()` shim confirmed,
   `lib/db/withTenant.ts`, `withTenantSession` test helper. *(No behavior change yet; unit/contract tests.)*
2. **Claims pipeline** — access-token hook (SQL migration), provisioning sets `app_metadata`,
   `getSessionClaims()` + `_setClaimsResolver`.
3. **Schema additions** — family-number scheme, `Member.userId`, lifecycle fields (Prisma migration).
4. **RLS migration** — enable+force + parish/diocese/audit policies + WITH CHECK; policy/schema test.
5. **Audit immutability** — revoke + trigger; append-only test; denied-path logging.
6. **Refactor reads/writes onto `withTenant`** — members + families handlers; integration tests green.
7. **Onboarding/provisioning + family/member CRUD completion** — routes, audit, integration tests.
8. **RLS cross-tenant suite + E2E** — the exit-gate suite; CI label `@phase:1 @rls`.
9. **CI wiring** — Prisma→Supabase apply order; required status check; coverage holds.

Strictly sequential: 1 → 2 → (3,4,5) → 6 → 7 → 8. PR 9 lands alongside 8.

---

## 10. Risks & open decisions

- **`auth.jwt()` over the Prisma path.** Verify Supabase's `auth` schema helpers resolve against
  `request.jwt.claims` for a plain SQL session (not only PostgREST). If not, define a local
  `app.current_claims()` and write policies against it. *(Validate in PR 1 — it gates everything.)*
- **Connection pooling.** Transaction-local GUC (`set_config(..., true)`) is mandatory; a
  session-level GUC would leak claims across pooled requests. The wrapper enforces this.
- **`GLOBAL_ADMIN` scope.** Decide break-glass policy vs. dedicated superuser path; must be
  audited and out of the default request path.
- **Member self-service.** `Member.userId` is added but no MEMBER-role login flow ships in
  Phase 1 (it arrives with self-registration in Phase 3); the §6.3 policy is staged, not wired.
- **Local vs. CI DB SSL.** `lib/prisma.ts` already branches on `supabase.com`; ensure the
  `app_authenticated` connection string follows the same SSL handling.

---

## 11. Definition of "Phase 1 done"

CI runs `static → unit → integration → rls → e2e-smoke`; the `@phase:1 @rls` suite is green;
the audit table rejects mutation in test; Diocese-Admin and Parish-Admin E2E pass; coverage
threshold holds. At that point the secure multi-tenant spine exists and Phase 2 (intra-parish
access control & sensitive fields) can build on it.
