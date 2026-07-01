# Phase 11 Implementation Plan — Events, Facilities & Communications UI (MVP2)  *(Release R2 · Modules M6, M7)*

> **Release R2 — Parish Operations · Modules M6, M7 (UI).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 11. The operational
> calendar, facility booking (with DB-enforced conflict detection), and outbound communications.
> Depends on Phase 8 (audience = members) and Phase 9 (opt-out state).

**Phase goal:** events (recurrence/RSVP/attendance), facilities (booking + conflict UI), and a
communications composer with delivery status driven by the Phase 3 worker.

---

## 1. APIs consumed

`/api/events` · `/api/events/[id]/rsvp` · `/api/facilities` · `/api/facilities/bookings` ·
`/api/messages`.

## 2. Work breakdown (PRs)

- **PR 11-1 — Events.** Create/edit, recurrence, RSVP with capacity, attendance recording,
  reminders (`/api/events`, `/[id]/rsvp`); public/parish/leader visibility per role.
- **PR 11-2 — Facilities & booking.** Facility list + booking calendar; double-booking returns
  the DB `EXCLUDE`-constraint `409` (PA-5) surfaced as a conflict prompt.
- **PR 11-3 — Communications composer.** Audience selection, template picker, opt-out respected,
  async send with delivery-status view (`/api/messages`; worker drives status).
- **PR 11-4 — Exit-gate tests** (`@mvp2 @phase:11`).

## 3. Tests

- **Integration:** RSVP capacity enforced; booking conflict surfaces `409`; comms enqueue records
  a job + delivery status (providers mocked); opt-out audience excluded.
- **E2E:** create event → RSVP → record attendance; book facility → blocked double-book prompt;
  compose message → see queued/sent status transitions.
- **a11y:** axe on calendar + composer.

## 4. Exit gate

1. Capacity, booking-conflict, and opt-out are enforced server-side and surfaced clearly in the UI.
2. A queued communication shows delivery-status transitions (mocked providers).
