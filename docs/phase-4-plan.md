# Phase 4 Implementation Plan — Data-Sharing Governance & Diocese Aggregate

> Companion to [delivery-plan.md](delivery-plan.md) Phase 4. This turns that phase's
> deliverables into an ordered, implementable work breakdown with the concrete
> architectural decisions, schema/migrations, RLS policies, aggregate views, and tests
> required to reach the **Phase 4 exit gate**. It builds directly on the Phase 1–3 spine:
> `withTenant`, deny-by-default + forced RLS, the claims pipeline, the permission resolver,
> and append-only audit.

**Phase goal:** enforce parish data sovereignty at the database layer — diocese users see
aggregate summaries (Tier 2) by default, raw records (Tier 3) only when an active,
unexpired, category-matched DataSharingGrant exists. Revocation is immediate. Additionally:
Emergency Access override for exceptional diocese-admin cases, and a universal contextual
sharing workflow (user/role/secure-link) for all resources.

**Requirements covered:** MT-5/7–15, DA-1/6, AU-12/13, SE-4; access-control §2–3, §6–7.

**Exit gate (must all be green in CI):**
1. **Grant gates Tier-3 (RLS):** diocese role + no grant → zero raw rows from Member and
   Family tables; active grant for `member_directory` → rows visible; grant for a *different*
   category does **not** expose `member_directory` rows; expired grant → zero rows; revoked
   grant → zero rows on the very next query.
2. **Aggregate views contain no PII (unit):** a schema-level assertion confirms no PII
   column (`name`, `email`, `phone`, `address`, `dob`, etc.) appears in any `diocese_*`
   aggregate view; diocese-role queries against aggregate views return counts/totals only.
3. **Full sharing lifecycle has audit entries (integration):** `DataSharingRequest` created →
   approved → grant issued → revoked — each step writes exactly the audit entry described in
   access-control §7; secure-link token is never stored or logged in plaintext; expired /
   exhausted / revoked secure links return 403.

---

## 1. Current state (Phase 3 exit)

| Area | State | Evidence |
| ---- | ----- | -------- |
| Tenant isolation + `withTenant` | ✅ forced RLS on all tenant tables | `lib/db/withTenant.ts`, Phase 1+2 SQL migrations |
| Claims pipeline | ✅ `diocese_id`, `parish_id`, `roles`, `member_id`, `program_leader_ids`, `org_leader_ids` | `lib/auth.ts`, `supabase/migrations/*_claims_hook.sql` |
| Role enum | ✅ 10 roles; **missing** `DIOCESE_REPORT_VIEWER`, `PARISH_DATA_SHARING_MANAGER` | `prisma/schema.prisma` |
| Append-only audit | ✅ `writeAuditEntry`, revoke+trigger on `AuditEntry` | `lib/audit.ts`, Phase 1 SQL |
| Data sharing tables | ❌ none — no `DataSharingRequest`, `DataSharingGrant`, `EmergencyAccessGrant`, `ContextualShare` | — |
| Grant-aware RLS | ❌ diocese reads are blocked by deny-by-default; no grant-check policy | Phase 1 SQL migrations |
| Tier-2 aggregate views | ❌ none | — |
| Token utilities | ❌ none — no cryptographic token generation/hashing | — |

**The headline shift:** Phases 1–3 scoped access by *parish* (row) and *field* (column /
satellite table) for users *within* a parish. Phase 4 introduces *cross-boundary* reads —
diocese users reading parish data — with the grant as the gating record. The DB is still
the sole enforcement point; the application layer surfaces and manages the grant lifecycle.

---

## 2. Central decisions

### 2.1 Grant-aware RLS via SECURITY DEFINER helper

The same pattern used for sub-parish leader scoping (Phase 3) applies here. An in-policy
`EXISTS` subquery against `DataSharingGrant` would cause recursion if the grant table is
also protected by RLS. Instead, two SECURITY DEFINER SQL functions run as the privileged
role:

```sql
-- Returns true when an active, unexpired grant for the given parish+category exists
-- targeting the calling user's diocese.
CREATE OR REPLACE FUNCTION public.has_active_grant(
  p_parish_id uuid,
  p_category  text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "DataSharingGrant" g
    WHERE g."parishId"     = p_parish_id
      AND g."dataCategory" = p_category::"DataCategory"
      AND g."granteeType"  = 'DIOCESE'
      AND g."granteeId"    = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
      AND g."isActive"     = true
      AND (g."expiresAt" IS NULL OR g."expiresAt" > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.has_emergency_access(p_parish_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "EmergencyAccessGrant" e
    WHERE e."parishId"  = p_parish_id
      AND e."dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
      AND e."isActive"  = true
      AND e."expiresAt" > now()
  )
$$;
```

The diocese-read policy on `Member` becomes:

