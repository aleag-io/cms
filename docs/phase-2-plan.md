# Phase 2 Implementation Plan — Intra-Parish Access Control & Sensitive Fields

> Companion to [delivery-plan.md](delivery-plan.md) Phase 2. This document turns that
> phase's deliverables into an ordered, implementable work breakdown with the concrete
> architectural decisions, schema/migration changes, RLS policies, and tests required to
> reach the **Phase 2 exit gate**. It builds directly on the secure multi-tenant spine
> delivered in [phase-1-plan.md](phase-1-plan.md) (`withTenant`, deny-by-default RLS,
> the claims pipeline, append-only audit).

**Phase goal:** correct *within-parish* visibility — the subtle, high-risk privacy rules.
Phase 1 proved Parish A ⟂ Parish B (row isolation by `parish_id`). Phase 2 proves that
*inside* a single parish, the right **fields** reach the right **roles**: clergy-only
private notes, privileged-only pastoral dates, staff-only work notes, and a member-safe
directory — all enforced at the database layer, not just hidden in the UI.

**Requirements covered:** MM-11/12/13/14/15/17/18/19, PA-11/12, SE-9; role model from
[user-roles.md](user-roles.md) §2–3; intra-parish tiers from
[access-control.md](access-control.md) §1.2, §6.1, §6.3.

**Exit gate (must all be green in CI):**
1. An automated test asserts every sensitive field (`private_notes`, work notes, pastoral
   dates) is **absent** from directory output, exports, and a non-privileged role's API
   responses.
2. Multi-parish clergy scoping is proven by an RLS test: a clergy member reads private
   notes **only** for parishes where they hold an active clergy officer position, and
   **zero** private-note rows elsewhere — even within the same diocese.
3. The permission resolver truth table (defaults + overrides + escalation guard) passes;
   override changes write audit rows.
4. E2E: Member role sees the directory **without** DOB; Clergy sees private notes; Parish
   Staff does **not**.

---

## 1. Current state (verified starting point)

| Area | State | Evidence |
| ---- | ----- | -------- |
| Row isolation (`parish_id`) | ✅ deny-by-default RLS, `withTenant`, WITH CHECK on writes | `supabase/migrations/20260629100001_rls_policies.sql`, `lib/db/withTenant.ts` |
| Claims pipeline | ✅ `app_metadata.{diocese_id,parish_id,roles}`; `claimsFromUser`/`getSessionClaims` | `lib/auth.ts`, `supabase/migrations/20260629100003_claims_hook.sql` |
| Append-only audit | ✅ revoke + trigger; `writeAuditEntry` with correlation IDs | `lib/audit.ts`, `supabase/migrations/20260629100002_audit_immutability.sql` |
| Role model | 🟡 enum `GLOBAL_ADMIN/DIOCESE_ADMIN/PARISH_ADMIN/PARISH_STAFF/MEMBER` only | `prisma/schema.prisma` |
| Clergy / officers | ❌ no `ParishOfficer`; no Clergy-role derivation | — |
| Sensitive fields | 🟡 `Member.dateOfBirth` exists as a plain column; **no** `private_notes`, `work_notes`, `education_level`; no field-level protection | `prisma/schema.prisma` |
| Member directory | ❌ no directory endpoint / projection | — |
| Multi-parish membership | ❌ `Member.parishId` is single-valued | `prisma/schema.prisma` |
| Extended family | ❌ no `MemberRelationship` | — |
| Permission overrides | ❌ no `ParishPermissionOverride`; roles are hardcoded in `requireRole(...)` | `app/api/**/route.ts` |

**The headline gap:** Phase 1 enforcement is entirely **row-scoped** (`parish_id = claim`).
Every Phase-2 rule is **field-scoped** *within a row the user is already allowed to see*. A
Parish Staff user can read a member row but must not read that member's `private_notes`.
Postgres RLS gates rows, not columns — so the central decision below is how to turn each
field-level rule into a row-level one the database can enforce.

---

## 2. The central decision — field-level protection with a single DB role

Phase 1 connects every user as the same Postgres role (`app_authenticated`) and
distinguishes them only by JWT claims. That choice (correct for row RLS) makes the obvious
column-protection tools unavailable:

