# Phase 3 Implementation Plan — Parish Operations

> Companion to [delivery-plan.md](delivery-plan.md) Phase 3. This turns that phase's
> deliverables into an ordered, implementable work breakdown with the concrete
> architectural decisions, schema/migrations, RLS policies, DB constraints, and tests
> required to reach the **Phase 3 exit gate**. It builds on the secure multi-tenant spine
> (Phase 1) and intra-parish field/role access control (Phase 2): `withTenant`,
> deny-by-default + forced RLS, the claims pipeline with per-parish role derivation, the
> permission resolver, and append-only audit.

**Phase goal:** the day-to-day parish modules members and staff actually use — programs &
ministries, organizations (with the DB-enforced exclusive-membership rule), events &
facilities, communications, staff/volunteer management, and member self-registration.

**Requirements covered:** PA-3/4/5/6/8/14/15/16, MM-3/4/8; features §2.4–2.7, §2.10,
§2.2.4; role model from [user-roles.md](user-roles.md) §2.5–2.6 (Ministry Leader,
Organization Leader).

**Exit gate (must all be green in CI):**
1. The **exclusive-membership constraint (PA-16)** is proven by a *failing-insert* test at
   the **database layer** — adding a member to a second active exclusive org of the same
   type in the same parish is rejected by the DB, not just the UI. Open mode allows many.
2. **Ministry Leader / Organization Leader scoping** is proven by RLS tests: a leader sees
   and mutates only their own program/organization roster, and **zero** rows elsewhere.
3. A **queued communication is sent** against mocked providers, records per-recipient
   delivery status, and **respects opt-out**; a redelivered job sends each recipient once.

---

## 1. Current state (verified starting point)

| Area | State | Evidence |
| ---- | ----- | -------- |
| Tenant isolation + `withTenant` | ✅ forced RLS on all tenant tables; restricted role | `lib/db/withTenant.ts`, `supabase/migrations/20260629100001…` |
| Per-parish role derivation | ✅ claims carry `member_id`, `clergy_parish_ids`; in-policy subqueries | `supabase/migrations/20260629100003_claims_hook.sql` |
| Permission resolver + overrides | ✅ `can()` / `assertCanGrant()`; `ParishPermissionOverride` | `lib/permissions/`, `app/api/permissions/overrides` |
| Members / families / officers | ✅ CRUD, directory view, satellite sensitive tables | `app/api/members`, `app/api/parish-officers` |
| Roles enum | ✅ incl. `MINISTRY_LEADER`, `ORGANIZATION_LEADER` (no scoping yet) | `prisma/schema.prisma` |
| Programs / Organizations / Events / Facilities / Communications | ❌ none — no tables, no routes | — |
| Member status lifecycle | 🟡 `ACTIVE/INACTIVE/DECEASED/MOVED`; **no `PENDING`** for self-registration | `prisma/schema.prisma` |
| Async job infrastructure | ❌ none wired (Vercel Cron available per tech-stack) | `docs/tech-stack.md` §10 |

**The headline shift:** Phases 1–2 scoped access by **parish** (row) and **field** (column /
satellite). Phase 3 introduces **sub-parish** scoping — a Ministry/Organization Leader is
confined to *one program/organization within their parish*. That is the new access-control
frontier, and (with the PA-16 constraint and async comms) one of three load-bearing
decisions below.

---

## 2. Central decisions

### 2.1 Sub-parish (leader) scoping — extend the claims/subquery pattern

A leader's parish is in the JWT, but *which* program or organization they lead is not.
Reuse the Phase-2 clergy pattern exactly:

- **Authority (DB, authoritative):** leader-scoped RLS policies resolve scope with an
  **in-policy subquery** against the assignment tables — `ProgramEnrollment`
  (`role IN ('coordinator','facilitator')`) / `Program.coordinatorMemberId` for ministry
  leaders, and `OrganizationOfficer` / `OrganizationMembership.role` for organization
  leaders — keyed on `claims.member_id`. Always current; immune to stale tokens.