```sql
CREATE POLICY diocese_grant_read ON "Member"
  FOR SELECT USING (
    (auth.jwt()->'app_metadata'->>'parish_id') IS NULL  -- diocese-level user
    AND (auth.jwt()->'app_metadata'->>'diocese_id') IS NOT NULL
    AND (
      has_active_grant("parishId", 'MEMBER_DIRECTORY')
      OR has_emergency_access("parishId")
    )
  );
```

The same helper is applied to `Family` (with `FAMILY_RECORDS`) and to future sensitive
tables as they land (sacramental, giving, etc.). Category isolation is enforced at the
helper: a `FAMILY_RECORDS` grant does not satisfy `has_active_grant(_, 'MEMBER_DIRECTORY')`.

### 2.2 Aggregate views run as a privileged role (SECURITY DEFINER)

Diocese Report Viewer and diocese staff need Tier-2 counts without any raw-row access.
The cleanest pattern is a `SECURITY DEFINER` SQL view (or materialized view) owned by the
superuser that computes aggregates from the underlying tenant tables. `app_authenticated`
gets SELECT on the *view* only; the underlying `Member`/`Family` tables remain deny-by-default
for diocese queries unless a grant exists.

For materialized views, a scheduled refresh job updates them on a configurable interval
(Phase 4 default: 1 hour). A regular view is simpler and always current but scales less
well with 200 parishes — start with a regular SECURITY DEFINER view and add materialization
later in Phase 7 if PE-12 becomes a concern.

### 2.3 Secure-link tokens: generate raw → store hash → compare constant-time

Per AU-12:

```ts
// lib/sharing/tokens.ts
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');        // 64-char hex, returned to caller
  const hash = createHash('sha256').update(raw).digest('hex');  // stored in DB
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function verifyToken(raw: string, storedHash: string): boolean {
  const incoming = Buffer.from(hashToken(raw), 'hex');
  const stored   = Buffer.from(storedHash, 'hex');
  if (incoming.length !== stored.length) return false;
  return timingSafeEqual(incoming, stored);
}
```

The raw token is returned once in the API response (secure link URL). Only the hash is
persisted in `ContextualShare.tokenHash`. Nothing in the audit payload or logs may contain
the raw token (AU-12, SE-8).

### 2.4 Emergency Access is separate from DataSharingGrant

Emergency Access must be visible in both the parish UI and audit as a distinct category —
never silently merged with normal grants. It lives in `EmergencyAccessGrant`, has a forced
7-day ceiling, is view-only (SELECT only in RLS; the `has_emergency_access` function is
only referenced from SELECT policies), and cannot be used to create contextual shares.

### 2.5 `ContextualShare` uses the privileged prisma client for token lookup

Secure-link resolution hits `GET /api/shares/link/[token]`. The handler must look up the
share by `tokenHash` before it can verify whether the requesting user has access — this
is a pre-auth step analogous to self-registration. Use the privileged `prisma` client
(not `withTenant`) for the token lookup itself, then apply projection and anonymization
in application code. Every view, denial, and expiry is audited.

---

## 3. Work breakdown

Eight PRs in dependency order. PRs 1–2 are infrastructure; PRs 3–7 are features;
PR 8 is the exit gate test suite (written after the behavior exists, but assertions
should be drafted early to guide implementation).

| PR | Title | Key outputs |
| -- | ----- | ----------- |
| 4-1 | Schema: new roles + sharing models | Prisma migration; 2 new Role values; 4 new models + 5 enums |
| 4-2 | SQL: grant-aware RLS + aggregate views | `has_active_grant()`, `has_emergency_access()`, diocese-read policies on Member+Family, `diocese_parish_member_summary` view, grants for new tables |
| 4-3 | Sharing request lifecycle API | `POST /api/sharing/requests`, `PATCH /api/sharing/requests/[id]`, auto-expire cron |
| 4-4 | Grant CRUD + revocation API | `GET/POST /api/sharing/grants`, `DELETE /api/sharing/grants/[id]` |
| 4-5 | Emergency access API | `POST/GET /api/sharing/emergency`, `DELETE /api/sharing/emergency/[id]`, expiry cron |
| 4-6 | Token utilities + contextual sharing API | `lib/sharing/tokens.ts`, `lib/sharing/anonymize.ts`, all `/api/shares/…` routes |
| 4-7 | Diocese aggregate endpoint | `GET /api/diocese/aggregate`, queries Tier-2 views only |
| 4-8 | Exit gate tests | `tests/rls/phase4-*.ts`, `tests/integration/api/phase4-*.ts`, `tests/unit/sharing.test.ts` |

---

## 4. PR 4-1 — Schema: new roles + sharing models

### 4.1 Prisma migration

Migration timestamp: `20260630000001_phase4_data_sharing`