| Option | How | Verdict |
| ------ | --- | ------- |
| B. Column GRANTs (`REVOKE SELECT (private_notes)`) | Postgres column privileges are per **DB role**. All users share `app_authenticated`, so a column grant cannot tell clergy from staff. | **Rejected** — incompatible with the single-role + claims model. |
| C. Per-request DB roles (`app_clergy`, `app_staff`, …) | Mint a distinct Postgres role per permission tier and `SET LOCAL ROLE` accordingly; use column grants per role. | **Rejected for Phase 2** — multiplies roles, fractures the grant matrix, and still can't express per-parish clergy scoping (MM-19) without row predicates anyway. |
| **A. Satellite tables (recommended)** | Move each protected field-group into its **own table** keyed by `member_id`, and put a normal **row** RLS policy on that table. A field-level rule becomes a row-level rule the DB enforces natively. | **Chosen.** Keeps the Phase-1 model intact; every sensitive field gets real DB-layer RLS, exactly what the exit gate demands. |

### 2.1 Concrete shape of Option A

Two satellite tables, each `member_id`-keyed (1:1 with `Member`), each with `parish_id`
denormalized for the policy predicate:

- **`MemberPrivateNote`** (MM-12, MM-19) — `private_notes` text. RLS: readable/writable only
  by a user who holds an **active clergy officer position in that member's parish** (see §3).
  No diocese access ever, even with future Emergency Access.
- **`MemberPastoralData`** (MM-15, SE-9) — `date_of_birth`, sacramental-date pointers, and
  any future pastoral dates. RLS: privileged roles only (`clergy`, `parish_admin`,
  `pastoral_data_accessor`). `Family.anniversaryDate` is the one pastoral field that lives on
  the family record; it moves to a parallel `FamilyPastoralData` row under the same policy.

Fields that are sensitive but **not** as tightly held stay as columns on `Member` and are
protected by **projection + a directory view** rather than a satellite table:

- **`work_notes`, `education_level`** (MM-11, MM-18) — visible to `parish_admin`,
  `parish_staff`, and responsible org leaders. Enforced by the application-layer field
  projection (§7) and asserted absent from directory/exports by test. These are write-rarely,
  read-by-many-staff fields where a satellite table would add joins without adding a real
  trust boundary (every staff role already sees them).

> **Why split private_notes and pastoral_data instead of one "sensitive" table?** Their
> reader sets differ: private notes are **clergy-only**; pastoral dates are **clergy +
> parish_admin + pastoral_data_accessor**. One table cannot express two different row
> policies for the same row, so they are two tables. This is the same reasoning that made
> Phase 1 split USING (read) from WITH CHECK (write).

### 2.2 The member directory (MM-14)

A `parish_member_directory` **view** projects only `parish_directory_basic` fields (name,
phone, email, address, family photo, status) and is the **only** member-shaped surface the
`MEMBER` role can read. The base `Member` table denies SELECT to the `member` role via RLS;
the view is the sanctioned read path. Diocese users get nothing here (that is Phase 4's
grant model). This makes "the directory cannot leak DOB" a structural guarantee, not a
code-review promise.

---

## 3. Clergy derivation & claims pipeline changes

The Clergy role is **not** stored on `AppUser`; it is **derived** from `ParishOfficer` where
`officer_type = 'clergy'` and `is_active` (user-roles §2.7). MM-19 requires it to be scoped
**per parish**. Two facts must reach the database session:

1. **`member_id`** of the current user — already linkable via `AppUser`→`Member.userId`
   (added in Phase 1). Surface it as `app_metadata.member_id`.
2. **`clergy_parish_ids`** — the set of parishes where this user holds an active clergy
   position. Computed from `ParishOfficer`.

**Injection options:**