- **UX (claims, hint only):** extend the access-token hook to emit `program_leader_ids`
  and `org_leader_ids` arrays so the app can show/hide nav without a DB round-trip. The DB
  remains the source of truth.

Example — a ministry leader may read enrollments only for programs they coordinate:

```sql
CREATE POLICY program_enrollment_leader_rw ON "ProgramEnrollment"
  FOR ALL
  USING (
    "programId" IN (
      SELECT pe."programId" FROM "ProgramEnrollment" pe
      WHERE pe."memberId" = (auth.jwt()->'app_metadata'->>'member_id')::uuid
        AND pe.role IN ('COORDINATOR','FACILITATOR')
    )
    OR "programId" IN (
      SELECT p.id FROM "Program" p
      WHERE p."coordinatorMemberId" = (auth.jwt()->'app_metadata'->>'member_id')::uuid
    )
  )
  WITH CHECK ( /* same parish */ );
```

Parish Admin/Staff keep broad parish-scoped policies (FOR ALL within `parish_id`); leader
policies are *additive* read/write grants for their slice.

### 2.2 DB-enforced exclusive membership (PA-16) — denormalized partial unique index

This is exit-gate item 1 and the highest-correctness-risk piece. The rule: a member may
hold at most one **active** (`leftAt IS NULL`) membership across organizations sharing the
same `organizationType` in the same parish, **when** that type's mode is `exclusive`.

A partial unique index is the race-safe, declarative enforcement PA-16 names — but the
discriminating columns (`organizationType`, `membershipMode`, `parishId`) live on the
**parent** `Organization`, not on `OrganizationMembership`. **Decision: denormalize** those
three columns onto `OrganizationMembership` at insert time, then:

```sql
CREATE UNIQUE INDEX org_membership_exclusive_active
  ON "OrganizationMembership" ("parishId", "organizationType", "memberId")
  WHERE "leftAt" IS NULL AND "membershipMode" = 'EXCLUSIVE';
```

- Open-mode rows (`membershipMode = 'OPEN'`) are exempt — many allowed.
- Ending a membership (`leftAt = now()`) frees the slot; a resolve-conflict workflow surfaces
  the existing active membership and lets an admin end it first.
- **Sync risk:** if an org's `organizationType`/`membershipMode` is edited, the denormalized
  child columns must be updated in the same transaction (a trigger `AFTER UPDATE ON
  "Organization"` propagates the change, and re-checks for newly-created conflicts). Editing
  type/mode is rare; the trigger keeps the index honest.

> A trigger *alone* (re-querying on each insert) is racy under concurrency; the partial
> unique index is atomic. We keep the index as the enforcement and a trigger only for
> parent→child propagation.

### 2.3 Async communications (PA-8) — enqueue + worker + per-recipient status

Compose → resolve audience → **persist** a `Message` and one `MessageRecipient` row per
target (status `QUEUED`) → a worker drains the queue, calls Resend (email) / Twilio (SMS),
and flips each recipient to `SENT`/`FAILED`. Decisions:

- **Worker = Vercel Cron** hitting an internal `POST /api/jobs/process-communications`
  (tech-stack §10) that claims a batch `FOR UPDATE SKIP LOCKED`, sends, and records status +
  provider message id. Locally/CI the worker runs in-process and providers are **mocked**.
- **Opt-out is enforced at enqueue and at send** — `CommunicationPreference` (per member,
  per channel) filters recipients; a member who opts out is never written as a recipient
  (and double-checked at send for race safety).
- **Idempotency:** unique `(messageId, memberId, channel)` on `MessageRecipient`; the worker
  only transitions `QUEUED → SENT`, so a redelivered/retried job sends each recipient once
  (exit-gate item 3).

### 2.4 Facility booking conflicts (PA-5) — exclusion constraint

Double-booking is prevented at the DB layer with a Postgres **exclusion constraint** over a
time range (`btree_gist`):

```sql
ALTER TABLE "FacilityBooking" ADD CONSTRAINT no_facility_overlap
  EXCLUDE USING gist (
    "facilityId" WITH =,
    tstzrange("startAt","endAt") WITH &&
  ) WHERE ("status" = 'CONFIRMED');
```