```sql
-- Add two new roles
ALTER TYPE "Role" ADD VALUE 'DIOCESE_REPORT_VIEWER';
ALTER TYPE "Role" ADD VALUE 'PARISH_DATA_SHARING_MANAGER';

-- New enums
CREATE TYPE "DataCategory" AS ENUM (
  'MEMBER_DIRECTORY',
  'MEMBER_DEMOGRAPHICS_DETAIL',
  'FAMILY_RECORDS',
  'SACRAMENTAL_RECORDS',
  'GIVING_DETAIL',
  'GIVING_STATEMENTS',
  'PROGRAM_ROSTER',
  'FINANCIAL_STATEMENTS',
  'LEDGER_DETAIL',
  'ATTENDANCE_DETAIL',
  'AUDIT_LOG',
  'COMMUNICATIONS_HISTORY'
);

CREATE TYPE "GranteeType"          AS ENUM ('DIOCESE', 'PARISH');
CREATE TYPE "SharingScope"         AS ENUM ('ALL_RECORDS', 'SUMMARY_ONLY', 'PROGRAM_SCOPED', 'PERIOD_SCOPED');
CREATE TYPE "SharingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "ShareMode"            AS ENUM ('USER_SHARE', 'ROLE_SHARE', 'SECURE_LINK');

-- DataSharingRequest: diocese initiates; parish approves/rejects
CREATE TABLE "DataSharingRequest" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parishId"            UUID NOT NULL REFERENCES "Parish"("id"),
  "dioceseId"           UUID NOT NULL REFERENCES "Diocese"("id"),
  "dataCategory"        "DataCategory" NOT NULL,
  "reason"              TEXT NOT NULL,
  "status"              "SharingRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId"   UUID NOT NULL REFERENCES "AppUser"("id"),
  "reviewedByUserId"    UUID REFERENCES "AppUser"("id"),
  "reviewedAt"          TIMESTAMPTZ,
  "expiresAt"           TIMESTAMPTZ NOT NULL,  -- auto-expire 14 days after creation
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DataSharingGrant: parish-issued; gates Tier-3 diocese access
CREATE TABLE "DataSharingGrant" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parishId"            UUID NOT NULL REFERENCES "Parish"("id"),
  "dioceseId"           UUID NOT NULL REFERENCES "Diocese"("id"),
  "dataCategory"        "DataCategory" NOT NULL,
  "granteeType"         "GranteeType"  NOT NULL DEFAULT 'DIOCESE',
  "granteeId"           UUID NOT NULL,
  "granteeRoleFilter"   "Role",
  "scope"               "SharingScope" NOT NULL DEFAULT 'ALL_RECORDS',
  "scopeDetail"         JSONB,
  "grantedByUserId"     UUID NOT NULL REFERENCES "AppUser"("id"),
  "requestId"           UUID UNIQUE REFERENCES "DataSharingRequest"("id"),
  "grantedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt"           TIMESTAMPTZ,
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "revokedAt"           TIMESTAMPTZ,
  "revokedByUserId"     UUID REFERENCES "AppUser"("id"),
  "notes"               TEXT
);
CREATE INDEX ON "DataSharingGrant" ("parishId", "dataCategory", "isActive");

-- EmergencyAccessGrant: diocese admin override, ≤7 days, view-only, separate from grants
CREATE TABLE "EmergencyAccessGrant" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parishId"            UUID NOT NULL REFERENCES "Parish"("id"),
  "dioceseId"           UUID NOT NULL REFERENCES "Diocese"("id"),
  "grantedByUserId"     UUID NOT NULL REFERENCES "AppUser"("id"),
  "justification"       TEXT NOT NULL,
  "grantedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt"           TIMESTAMPTZ NOT NULL,  -- enforced ≤7 days from grantedAt
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "revokedAt"           TIMESTAMPTZ,
  "revokedByUserId"     UUID REFERENCES "AppUser"("id")
);

-- ContextualShare: user/role/secure-link shares for any resource
CREATE TABLE "ContextualShare" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parishId"            UUID NOT NULL REFERENCES "Parish"("id"),
  "dioceseId"           UUID NOT NULL REFERENCES "Diocese"("id"),
  "resourceType"        TEXT NOT NULL,          -- e.g. 'member_list', 'report'
  "resourceId"          TEXT,
  "shareMode"           "ShareMode" NOT NULL,
  "createdByUserId"     UUID NOT NULL REFERENCES "AppUser"("id"),
  "recipientUserId"     UUID REFERENCES "AppUser"("id"),  -- user_share
  "recipientRole"       "Role",                            -- role_share
  "tokenHash"           TEXT UNIQUE,                       -- secure_link: SHA-256 of raw token
  "isAnonymized"        BOOLEAN NOT NULL DEFAULT false,
  "expiresAt"           TIMESTAMPTZ,
  "maxViews"            INTEGER,
  "viewCount"           INTEGER NOT NULL DEFAULT 0,
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "revokedAt"           TIMESTAMPTZ,
  "revokedByUserId"     UUID REFERENCES "AppUser"("id"),
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 Prisma schema models (in `prisma/schema.prisma`)

Add the five enums and four models with all relations. The `Role` enum additions (`DIOCESE_REPORT_VIEWER`, `PARISH_DATA_SHARING_MANAGER`) go at the top of the enum. The `proxy.ts` public-path list does not change (no new unauthenticated routes in this phase).

---

## 5. PR 4-2 — SQL: grant-aware RLS + aggregate views

Migration timestamp: `20260630000002_phase4_data_sharing_rls.sql` (in `supabase/migrations/`)

### 5.1 Grants to app_authenticated

```sql
GRANT SELECT, INSERT, UPDATE ON "DataSharingRequest"  TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "DataSharingGrant"    TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "EmergencyAccessGrant" TO app_authenticated;
GRANT SELECT, INSERT, UPDATE ON "ContextualShare"     TO app_authenticated;
```

### 5.2 Deny-by-default RLS on new tables

```sql
ALTER TABLE "DataSharingRequest"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataSharingRequest"   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "DataSharingGrant"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataSharingGrant"     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "EmergencyAccessGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmergencyAccessGrant" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "ContextualShare"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContextualShare"      FORCE  ROW LEVEL SECURITY;
```

### 5.3 SECURITY DEFINER grant-check functions

See §2.1 above. Both functions are created in the `public` schema, owned by the migration
user (superuser), with `SECURITY DEFINER SET search_path = public`.

```sql
-- (full CREATE OR REPLACE bodies as in §2.1)
CREATE OR REPLACE FUNCTION public.has_active_grant(p_parish_id uuid, p_category text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$...$$;

CREATE OR REPLACE FUNCTION public.has_emergency_access(p_parish_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$...$$;
```

### 5.4 Diocese-read policies on existing tables

Add SELECT policies to `Member` and `Family` (already have ENABLE+FORCE from Phase 1):

```sql
-- Member: diocese read with active grant OR emergency access
CREATE POLICY diocese_grant_read ON "Member"
  FOR SELECT USING (
    (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
    AND (auth.jwt()->'app_metadata'->>'diocese_id') IS NOT NULL
    AND (
      has_active_grant("parishId", 'MEMBER_DIRECTORY')
      OR has_emergency_access("parishId")
    )
  );

-- Family: diocese read with active grant OR emergency access
CREATE POLICY diocese_grant_read ON "Family"
  FOR SELECT USING (
    (auth.jwt()->'app_metadata'->>'parish_id') IS NULL
    AND (auth.jwt()->'app_metadata'->>'diocese_id') IS NOT NULL
    AND (
      has_active_grant("parishId", 'FAMILY_RECORDS')
      OR has_emergency_access("parishId")
    )
  );
```

Sensitive tables that have not landed yet (sacramental, giving, ledger — Phase 5+) will
each get an equivalent policy when they land. This plan establishes the pattern; the
pattern file is `supabase/migrations/PHASE5_…_rls.sql`.

### 5.5 RLS on new sharing tables

```sql
-- DataSharingRequest: diocese creates (for their diocese), parish reads (their parish)
CREATE POLICY request_diocese_write ON "DataSharingRequest"
  FOR INSERT WITH CHECK (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'roles')::jsonb ?| ARRAY['DIOCESE_ADMIN','DIOCESE_STAFF']
  );

CREATE POLICY request_parish_read ON "DataSharingRequest"
  FOR SELECT USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    OR "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

CREATE POLICY request_parish_update ON "DataSharingRequest"
  FOR UPDATE USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'roles')::jsonb
          ?| ARRAY['PARISH_ADMIN','PARISH_DATA_SHARING_MANAGER']
  );