- **Claims hook (preferred for the common case):** extend
  `auth.custom_access_token_hook` (Phase 1's `20260629100003`) to add `member_id` and a
  `clergy_parish_ids` array to `app_metadata` at token mint. Cheap to read in policies, but
  **stale** until the next token refresh — acceptable for officer changes, which are rare and
  can force a re-auth.
- **In-policy subquery (authoritative):** the private-notes RLS policy resolves clergy status
  live: `EXISTS (SELECT 1 FROM "ParishOfficer" po WHERE po.member_id = (claims->>'member_id')
  AND po.parish_id = "MemberPrivateNote".parish_id AND po.officer_type='clergy' AND
  po.is_active)`. Always current; immune to stale tokens. Costs one indexed lookup per row
  set.

**Decision:** use the **in-policy subquery** for the private-notes and pastoral-data write
path (correctness over staleness for the highest-risk fields), and *also* emit
`clergy_parish_ids` in claims so the **application layer** can show/hide UI without a DB
round-trip. The DB remains the source of truth. Add `_setClaimsResolver` coverage so tests
inject clergy/non-clergy claims without minting JWTs.

New roles to add to the `Role` enum and the claims `roles` array this phase:
`CLERGY` (supplementary), `MINISTRY_LEADER`, `ORGANIZATION_LEADER`, `PASTORAL_DATA_ACCESSOR`,
`DIOCESE_STAFF`. (Clergy stacks on top of a base role — user-roles §2.7 — so `roles` stays an
array, as designed in Phase 1.)

---

## 4. Schema & migration changes (Prisma)

Prisma owns tables/columns; RLS/policies/views stay in Supabase SQL (§6) — the Phase-1
convention holds.

1. **`ParishOfficer`** (PA-11) — `parishId`, `memberId`, `title`, `officerType`
   (`clergy|board|executive_committee|finance_committee|trustee|other`), `termStart`,
   `termEnd?`, `isActive`, `notes?`. Index `(parishId, officerType, isActive)` and
   `(memberId, officerType)` for the clergy subquery.
2. **`MemberPrivateNote`** — `memberId @unique`, `parishId`, `note text`, timestamps. 1:1 with
   `Member`.
3. **`MemberPastoralData`** — `memberId @unique`, `parishId`, `dateOfBirth?`, plus
   sacramental-date fields as they land; `Member.dateOfBirth` is **migrated into this table**
   and dropped from `Member` (data migration: copy then drop). `FamilyPastoralData` mirrors
   this for `anniversaryDate`.
4. **Member profile fields (MM-11)** — add `work_notes text?`, `education_level enum?`,
   `skills_interests text[]` to `Member` (non-pastoral; staff-visible).
5. **`MemberRelationship`** (MM-13) — `parishId`, `memberId`, `relatedMemberId`,
   `relationshipType` enum, `notes?`. CHECK `memberId <> relatedMemberId`; both members must
   share `parishId` (enforced by RLS + app validation). Unique `(memberId, relatedMemberId,
   relationshipType)`.
6. **Multi-parish membership (MM-17)** — new `MemberParish` join: `memberId`, `parishId`,
   `isPrimary boolean`, `membershipType` (`primary|secondary`), `joinedAt`. Partial unique
   index `(memberId) WHERE isPrimary` guarantees exactly one primary parish. `Member.parishId`
   is retained as a denormalized pointer to the primary for query ergonomics and existing RLS;
   a backfill inserts one `MemberParish(isPrimary=true)` per existing member.
7. **`ParishPermissionOverride`** (PA-12) — `parishId`, `role`, `resource`, `action`
   (`read|write|delete|export|send`), `isAllowed`, `grantedByUserId`, timestamps. Unique
   `(parishId, role, resource, action)`.

> **Migration ordering caution (MM-17 + MM-19):** moving `dateOfBirth` and broadening
> `parishId` semantics touches Phase-1 RLS predicates. Land the Prisma migration and the
> Supabase RLS migration in the **same PR**, and re-run the Phase-1 cross-tenant suite to
> prove no regression in row isolation before adding the field-level tests.

---

## 5. Permission resolver & overrides (PA-12)

A pure, unit-testable resolver is the application-layer companion to RLS (RLS is the
backstop; the resolver shapes responses and gates writes before they hit the DB).

- **`lib/permissions/defaults.ts`** — the default permission matrix from
  [user-roles.md](user-roles.md) §3 encoded as data: `Map<Role, Map<Resource, Set<Action>>>`.
- **`lib/permissions/resolver.ts`** — `can(roles, resource, action, overrides)` →
  `boolean`. Applies defaults, then parish overrides (allow/deny) on top. Deterministic and
  side-effect-free → property/truth-table tested.
- **Escalation guard** — `assertCanGrant(actorRoles, override)` rejects an override that
  grants a capability the actor does not themselves hold ("can't grant what you don't hold",
  user-roles §3 / delivery-plan Phase 2). Enforced when writing `ParishPermissionOverride`.
- **Audit** — every override create/update/delete writes an audit row
  (`access.permission.override`) with before/after, per access-control §7 "Role assigned or
  revoked" pattern.
- **Settings surface (PA-12)** — `Church Admin Settings → Permissions` reads the resolved
  matrix and writes overrides; Parish-Admin-only.

---

## 6. RLS, views & field-protection migration (Supabase)

One Supabase SQL migration (or a small ordered set) that:

1. **Enables + forces RLS** on every new table (`ParishOfficer`, `MemberPrivateNote`,
   `MemberPastoralData`, `FamilyPastoralData`, `MemberRelationship`, `MemberParish`,
   `ParishPermissionOverride`) — deny-by-default, matching Phase 1.
2. **Private notes policy (MM-12, MM-19)** — clergy-only, per-parish via the in-policy
   subquery:

```sql
ALTER TABLE "MemberPrivateNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberPrivateNote" FORCE ROW LEVEL SECURITY;

CREATE POLICY private_note_clergy_rw ON "MemberPrivateNote"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "ParishOfficer" po
      WHERE po."memberId"   = (auth.jwt()->'app_metadata'->>'member_id')::uuid
        AND po."parishId"   = "MemberPrivateNote"."parishId"
        AND po."officerType" = 'clergy'
        AND po."isActive"   = true
    )
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );
```

3. **Pastoral data policy (MM-15, SE-9)** — privileged roles only:

```sql
CREATE POLICY pastoral_privileged_rw ON "MemberPastoralData"
  FOR ALL
  USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles')
        ?| array['clergy','parish_admin','pastoral_data_accessor']
  )
  WITH CHECK (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
  );
```

4. **Member directory view (MM-14)** — `parish_member_directory` exposing only
   `parish_directory_basic` fields; `SELECT` granted to all same-parish authenticated users,
   while base-`Member` SELECT remains denied to the bare `member` role:

```sql
CREATE VIEW parish_member_directory
WITH (security_invoker = true) AS
SELECT id, "parishId", "firstName", "lastName", email, phone, "photoUrl", status
FROM "Member"
WHERE status = 'active';
-- security_invoker → the caller's RLS on "Member" still applies; the view only narrows columns.
```

5. **Multi-parish read (MM-17)** — broaden the `Member` SELECT policy so a user sees members
   of **any** parish in their `MemberParish` set (union), while writes stay scoped to the
   primary parish via WITH CHECK.
6. **Policy/schema test hook** — extend the Phase-1 "RLS enabled+forced on every tenant
   table" assertion to include all new tables, so a future Prisma migration that recreates one
   without its policy fails CI.

> **Column note:** `MemberPrivateNote`/`MemberPastoralData` carry the protected data; the
> parent `Member` row no longer holds those columns, so even a mis-scoped `SELECT *` on
> `Member` cannot leak them. That is the structural payoff of Option A.

---

## 7. Application work

- **Field projection helper** — `lib/projection.ts`: `projectMember(member, can)` strips
  `work_notes`/pastoral/private fields the caller may not see, used by **every** member-
  returning endpoint. Centralized so "no leak" is one tested function, not N handlers.
- **Officer management (PA-11)** — `ParishOfficer` CRUD (Parish-Admin write; clergy/board
  view per matrix); assigning a `clergy` officer derives the Clergy role (claims + policy).
- **Private notes endpoints** — read/write `MemberPrivateNote`; clergy-only; **per-record**
  audit on read and write (access-control §1.2: "reads and writes on pastoral-sensitive fields
  are audited per record"; same for private notes §3.1).
- **Pastoral data endpoints** — read/write `MemberPastoralData`/`FamilyPastoralData`;
  privileged roles; per-record audit.
- **Directory endpoint (MM-14)** — `GET /api/parish/directory` over the view; available to the
  `MEMBER` role for their own parish; basic fields only.
- **Extended family (MM-13)** — `MemberRelationship` CRUD; both members same parish.
- **Multi-parish (MM-17)** — `MemberParish` management; primary-parish switch; default context
  = primary unless overridden.
- **Permissions settings (PA-12)** — resolver + overrides UI/endpoints (§5).
- **Audit everywhere** — officer changes, permission overrides, and per-record sensitive
  reads/writes all write entries.

---

## 8. Test plan → exit-gate mapping

RLS tests run as a **real `app_authenticated` DB session with claims set** (the Phase-1
`withTenantSession` helper), never through the privileged resolver seam — otherwise field
policies pass vacuously.

| Layer | Tests | Gate item |
| ----- | ----- | --------- |
| Unit (Vitest) | permission resolver truth table (defaults × overrides × escalation guard); `projectMember` strips private/work/pastoral for each role | gate 3 |
| **RLS (centerpiece)** | non-clergy (incl. Parish Admin) reading `MemberPrivateNote` → **0 rows**; multi-parish clergy → private notes only for their clergy parishes, 0 elsewhere; non-privileged role on `MemberPastoralData` → 0 rows; directory view excludes DOB/private/work | gates 1 & 2 |
| Integration (Vitest + DB) | directory endpoint and member export contain **no** sensitive fields; override write writes an audit row and is rejected when it would escalate; per-record sensitive read writes an audit row | gates 1 & 3 |
| Policy/schema | RLS enabled+forced on all new tables; directory view exposes only basic columns (schema assertion: no `private_notes`/`date_of_birth` column present) | gate 1 |
| E2E (Playwright) | Member sees directory without DOB; Clergy sees private notes; Parish Staff does not; Pastoral Data Accessor sees pastoral dates, plain Staff does not | gate 4 |

New harness pieces: fixtures for a **clergy** user (ParishOfficer `clergy`) and a
**multi-parish clergy** user (clergy at Parish A, not Parish B); a `pastoral_data_accessor`
user; an override fixture. Reuse the Phase-1 two-parish base fixture.

---

## 9. Work breakdown (ordered PRs)

Each PR ships code **and** its tests; DoD per delivery-plan §"Definition of Done".

1. **Roles + claims** — extend `Role` enum and `roles` array (`CLERGY`, `MINISTRY_LEADER`,
   `ORGANIZATION_LEADER`, `PASTORAL_DATA_ACCESSOR`, `DIOCESE_STAFF`); add `member_id` +
   `clergy_parish_ids` to claims hook; `_setClaimsResolver` coverage. *(No behavior change;
   contract tests.)*
2. **ParishOfficer** — table + CRUD + Clergy derivation; RLS; officer-change audit.
3. **Satellite tables + data migration** — `MemberPrivateNote`, `MemberPastoralData`,
   `FamilyPastoralData`; migrate `Member.dateOfBirth`/`Family.anniversaryDate` in and drop the
   columns; **re-run Phase-1 cross-tenant suite** to prove no row-isolation regression.
4. **Field-protection RLS** — private-notes (clergy, per-parish subquery) + pastoral-data
   (privileged) policies + WITH CHECK; the RLS centerpiece tests (gates 1 & 2).
5. **Directory view + projection** — `parish_member_directory` view, `lib/projection.ts`,
   directory endpoint; "no sensitive field in directory/export" test.
6. **MM-11 profile fields + endpoints** — `work_notes`/`education_level`/`skills`; staff-only
   projection; per-record sensitive-read audit.
7. **Permission resolver + overrides (PA-12)** — defaults matrix, resolver, escalation guard,
   `ParishPermissionOverride` CRUD + settings surface; truth-table + audit tests (gate 3).
8. **MemberRelationship (MM-13)** + **MemberParish / multi-parish (MM-17)** — schema, CRUD,
   broadened read policy; primary-parish invariant test.
9. **RLS field suite + E2E + CI label** — the exit-gate suite under `@phase:2 @rls`; CI wiring.

Strictly sequential: 1 → 2 → 3 → 4 → 5. PRs 6, 7, 8 can parallelize after 5; 9 lands last.

---

## 10. Risks & open decisions

- **Stale clergy claims (MM-19).** Token-cached `clergy_parish_ids` lags officer changes.
  Mitigation: the **DB policy uses the live subquery**, so security never depends on the cached
  claim; the claim is a UI hint only. Decide a re-auth/refresh trigger on officer change.
- **`security_invoker` view semantics.** Confirm the directory view with
  `security_invoker = true` correctly applies the caller's `Member` RLS (Postgres ≥15 /
  Supabase). If the base policy denies `member`-role SELECT on `Member`, the view must still
  return rows for the directory — validate the policy pair in PR 5 before building on it.
- **`dateOfBirth` move is destructive.** Dropping the column after copy is irreversible
  per-environment. Gate behind the data-migration test (row counts match pre/post) and the
  re-run of Phase-1 RLS; never drop before the copy is asserted.
- **Multi-parish RLS surface area (MM-17).** Broadening `Member` reads to a `MemberParish`
  union widens the most security-critical policy in the system. Keep WITH CHECK pinned to the
  **primary** parish for writes; add an explicit "secondary parish cannot mutate" RLS test.
- **Resolver vs. RLS drift.** The application resolver and the DB policies can disagree. RLS is
  authoritative; the resolver must never be the *only* gate on a sensitive field. Every
  resolver rule that protects a satellite-table field must have a corresponding RLS test so the
  two cannot silently diverge.
- **Pastoral Data Accessor delegation.** It is a role-based delegation (MM-15). Confirm whether
  it is assigned on `AppUser.role`/claims or via a `ParishOfficer`-like delegation row; the
  policy in §6 assumes it is present in the `roles` claim.

---

## 11. Definition of "Phase 2 done"

CI runs `static → unit → integration → rls → e2e-smoke`; the `@phase:2 @rls` suite is green;
a single automated test proves `private_notes`, work notes, and pastoral dates are absent from
directory output, exports, and non-privileged API responses; multi-parish clergy scoping is
RLS-proven; the permission resolver truth table (with escalation guard) passes and override
writes are audited; the Member/Clergy/Staff directory E2E passes; coverage threshold holds. At
that point intra-parish field-level access control is enforced at the database layer, and
Phase 4 (data-sharing governance) can safely build the diocese-facing grant model on top —
with the guarantee that private notes and pastoral dates are structurally unshareable.