App-level conflict detection (for friendly errors / calendar shading) sits on top, but the
constraint is the guarantee.

---

## 3. Schema & migrations (Prisma)

New models (parish-scoped, all carrying `dioceseId`+`parishId` for RLS, mirroring existing
tables). New enums in **UPPER_SNAKE** to match the codebase convention.

1. **`Program`** + **`ProgramEnrollment`** (PA-3, MM-3) — enums `ProgramType`,
   `EnrollmentRole` (`PARTICIPANT/FACILITATOR/COORDINATOR`), `EnrollmentStatus`. Add
   **`ProgramSession`** + **`ProgramSessionAttendance`** for session-level attendance
   (MM-4, features §2.6 "track session attendance").
2. **`Organization`** + **`OrganizationMembership`** + **`OrganizationOfficer`** (PA-14/15/16)
   — enums `OrganizationType`, `MembershipMode` (`OPEN/EXCLUSIVE`). `OrganizationMembership`
   carries the **denormalized** `parishId`, `organizationType`, `membershipMode`, `leftAt`
   plus the partial unique index (§2.2).
3. **`Event`** + **`EventAttendance`** (PA-4, MM-4) — enums `EventType`, `RsvpStatus`;
   `recurrenceRule` (iCal RRULE string), `maxCapacity`, `facilityId`.
4. **`Facility`** + **`FacilityBooking`** (PA-5) — booking exclusion constraint (§2.4);
   `bookingStatus` enum; maintenance/closure windows as bookings of type `CLOSURE`.
5. **`Message`** + **`MessageRecipient`** + **`MessageTemplate`** + **`CommunicationPreference`**
   (PA-8) — enums `MessageChannel` (`EMAIL/SMS`), `MessageStatus`, `RecipientStatus`,
   `AudienceType`. Idempotency unique on `MessageRecipient(messageId, memberId, channel)`.
6. **Staff/volunteer (PA-6)** — model as `AppUser` role assignment (existing) plus a
   lightweight `VolunteerAssignment` linking a `Member` to a program/organization/event with a
   role label; no new auth surface.
7. **Self-registration (MM-8)** — add `PENDING` to `MemberStatus` and a
   **`MemberRegistration`** intake row (public submission, `approvalStatus`). On approval the
   `Member` flips `PENDING → ACTIVE`. **Synergy:** the Phase-2 directory view already filters
   `status = 'ACTIVE'`, so pending members are auto-excluded from the directory with no new
   policy. Parish-level `autoApprove` setting on `Parish`.

> Prisma owns these tables/columns/enums/indexes; **RLS, the partial unique index, the
> booking exclusion constraint, and the propagation trigger live in Supabase SQL** — the
> Phase-1 split holds. The `btree_gist` extension is enabled in a Supabase migration.

---

## 4. RLS & DB constraints (Supabase)

For **every** new table: `ENABLE` + `FORCE ROW LEVEL SECURITY`, deny-by-default, and add to
the "RLS enabled+forced on all tenant tables" schema test so a future Prisma migration can't
silently reintroduce a table without its policy.

- **Parish-scoped baseline** — Parish Admin/Staff get `FOR ALL` within `parish_id` on
  programs, organizations, events, facilities, messages (mirrors `member_parish_write`).
- **Leader-scoped grants (gate item 2)** — `ProgramEnrollment`, `ProgramSessionAttendance`,
  `OrganizationMembership`, `OrganizationOfficer`, `EventAttendance` (for program/org events)
  get additive leader policies via the §2.1 subqueries. A leader sees **zero** rows outside
  their program/org.
- **Member-facing reads** — events (public calendar), program catalog, and own enrollments
  readable by the `member` role (parish-scoped); RSVP writes scoped to self
  (`memberId = claims.member_id`).
- **PA-16 partial unique index** (§2.2) + **booking exclusion constraint** (§2.4) + the
  **parent→child propagation trigger**.
