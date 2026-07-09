# R4 Implementation Plan — Liturgical Calendar  *(Release R4 · Module M9)*

> **Release R4 — Sacramental Records & Liturgical Calendar · Module M9 (second).**
> Canonical map: [module-delivery-plan.md](../../module-delivery-plan.md) §5.
> **Depends on:** M6 events calendar surface (shipped in R2) and M3 diocese publish
> capability. **Product sequence:** implement after
> [1-sacramental-records.md](./1-sacramental-records.md) is exit-gated (or only
> parallelize after M8 schema is frozen).

**Phase goal:** diocese publishes feast days / holy days / seasons; parishes see them
overlaid on the parish events calendar and may add **local** observances without
mutating diocesan rows (DA-5, features §1.6).

**Requirements covered:** DA-5; features §1.6; PE-8 (cache hint for slowly changing
calendar — optional v1).

**Exit gate (draft):**

1. Parish cannot `UPDATE`/`DELETE` a diocese-owned observance.
2. Diocese publish is visible to all parishes in the diocese (read) without a sharing grant
   (Tier-1-style structural liturgical data — not personal data).
3. Parish-local observances are tenant-isolated (Parish A ≠ Parish B).
4. Events calendar UI can show diocese + parish layers; axe clean on calendar surfaces.

---

## 1. Current state

| Area | State | Evidence |
| ---- | ----- | -------- |
| Parish events calendar UI | ✅ | `/events`, event CRUD, RSVP |
| Diocese structural admin | ✅ | `/diocese/settings`, parishes |
| Liturgical schema | ❌ | greenfield |
| iCal / PDF export | ❌ | optional later slice |

---

## 2. Central decisions (draft — lock in R4-M9-1)

### 2.1 Models

- **`LiturgicalObservance`**
  - `id`, `dioceseId` (always set)
  - `parishId` nullable — `NULL` = diocese-wide published entry; non-null = parish-local
  - `title`, `observanceType` enum (`FEAST`, `HOLY_DAY`, `SEASON_START`, `SEASON_END`,
    `DIOCESAN_EVENT`, `OTHER`)
  - `occursOn` date (or `startsOn`/`endsOn` for multi-day seasons)
  - `recurrenceRule` text nullable (simple annual = month/day fields may be enough for v1)
  - `lectionaryRef` text nullable
  - `isPublished` boolean (diocese drafts vs published)
  - timestamps

**v1 recurrence:** store `month` + `day` for annual feasts; full RRULE deferred.

### 2.2 RLS sketch

- Diocese-wide rows (`parishId IS NULL`): SELECT for any authenticated user in that
  `dioceseId`; INSERT/UPDATE/DELETE for `diocese_admin` / `diocese_staff` only.
- Parish-local rows: same parish isolation as `Event`.
- No Tier-3 grant required (not personal data).

### 2.3 UI

| Surface | Role |
| ------- | ---- |
| `/diocese/liturgical` (or settings subsection) | Create/publish diocese observances |
| `/events` calendar overlay | Toggle “Liturgical” layer; color-code diocese vs parish |
| Parish “local observance” create | Optional small form on events or facilities-adjacent |

### 2.4 Export

- **v1 optional:** iCal feed for published diocese calendar.
- PDF export deferred unless trivial print CSS.

---

## 3. Work breakdown (after M8)

| PR | Scope |
| -- | ----- |
| **R4-M9-1** | Schema + RLS + seed |
| **R4-M9-2** | Diocese CRUD API + publish flag |
| **R4-M9-3** | Parish read API + events calendar overlay UI |
| **R4-M9-4** | Parish-local observances (optional if time) |
| **R4-M9-5** | Exit tests + axe + docs |

---

## 4. Test plan (draft)

| Layer | Assert |
| ----- | ------ |
| RLS | Parish cannot edit diocese row; cross-parish local zero |
| Integration | Publish → parish list includes feast; unpublish hides from parish default view |
| E2E | Diocese admin creates feast → parish admin sees on calendar overlay |
| a11y | axe on diocese liturgical page + events with overlay |

---

## 5. Non-goals (M9 v1)

- Full lectionary content management  
- Auto-sync from external church calendar providers  
- Multi-rite calendars  
- Hard dependency on M8 data (no FK to sacramental records)

---

## 6. Sequencing note

Do **not** start R4-M9-1 until M8 exit gates are green (or explicit dual-track with
frozen M8 schema). R5 Finance remains after R4 product sequence unless leadership
reprioritizes.
