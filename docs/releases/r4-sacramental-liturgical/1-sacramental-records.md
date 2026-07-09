# R4 Implementation Plan — Sacramental Records  *(Release R4 · Module M8)*

> **Release R4 — Sacramental Records & Liturgical Calendar · Module M8 (first).**
> Canonical map: [module-delivery-plan.md](../../module-delivery-plan.md) §5.
> Builds full sacramental register management on top of the Phase 1–2 people spine
> and Phase 4 grant-aware RLS. **M9 (liturgical calendar) is a separate plan** —
> [2-liturgical-calendar.md](./2-liturgical-calendar.md) — and ships after M8 is
> exit-gated.

**Phase goal:** clergy and parish admins can record, search, and print the **seven
sacramental records** of the Mar Thoma Church per member (PA-7), with the same
parish-sovereignty and role-projection guarantees as pastoral-sensitive data.
Diocese users see raw sacramental rows **only** with an active
`SACRAMENTAL_RECORDS` grant.

**Requirements covered:** PA-7, PA-12 (staff override path), MM-2, MM-15 (relationship
to pastoral dates), SE-3, SE-4, SE-9; features §2.3; access-control
`sacramental_records` + `parish_pastoral_sensitive`.

**Exit gate (must all be green in CI):**

1. **RLS isolation:** Parish A cannot read Parish B sacramental rows; a plain member
   cannot read another member’s sacramental history; diocese roles see **zero** raw
   rows without `has_active_grant(parishId, 'SACRAMENTAL_RECORDS')`.
2. **Write matrix:** Clergy + Parish Admin can create/update; Parish Staff cannot write
   unless a `ParishPermissionOverride` allows `member_sacramental_record` write;
   denied writes audit `DENIED`.
3. **Audit:** every create/update/deactivate (and privileged read/export of a record)
   writes an append-only audit entry (SE-4).
4. **No Phase 2 regressions:** private notes, pastoral dates, and directory (no DOB)
   behavior unchanged.
5. **UI:** member profile sacramental surface is axe-clean; unauthorized roles never
   see register fields in the DOM for another member.

---

## 1. Current state

| Area | State | Evidence |
| ---- | ----- | -------- |
| Tenant isolation + `withTenant` | ✅ | `lib/db/withTenant.ts` |
| Pastoral **dates only** | ✅ baptism / chrismation / DOB on `MemberPastoralData` | `prisma/schema.prisma`, `/api/members/[id]/pastoral-data` |
| Member profile Pastoral tab | ✅ | `app/(app)/members/[id]/member-pastoral-form.tsx` |
| Role projection (pastoral) | ✅ clergy, parish_admin, pastoral_data_accessor | `lib/projection.ts`, `lib/permissions/*` |
| Sharing category enum | ✅ `DataCategory.SACRAMENTAL_RECORDS` | `prisma/schema.prisma` |
| Grant-aware Tier-3 helper | ✅ `has_active_grant(parish_id, category)` | `supabase/migrations/20260630000002_phase4_data_sharing_rls.sql` (wired for Member/Family; **not yet** sacramental tables) |
| Full sacramental register | ❌ no rows for godparents, register book/page, marriage spouse, etc. | greenfield |
| Certificates / parish register search | ❌ | greenfield |
| Permission resource for sacramental | ❌ only `member_pastoral_data` today | `lib/permissions/types.ts` |

**Headline shift:** Phase 2 stored a few **dates** as pastoral-sensitive fields. M8
introduces **first-class register records** (one row per sacrament instance) so
parishes can maintain official book references, sponsors, and certificates without
overloading `MemberPastoralData`.

---

## 2. Central decisions

### 2.1 Separate `SacramentalRecord` table (satellite pattern)

**Chosen:** new `SacramentalRecord` table keyed by `memberId` + `parishId`, **not**
new columns on `Member` or stuffing JSON into `MemberPastoralData`.

Rationale (same as Phase 2 private notes / pastoral data): field-level sensitivity
becomes **row-level RLS** the DB can enforce. One member may have many baptisms? No —
typically one baptism, but multiple anointings / communion records over time are
plausible; a row-per-event model fits certificates and register books.

### 2.2 Sacrament types (PA-7)

Enum `SacramentType` (Prisma + Postgres):

| Value | Label (UI) |
| ----- | ---------- |
| `BAPTISM` | Holy Baptism |
| `HOLY_COMMUNION` | Holy Communion (Holy Qurbana) |
| `CONFIRMATION` | Confirmation (Miron Anointing) |
| `CONFESSION` | Confession (Reconciliation) |
| `MARRIAGE` | Marriage (Matrimony) |
| `ORDINATION` | Ordination (Holy Orders) |
| `ANOINTING_OF_THE_SICK` | Anointing of the Sick |