- **Self-registration intake** — `MemberRegistration` INSERT allowed from the *public* path
  (the intake endpoint uses the privileged client, like `bootstrap`), SELECT/approve limited
  to Parish Admin/Staff.

---

## 5. Application work

- **Programs (PA-3, MM-3/4):** program CRUD; enrollment (admin + self-request → leader/admin
  approve); `ProgramSession` scheduling + attendance capture; completion + archive.
- **Organizations (PA-14/15/16):** CRUD with **required type** and **mode defaulting from
  type** (`prayer_group → exclusive`, else `open`, admin-overridable); roster management that
  **catches the exclusivity violation** (DB error → 409 with the conflicting active membership
  + a "end existing membership" resolve action); officers CRUD.
- **Events (PA-4, MM-4):** CRUD; `recurrenceRule` (RRULE) expansion in `lib/events/recurrence.ts`
  (pure, unit-tested); RSVP with capacity enforcement; post-event attendance; reminders via
  cron.
- **Facilities (PA-5):** facility CRUD; booking with conflict detection (DB exclusion
  constraint → friendly 409 + calendar shading); closure/maintenance windows.
- **Communications (PA-8):** compose; audience resolver (all / families / program enrollees /
  org members) → recipient expansion minus opt-outs; enqueue; worker send (mocked in tests);
  delivery-status view; per-channel opt-out management.
- **Staff/volunteer (PA-6):** assign `AppUser` roles (reuse Phase-1 provisioning + Phase-2
  permission overrides); `VolunteerAssignment` to programs/orgs/events.
- **Self-registration (MM-8):** public intake endpoint (unauthenticated, like `/api/bootstrap`,
  added to the proxy `isPublic` allowlist) → `MemberRegistration` + `PENDING` member; approval
  queue UI; `autoApprove` honored; every approval/rejection audited.
- **Audit everywhere** — enrollment/officer/booking/message-send/registration-approval all
  write entries (AU-1–11).

## 6. Async jobs (Vercel Cron)

- `POST /api/jobs/process-communications` — drains `MessageRecipient(QUEUED)` with
  `FOR UPDATE SKIP LOCKED`, sends via mocked-in-test providers, records status; idempotent.
- `POST /api/jobs/event-reminders` — sends reminders for events in the next window (enqueues
  into the same communications pipeline).
- Both registered in `vercel.json` cron; both callable in-process from tests. Endpoints guard
  on a shared secret (cron header), not user auth.

---

## 7. Test plan → exit-gate mapping

RLS/constraint tests run as a real `app_authenticated` session with claims set (the
`withTenantSession` helper), never the privileged seam.

| Layer | Tests | Gate item |
| ----- | ----- | --------- |
| **DB constraint (centerpiece)** | inserting a member into a 2nd active **exclusive** org of the same type/parish **raises** (unique violation); open mode allows multiple; ending the first membership frees the slot | **gate 1** |
| **RLS (centerpiece)** | ministry leader reads/writes only their program's `ProgramEnrollment`/attendance, 0 rows elsewhere; org leader only their `OrganizationMembership`/officers; cross-parish still 0 | **gate 2** |
| Integration (worker) | enqueue → process job → recipients `SENT` (providers mocked); opted-out member never receives; **re-running the job sends each recipient once** | **gate 3** |
| Unit (Vitest) | RRULE recurrence expansion; booking-overlap detector; audience→recipient resolver minus opt-outs; membership-mode default-from-type | — |
| Integration (API) | RSVP capacity limit; self-registration creates a `PENDING` member **invisible in the directory** until approved; exclusivity 409 surfaces the resolve workflow; facility double-book → 409 | gates 1 & 3 |
| Policy/schema | RLS enabled+forced on all new tables; PA-16 index + booking exclusion constraint present | gate 1 |
| E2E (Playwright) | create event → RSVP → record attendance; create exclusive org → blocked duplicate add shows resolve dialog | gates 1–3 |

New fixtures: a ministry-leader and an organization-leader user (assignment rows), two orgs
of the same exclusive type, a facility with an existing booking, and an opted-out member.

---

## 8. Work breakdown (ordered PRs)