-- DataSharingGrant: parish admin / data sharing manager creates and revokes
CREATE POLICY grant_parish_rw ON "DataSharingGrant"
  FOR ALL USING (
    "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'roles')::jsonb
          ?| ARRAY['PARISH_ADMIN','PARISH_DATA_SHARING_MANAGER']
  );

CREATE POLICY grant_diocese_read ON "DataSharingGrant"
  FOR SELECT USING (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'roles')::jsonb
          ?| ARRAY['DIOCESE_ADMIN','DIOCESE_STAFF','DIOCESE_REPORT_VIEWER']
  );

-- EmergencyAccessGrant: only diocese admin may write; parish reads their own
CREATE POLICY emergency_diocese_admin_write ON "EmergencyAccessGrant"
  FOR INSERT WITH CHECK (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'roles')::jsonb ? 'DIOCESE_ADMIN'
  );

CREATE POLICY emergency_read ON "EmergencyAccessGrant"
  FOR SELECT USING (
    "parishId"  = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
    OR "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
  );

CREATE POLICY emergency_revoke ON "EmergencyAccessGrant"
  FOR UPDATE USING (
    "dioceseId" = (auth.jwt()->'app_metadata'->>'diocese_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'roles')::jsonb ? 'DIOCESE_ADMIN'
  );

-- ContextualShare: creator or admin can manage; recipient can view
CREATE POLICY share_creator_rw ON "ContextualShare"
  FOR ALL USING (
    "createdByUserId" = (auth.jwt()->'app_metadata'->>'user_id')::uuid
    OR (
      "parishId" = (auth.jwt()->'app_metadata'->>'parish_id')::uuid
      AND (auth.jwt()->'app_metadata'->>'roles')::jsonb
            ?| ARRAY['PARISH_ADMIN','PARISH_DATA_SHARING_MANAGER']
    )
  );
```

### 5.6 Tier-2 aggregate views

These are SECURITY DEFINER so they can compute aggregates from `Member`/`Family` even
though diocese-role queries are otherwise denied on those tables.

```sql
-- Owner: superuser (migration role); app_authenticated gets SELECT on the view only.

CREATE OR REPLACE VIEW public.diocese_parish_member_summary
  WITH (security_invoker = false) AS
  SELECT
    "parishId"                                                     AS parish_id,
    count(*) FILTER (WHERE status = 'ACTIVE')                     AS active_count,
    count(*) FILTER (WHERE status = 'INACTIVE')                   AS inactive_count,
    count(*) FILTER (WHERE status = 'DECEASED')                   AS deceased_count,
    count(*) FILTER (WHERE status = 'MOVED')                      AS moved_count,
    count(*) FILTER (WHERE gender = 'MALE')                       AS male_count,
    count(*) FILTER (WHERE gender = 'FEMALE')                     AS female_count
  FROM "Member"
  GROUP BY "parishId";
-- No name, email, phone, address, dob, memberNumber, or any direct identifier column.

CREATE OR REPLACE VIEW public.diocese_parish_family_summary
  WITH (security_invoker = false) AS
  SELECT
    "parishId"              AS parish_id,
    count(*)                AS family_count,
    count(*) FILTER (WHERE "isActive" = true) AS active_family_count
  FROM "Family"
  GROUP BY "parishId";

GRANT SELECT ON public.diocese_parish_member_summary TO app_authenticated;
GRANT SELECT ON public.diocese_parish_family_summary TO app_authenticated;
```

Additional aggregate views for sacraments, events, programs, and giving will be added in
Phases 5–6 as those tables land. Each view follows the same rule: only counts/sums/dates,
never names or contact fields.

---

## 6. PR 4-3 — Sharing request lifecycle API

### API routes

**`app/api/sharing/requests/route.ts`**

- `GET` — diocese users see their outgoing requests; parish users see incoming requests for
  their parish. Filtered by `status` query param.
- `POST` — diocese only (`DIOCESE_ADMIN` or `DIOCESE_STAFF`). Body: `{ parishId, dataCategory, reason }`.
  Sets `expiresAt = now() + 14 days`. Writes audit entry `sharing.request.create`.

**`app/api/sharing/requests/[id]/route.ts`**

- `PATCH` — parish only (`PARISH_ADMIN` or `PARISH_DATA_SHARING_MANAGER`). Body:
  `{ decision: 'APPROVE' | 'REJECT' }`.
  - On `APPROVE`: sets `status = APPROVED`, `reviewedByUserId`, `reviewedAt`; creates a
    `DataSharingGrant` via `withTenant`; writes audit entries for both
    `sharing.request.approve` and `sharing.grant.create`.
  - On `REJECT`: sets `status = REJECTED`; writes audit entry `sharing.request.reject`.

### Auto-expire cron

Add to `vercel.json`:
```json
{ "path": "/api/jobs/expire-sharing-requests", "schedule": "0 */6 * * *" }
```

`app/api/jobs/expire-sharing-requests/route.ts` — `CRON_SECRET`-guarded; updates
`DataSharingRequest` where `status = 'PENDING'` and `expiresAt < now()` → `status = 'EXPIRED'`;
writes audit entry `sharing.request.expire` per row. Uses privileged `prisma` (no tenant scope
needed — privileged job).

---

## 7. PR 4-4 — Grant CRUD + revocation API

**`app/api/sharing/grants/route.ts`**

- `GET` — parish users see grants for their parish; diocese users see all grants where
  `granteeId = dioceseId`. Sorted by `grantedAt desc`.
- `POST` — parish proactively creates a grant without a request. Roles: `PARISH_ADMIN`,
  `PARISH_DATA_SHARING_MANAGER`. Body: `{ dataCategory, granteeType, granteeId, scope, scopeDetail?, expiresAt?, notes? }`.
  Writes audit entry `sharing.grant.create`.

**`app/api/sharing/grants/[id]/route.ts`**

- `GET` — detail view; accessible to both granting parish and grantee diocese.
- `DELETE` — revoke. Roles: `PARISH_ADMIN`, `PARISH_DATA_SHARING_MANAGER`. Sets
  `isActive = false`, `revokedAt = now()`, `revokedByUserId`. Writes audit entry
  `sharing.grant.revoke`. Revocation is synchronous — RLS re-evaluates on the next query.

---

## 8. PR 4-5 — Emergency access API

**`app/api/sharing/emergency/route.ts`**

- `GET` — diocese users see their active emergency grants; parish users see grants against
  their parish.
- `POST` — `DIOCESE_ADMIN` only. Body: `{ parishId, justification, durationDays }` where
  `durationDays ≤ 7` (enforced: `Math.min(body.durationDays, 7)`). Sets
  `expiresAt = now() + durationDays`. Writes audit entry `sharing.emergency.create`.
  Sends in-app notification stub to the parish's `PARISH_ADMIN` users.

**`app/api/sharing/emergency/[id]/route.ts`**

- `DELETE` — early revocation by `DIOCESE_ADMIN`. Sets `isActive = false`, `revokedAt`,
  `revokedByUserId`. Writes audit entry `sharing.emergency.revoke`.

### Expiry cron

Add to `vercel.json`:
```json
{ "path": "/api/jobs/expire-emergency-access", "schedule": "*/30 * * * *" }
```

Sets `isActive = false` on `EmergencyAccessGrant` where `expiresAt < now()` and
`isActive = true`. Writes audit entry `sharing.emergency.expire` per row.

---

## 9. PR 4-6 — Token utilities + contextual sharing API

### `lib/sharing/tokens.ts`

See §2.3. Exports `generateToken()`, `hashToken()`, `verifyToken()`.

### `lib/sharing/anonymize.ts`

Per-resource-type projection map. Strips direct identifiers for anonymized shares:

```ts
// PII fields excluded from any anonymized share
const PII_FIELDS = ['name', 'firstName', 'lastName', 'email', 'phone',
                    'mobilePhone', 'address', 'memberNumber', 'envelopeNumber',
                    'dateOfBirth', 'photo'] as const;

export function anonymizeMember(member: Record<string, unknown>): Record<string, unknown> {
  const out = { ...member };
  for (const f of PII_FIELDS) delete out[f];
  delete out['privateNotes'];    // never shareable
  delete out['workNotes'];       // never exported per MM-18
  return out;
}
```

The projection function is pure — easy to unit-test with a known fixture and assert each
forbidden field is absent in output.

### API routes

**`app/api/shares/route.ts`**

- `POST` — create a share. Roles: any authenticated user with sharing permission for the
  resource. Body: `{ resourceType, resourceId?, shareMode, recipientUserId?, recipientRole?, isAnonymized, expiresAt?, maxViews? }`.
  - For `SECURE_LINK`: calls `generateToken()`, stores `hash`, returns the raw token in the
    response body (only time it appears outside the wire). Writes audit entry `sharing.share.create`.

**`app/api/shares/[id]/route.ts`**

- `GET` — detail, for creator and admin.
- `DELETE` — revoke by creator or admin. Sets `isActive = false`. Writes audit entry
  `sharing.share.revoke`.

**`app/api/shares/[id]/view/route.ts`**

- `GET` — authenticated access for `USER_SHARE` / `ROLE_SHARE`. Validates:
  1. Share `isActive`; `expiresAt > now()`; `viewCount < maxViews` (if set).
  2. For `USER_SHARE`: `session.userId === share.recipientUserId`.
  3. For `ROLE_SHARE`: session claims include `share.recipientRole`.
  Increments `viewCount`, writes audit entry `sharing.share.view`. Returns the resource
  payload (anonymized if `isAnonymized`). On any denial: audit entry `sharing.share.denied`.

**`app/api/shares/link/[token]/route.ts`**

- `GET` — unauthenticated (secure link). Looks up `ContextualShare` by
  `hashToken(params.token)` using privileged `prisma`. Validates: `isActive`, `expiresAt`,
  `viewCount < maxViews`. On valid: increment view count, write audit `sharing.share.view`,
  return anonymized payload if `isAnonymized = true`. On denial: 403 + audit
  `sharing.share.denied`. The raw token must never appear in any log or audit payload.

Add `/api/shares/link` to the public paths in `proxy.ts` (unauthenticated secure links).

---

## 10. PR 4-7 — Diocese aggregate endpoint

**`app/api/diocese/aggregate/route.ts`**

- `GET` — roles: `DIOCESE_ADMIN`, `DIOCESE_STAFF`, `DIOCESE_REPORT_VIEWER`.
  Optional `?parishId=` to filter to one parish.

The handler uses the privileged `prisma` client and queries the `diocese_parish_member_summary`
and `diocese_parish_family_summary` views directly (raw SQL via `$queryRaw`):

```ts
const rows = await prisma.$queryRaw<MemberSummaryRow[]>`
  SELECT * FROM diocese_parish_member_summary
  ${parishId ? Prisma.sql`WHERE parish_id = ${parishId}::uuid` : Prisma.empty}
  ORDER BY parish_id
`;
```

No `withTenant` — aggregate views are already SECURITY DEFINER and diocese-role access is
appropriate here. This is the same privileged pattern used by `/api/bootstrap` and `/api/registrations`.

Writes audit entry `diocese.aggregate.read` with `metadata: { parishCount: rows.length }`.

---

## 11. PR 4-8 — Exit gate tests

### `tests/rls/phase4-grant-tier3.test.ts`

Tag: `@phase:4 @rls`

Setup: seed diocese + 2 parishes (P1, P2) + 1 member each. Three DB sessions:
- `parishClaims` — regular Parish Admin (P1)
- `dioceseClaims` — Diocese Staff (no parish_id in claims)
- `dioceseClaims` is reused with/without an active grant by inserting/deleting from `DataSharingGrant` between assertions.

```ts
it('diocese with no grant sees zero Member rows for P1', async () => {
  const rows = await runAs(dioceseClaims, tx =>
    tx.$queryRaw`SELECT id FROM "Member" WHERE "parishId" = ${p1.id}::uuid`
  );
  expect(rows).toHaveLength(0);
});

it('diocese with active MEMBER_DIRECTORY grant sees P1 members', async () => {
  await grantCategory(p1.id, 'MEMBER_DIRECTORY');
  const rows = await runAs(dioceseClaims, tx =>
    tx.$queryRaw`SELECT id FROM "Member" WHERE "parishId" = ${p1.id}::uuid`
  );
  expect(rows.length).toBeGreaterThan(0);
});

it('MEMBER_DIRECTORY grant does not expose FAMILY_RECORDS', async () => {
  // grant is still active for MEMBER_DIRECTORY
  const rows = await runAs(dioceseClaims, tx =>
    tx.$queryRaw`SELECT id FROM "Family" WHERE "parishId" = ${p1.id}::uuid`
  );
  expect(rows).toHaveLength(0);
});

it('grant with expiresAt in the past returns zero rows', async () => {
  await expireGrant(grantId);
  const rows = await runAs(dioceseClaims, tx =>
    tx.$queryRaw`SELECT id FROM "Member" WHERE "parishId" = ${p1.id}::uuid`
  );
  expect(rows).toHaveLength(0);
});

it('revoked grant (isActive=false) returns zero rows immediately', async () => {
  await revokeGrant(grantId);
  const rows = await runAs(dioceseClaims, tx =>
    tx.$queryRaw`SELECT id FROM "Member" WHERE "parishId" = ${p1.id}::uuid`
  );
  expect(rows).toHaveLength(0);
});

it('diocese cannot see P2 rows even when a P1 grant is active', async () => {
  await grantCategory(p1.id, 'MEMBER_DIRECTORY');
  const rows = await runAs(dioceseClaims, tx =>
    tx.$queryRaw`SELECT id FROM "Member" WHERE "parishId" = ${p2.id}::uuid`
  );
  expect(rows).toHaveLength(0);
});
```

### `tests/rls/phase4-emergency-access.test.ts`

```ts
it('emergency access allows diocese to SELECT members (view-only)', async () => {
  await createEmergencyGrant(p1.id, { daysFromNow: 3 });
  const rows = await runAs(dioceseClaims, tx =>
    tx.$queryRaw`SELECT id FROM "Member" WHERE "parishId" = ${p1.id}::uuid`
  );
  expect(rows.length).toBeGreaterThan(0);
});

it('expired emergency grant returns zero rows', async () => {
  await expireEmergencyGrant(grantId);
  const rows = await runAs(dioceseClaims, tx =>
    tx.$queryRaw`SELECT id FROM "Member" WHERE "parishId" = ${p1.id}::uuid`
  );
  expect(rows).toHaveLength(0);
});
```

### `tests/unit/sharing.test.ts`

```ts
describe('token utilities', () => {
  it('generates 64-char hex raw token', () => {
    const { raw } = generateToken();
    expect(raw).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(raw)).toBe(true);
  });

  it('verifyToken is true for correct token', () => {
    const { raw, hash } = generateToken();
    expect(verifyToken(raw, hash)).toBe(true);
  });

  it('verifyToken is false for wrong token', () => {
    const { hash } = generateToken();
    expect(verifyToken('baadcafe'.repeat(8), hash)).toBe(false);
  });
});