**Out of v1 scope:** funeral / burial register (mentioned loosely in older R4 blurbs)
— not one of PA-7’s seven. Defer to a later pastoral-register slice if product needs it.

### 2.3 Core columns vs type-specific details

**Common columns (all types):**

- `id` uuid PK  
- `parishId`, `memberId` (FKs, indexed)  
- `sacramentType` enum  
- `occurredOn` date (required)  
- `officiantName` text (nullable; free text v1 — not required to be an `AppUser`)  
- `locationText` text (nullable; parish name / place of celebration)  
- `registerBook`, `registerPage`, `registerEntry` text (nullable official refs)  
- `notes` text (nullable; **not** clergy private notes — general register note)  
- `isActive` boolean default true (soft-deactivate; no hard delete in v1)  
- `createdAt`, `updatedAt`, `createdByUserId` (nullable uuid)

**Type-specific columns (nullable; validated in app by type):**

| Column | Used by |
| ------ | ------- |
| `sponsorNames` text | Baptism, Confirmation (godparents/sponsors) |
| `spouseMemberId` uuid nullable FK Member | Marriage (in-parish spouse when known) |
| `spouseName` text | Marriage (external or free-text spouse) |
| `witnessNames` text | Marriage |
| `ordainedOffice` text | Ordination |
| `pastoralNoteRef` text | Confession — **reference only**, never confession content |

No free-text “confession content” field — SE-4 / pastoral sensitivity. Confession rows
are metadata + optional pointer to private-note workflow.

### 2.4 Relationship to `MemberPastoralData` dates

**Chosen: dual-write convenience, records are source of truth for register UI.**

- Creating/updating a `BAPTISM` record with `isActive` **updates**
  `MemberPastoralData.baptismDate` to that record’s `occurredOn` (latest active baptism).
- Same for `CONFIRMATION` → `chrismationDate`.
- Pastoral form remains for DOB and for quick date entry; if a user sets baptism date
  only on pastoral form **without** a register row, that is allowed (legacy / partial
  data) — register list simply has no baptism row until created.
- Directory / projection continue to use pastoral satellite for “has baptism date”
  visibility rules; full register rows use sacramental RLS.

Document this in API handlers so we do not drift.

### 2.5 Who can read / write

Align with pastoral-sensitive + features §2.3 (features text under-specifies clergy;
module catalog says clergy + parish admin):

| Role | Read | Write |
| ---- | ---- | ----- |
| Clergy (officer-derived) | ✅ same parish | ✅ |
| Parish Admin | ✅ | ✅ |
| Pastoral Data Accessor | ✅ | ✅ (same as pastoral dates) |
| Parish Staff | ❌ default | ❌ default; override via PA-12 |
| Member | **own** active records only (read) | ❌ |
| Diocese * | ❌ unless grant | ❌ |

\* With active `SACRAMENTAL_RECORDS` grant: **read-only** (grant model is Tier-3 read).

Permission resource (new): `member_sacramental_record` with actions `read` | `write` |
`export`. Defaults mirror `member_pastoral_data` for clergy/admin/accessor; staff empty
until override.

### 2.6 Grant-aware RLS

Extend Phase 4 pattern:

```sql
-- SELECT: parish peer with privilege OR grant OR (member own row)
USING (
  "parishId" = current_parish_id() AND <privileged or own member>
  OR public.has_active_grant("parishId", 'SACRAMENTAL_RECORDS')
);
```

`INSERT`/`UPDATE` only for privileged parish writers (no diocese write via grant).
Emergency access: if product treats sacramental as emergency-visible, reuse
`has_emergency_access()` on SELECT only — **document decision in PR R4-M8-1**;
default recommend **include** emergency read for consistency with Tier-3 member data,
view-only.

### 2.7 Certificates (MVP-lite)

v1: **print stylesheet** on a member sacramental history / single-record view
(`window.print` + `@media print` CSS). PDF library deferred. Certificate content:
member name, sacrament type, date, officiant, parish, register refs — no private notes.

### 2.8 Soft-deactivate only

No hard DELETE for users. `isActive = false` + audit. Unique constraints (if any)
should consider only active rows where needed (e.g. optional partial unique on
`(memberId, sacramentType)` for types that are once-in-a-lifetime — **do not enforce
in v1** so historical re-records can exist; UI can warn on second baptism).

---