Each PR ships code **and** its tests; DoD per delivery-plan §"Definition of Done".

1. **Schema foundation** — Program/Organization/Event/Facility/Message families + enums +
   `MemberStatus.PENDING` (Prisma migration); `btree_gist` extension.
2. **Leader-scope claims** — extend the access-token hook with `program_leader_ids` /
   `org_leader_ids`; resolver/test-seam coverage. *(No behavior change; contract tests.)*
3. **Programs + leader RLS** — program/enrollment/session/attendance CRUD; ministry-leader
   policies; the leader-scoping RLS suite (gate 2, part 1).
4. **Organizations + PA-16** — org/membership/officer CRUD; denormalized columns + partial
   unique index + propagation trigger; the failing-insert constraint suite (**gate 1**);
   org-leader RLS (gate 2, part 2); resolve-conflict workflow.
5. **Events + Facilities** — event CRUD + RRULE + RSVP/capacity/attendance; facility CRUD +
   booking exclusion constraint; recurrence/overlap unit tests.
6. **Communications + worker** — message/recipient/template/preference; audience resolver;
   enqueue + cron worker with mocked providers; opt-out + idempotency suite (**gate 3**).
7. **Self-registration + staff/volunteer** — public intake → `PENDING` → approval queue;
   directory-invisibility test; `VolunteerAssignment`; `autoApprove`.
8. **E2E + CI** — the gate journeys under `@phase:3`; `vercel.json` cron wiring; coverage holds.

Strictly sequential: 1 → 2 → 3 → 4. PRs 5, 6, 7 can parallelize after 4; 8 lands last.

---

## 9. Risks & open decisions

- **Denormalization drift (PA-16).** The exclusivity index depends on `organizationType` /
  `membershipMode` copied onto memberships. The parent→child propagation trigger is
  load-bearing — test that editing an org's type/mode re-checks and updates active
  memberships (and rejects an edit that would create a conflict).
- **Leader scoping surface area.** Additive leader RLS widens write access beyond Parish
  Admin/Staff. Pin `WITH CHECK` to the leader's parish *and* their program/org; add an
  explicit "leader cannot touch a sibling program/org" RLS test.
- **Async worker semantics.** Without a real queue, the cron+`SKIP LOCKED` pattern must be
  idempotent and re-entrant. The `QUEUED → SENT` one-way transition + unique recipient key is
  the guarantee; assert double-invocation sends once.
- **Unauthenticated self-registration.** The public intake endpoint bypasses the auth gate
  (proxy allowlist) — needs rate-limiting / captcha and strict input validation to avoid spam
  and injection; pending members must be invisible everywhere until approved (lean on
  `status='ACTIVE'` filters already in place).
- **Recurrence scope.** Decide whether RSVP/attendance attach to the series or to expanded
  instances. Recommend storing the series + an `EventOccurrence` only when an instance is
  modified/cancelled (lazy expansion), to avoid materializing infinite series.
- **Org ledger boundary.** `Organization.has_own_ledger` is defined here but the ledger itself
  is **Phase 5** — Phase 3 stores the flag and officer roles only; no accounting.
- **Diocesan programs/orgs (`parish_id = null`).** Phase 3 targets parish scope; diocesan-level
  programs/organizations (visibility, nomination, approval) are acknowledged in the schema but
  their cross-tenant visibility rides on the Phase-4 sharing model — keep them parish-scoped
  for now.

---

## 10. Definition of "Phase 3 done"

CI runs `static → unit → integration → rls → e2e-smoke`; the `@phase:3` suite is green; the
PA-16 exclusive-membership constraint is proven by a **failing DB insert** (open mode
unaffected); Ministry/Organization Leader scoping is **RLS-proven** (zero rows outside their
slice); a queued communication **sends once per recipient against mocked providers with
opt-out respected**; self-registered members are `PENDING` and invisible until approved;
coverage holds. At that point parishes can run their daily operations on the secure platform,
and Phase 4 (data-sharing governance & diocese aggregate) can build the diocese-facing model
on top — including visibility for the diocesan programs/organizations staged here.