describe('anonymizeMember', () => {
  const full = { id: 'u1', name: 'Alice', email: 'a@b.com', dateOfBirth: '1990-01-01',
                 privateNotes: 'clergy only', workNotes: 'volunteer', gender: 'FEMALE' };

  it('strips all PII fields', () => {
    const out = anonymizeMember(full);
    expect(out).not.toHaveProperty('name');
    expect(out).not.toHaveProperty('email');
    expect(out).not.toHaveProperty('dateOfBirth');
  });

  it('strips privateNotes and workNotes', () => {
    const out = anonymizeMember(full);
    expect(out).not.toHaveProperty('privateNotes');
    expect(out).not.toHaveProperty('workNotes');
  });

  it('preserves non-PII fields', () => {
    const out = anonymizeMember(full);
    expect(out).toHaveProperty('id', 'u1');
    expect(out).toHaveProperty('gender', 'FEMALE');
  });
});

describe('aggregate view schema (no PII columns)', () => {
  // Schema-level assertion: query information_schema.columns for the view
  // and assert none of the PII column names appear.
  it('diocese_parish_member_summary has no PII columns', async () => {
    const cols = await prisma.$queryRaw<{column_name: string}[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'diocese_parish_member_summary'
    `;
    const names = cols.map(c => c.column_name);
    const pii = ['name','email','phone','address','date_of_birth','member_number'];
    for (const f of pii) expect(names).not.toContain(f);
  });
});
```

### `tests/integration/api/phase4-sharing.test.ts`

Covers: full request→approve→grant→revoke flow with audit assertions; secure link expiry,
max-views exhaustion, and revocation each return 403; emergency access creation and
expiration; token not logged in any audit payload.

---

## 12. Audit events (cross-reference with access-control §7)

Every API handler must write these exact `action` strings to `AuditEntry`:

| Action | Written by |
| ------ | ---------- |
| `sharing.request.create` | `POST /api/sharing/requests` |
| `sharing.request.approve` | `PATCH /api/sharing/requests/[id]` (approve path) |
| `sharing.request.reject` | `PATCH /api/sharing/requests/[id]` (reject path) |
| `sharing.request.expire` | Cron job |
| `sharing.grant.create` | `POST /api/sharing/grants` and approve-path grant creation |
| `sharing.grant.revoke` | `DELETE /api/sharing/grants/[id]` |
| `sharing.emergency.create` | `POST /api/sharing/emergency` |
| `sharing.emergency.revoke` | `DELETE /api/sharing/emergency/[id]` |
| `sharing.emergency.expire` | Cron job |
| `sharing.share.create` | `POST /api/shares` |
| `sharing.share.view` | `GET /api/shares/[id]/view` and `GET /api/shares/link/[token]` |
| `sharing.share.denied` | Any share access denial |
| `sharing.share.revoke` | `DELETE /api/shares/[id]` |

All token values are excluded from metadata. Audit entries for `sharing.share.view` on a
secure link include `shareId` and `viewCount` but never the token hash or raw value.

---

## 13. Claims hook update

Add `DIOCESE_REPORT_VIEWER` and `PARISH_DATA_SHARING_MANAGER` to the allowed roles in the
Supabase access-token hook SQL
(`supabase/migrations/*_claims_hook.sql`). The hook already passes `roles` from
`app_metadata` — no structural change needed; just ensure the new role strings are not
filtered out.

The `has_active_grant` function checks `roles` in the JWT; test with both roles to confirm
they each see the appropriate grant-gated data.

---

## 14. `proxy.ts` changes

Add the secure-link endpoint to public paths (unauthenticated):

```ts
const PUBLIC_PATHS = [
  '/api/auth',
  '/api/registrations',
  '/api/jobs/process-communications',
  '/api/jobs/expire-sharing-requests',   // cron secret-guarded in handler
  '/api/jobs/expire-emergency-access',   // cron secret-guarded in handler
  '/api/shares/link',                    // secure-link token lookup (no session required)
];
```

---

## 15. AGENTS.md update (on phase completion)

When all exit gates pass, update the `## Phase status` block in `AGENTS.md`:

```
- **Phase 4 — complete.** Data-sharing governance & diocese aggregate: DataSharingRequest
  lifecycle, DataSharingGrant (scope/expiry/revoke), grant-aware Tier-3 RLS via
  `has_active_grant()` / `has_emergency_access()` SECURITY DEFINER helpers, Tier-2
  aggregate views (no PII columns), Emergency Access (≤7 days, view-only, audited),
  contextual sharing (user_share/role_share/secure_link, hashed tokens, expiry, max-views,
  anonymized projection), `DIOCESE_REPORT_VIEWER` + `PARISH_DATA_SHARING_MANAGER` roles.
  Migration `20260630000001_phase4_data_sharing` + RLS `20260630000002_phase4_data_sharing_rls.sql`.
  Exit gates: grant gates Tier-3 (RLS proven); aggregate views schema-asserted PII-free;
  full sharing lifecycle + secure-link deny cases have audit entries (integration proven).
  Plan: [docs/phase-4-plan.md](docs/phase-4-plan.md).
```

Also sync `.github/copilot-instructions.md`.