## 3. APIs

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/api/members/[id]/sacramental-records` | List active (+ optional `?includeInactive=1` for admin) |
| `POST` | `/api/members/[id]/sacramental-records` | Create |
| `GET` | `/api/members/[id]/sacramental-records/[recordId]` | Detail |
| `PATCH` | `/api/members/[id]/sacramental-records/[recordId]` | Update |
| `DELETE` | `/api/members/[id]/sacramental-records/[recordId]` | Soft-deactivate |
| `GET` | `/api/sacramental-records` | Parish register search (`q`, `type`, `from`, `to`) — privileged only |

All routes: `withTenant`, permission check, audit on mutating + export-like reads.
Projection: never return rows the role cannot see (empty list, not 403, for member
viewing another profile — match existing member profile patterns).

---

## 4. UI

| Surface | Notes |
| ------- | ----- |
| Member profile **Sacramental** tab | List + add dialog; type-specific fields; soft-deactivate |
| Keep **Pastoral** tab | DOB + summary dates; link “open register” when baptism date exists without record |
| Parish register `/sacramental-records` (or under Members) | Search table; open member |
| Certificate print view | Route or dialog with print CSS |
| Nav | Parish Admin / Clergy / Pastoral accessor / Staff-with-override |

UI conventions: [r1 design-system-shell](../r1-people-core/1-design-system-shell.md).
**UI is not the security boundary** — RLS + API projection are.

---

## 5. Work breakdown (PR train)

| PR | Scope | Tests first |
| -- | ----- | ----------- |
| **R4-M8-1** | Prisma model + migration; Supabase RLS/grants; seed/truncate helpers; permission resource defaults | RLS suite: cross-parish, role matrix, grant path |
| **R4-M8-2** | Member-scoped CRUD API + dual-write baptism/chrismation dates + audit | Integration CRUD + DENIED + audit |
| **R4-M8-3** | Member profile Sacramental tab + forms | Component unit if pure; E2E clergy add baptism |
| **R4-M8-4** | Parish register search page + nav | Integration search filters; E2E open register |
| **R4-M8-5** | Print certificate MVP; optional CSV export columns role-safe | Unit: no PII leak in print model; export projection |
| **R4-M8-6** | Exit-gate polish: axe, grant-read smoke (integration), docs/AGENTS status | Full pyramid green |

Prefer stacking PRs; each merges only when its tests pass.

---

## 6. Test plan → exit-gate mapping

| Layer | What | Gate |
| ----- | ---- | ---- |
| RLS | Parish B zero rows; member cannot read peer sacramental; diocese zero without grant; grant allows SELECT only | 1, 2 |
| Integration | Create baptism → pastoral `baptismDate` updated; staff 403 without override; audit rows; soft-deactivate hides from default list | 2, 3, 4 |
| Unit | Type-field validation; permission defaults; projection helper | 2 |
| E2E | Clergy opens member → adds baptism → sees row; plain member on peer profile has no sacramental leak; axe on tab | 5 |
| Regression | Existing `r1-profile-visibility` + pastoral/private note tests still green | 4 |

---

## 7. Files to touch (expected)

| Area | Paths |
| ---- | ----- |
| Schema | `prisma/schema.prisma`, `prisma/migrations/*_r4_sacramental_records` |
| RLS | `supabase/migrations/*_r4_sacramental_records_rls.sql` |
| API | `app/api/members/[id]/sacramental-records/**`, `app/api/sacramental-records/route.ts` |
| Lib | `lib/projection.ts`, `lib/permissions/*`, optional `lib/sacramental/*` |
| UI | `app/(app)/members/[id]/*`, new register page under `app/(app)/` |
| Nav | `lib/nav/menu.ts` |
| Tests | `tests/rls/r4-sacramental*.test.ts`, `tests/integration/api/r4-sacramental*.test.ts`, `tests/e2e/r4-sacramental*.test.ts` |
| Seed | `tests/helpers/db.ts` truncate list |

---

## 8. Explicit non-goals (M8 v1)

- Funeral / burial register  
- Bulk historical import  
- Full PDF certificate designer / multi-language certificates  
- Sacramental statistics reports (R6 / M11)  
- Cross-parish automatic transfer of sacramental history (transfer workflow later)  
- Global shell “Share” for sacramental rows (use existing grant category when diocese needs data)

---

## 9. Definition of Done

Code + tests merged; all five exit gates green in CI; AGENTS / copilot status notes M8
(or full R4 when M9 also lands); this plan’s decisions unchanged or amended with a short
changelog at the bottom of this file.
