# Integrations — Webhooks & CSV Import  *(Release R6 · Module M12)*

> **Release R6 — Reporting & Integrations · Module M12.** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Companion to
> [1-reporting-analytics.md](./1-reporting-analytics.md).

Covers **IN-2** (outbound webhooks) and **IN-3** (CSV import). **IN-1** (public REST API with
scoped API keys) is deliberately **deferred** — no external consumer exists yet, and shipping a
public surface before one does means guessing at its shape. **RP-3** (ad-hoc query builder) is
deferred to R7.

---

## 1. Outbound webhooks (IN-2)

### Architecture — transactional outbox

Domain routes never talk to subscriptions. They append a thin `WebhookEvent` row **inside the same
`withTenant` transaction as the domain write**, so an event and its cause commit together: no lost
events if the process dies, no phantom events if the write rolls back. A privileged cron worker
(`lib/webhooks/worker.ts`) then fans events out to `WebhookDelivery` rows and delivers them.

This matters for RLS. Signing secrets live on `WebhookSubscription`, which only parish admins may
read. If routes fanned out inline, every actor who can create a member would need read access to
those secrets. With the outbox, emitters need only INSERT on `WebhookEvent`.

> **Implementation note.** `emitWebhookEvent` uses `createMany`, not `create`. Prisma's `create`
> emits a `RETURNING` clause, which Postgres evaluates against the **SELECT** policy — and parish
> staff have no SELECT on the outbox. `createMany` issues a plain INSERT, so emission works for
> every role that can perform the underlying domain write. This is covered by a test in
> `tests/rls/r6-webhooks.test.ts`.

### Event catalog

Defined in `lib/webhooks/events.ts`; the API rejects any event name not on this list.

| Event | Emitted from | Payload |
| ----- | ------------ | ------- |
| `member.created` | `POST /api/members` | `memberId`, `parishId`, `memberIdentifier`, `status` |
| `member.updated` | `PATCH /api/members/[id]` | `memberId`, `parishId`, `memberIdentifier`, `status` |
| `donation.posted` | `POST /api/finance/donations` | `donationId`, `parishId`, `amountCents`, `method`, `categoryId`, `receivedAt` |
| `donation_batch.posted` | `POST /api/finance/donation-batches/[id]/post` | `batchId`, `parishId`, `totalCents`, `donationCount`, `batchDate` |
| `registration.approved` | `POST /api/registrations/[id]/approve` | `registrationId`, `memberId`, `parishId` |
| `event.created` | `POST /api/events` | `eventId`, `parishId`, `name`, `eventType`, `startAt` |

**Payloads are deliberately thin: ids and non-sensitive scalars only.** No names, emails, notes,
pastoral dates, or donor attribution ever crosses this boundary, so a webhook body can never become
a PII side channel. Receivers that need detail fetch it through an authenticated path. The R6
sensitive-field leak gate scans every stored payload.

Two events are **not** emitted by design:
- **Bulk member import** — a 500-row load would flood subscribers with events carrying no signal
  the operator does not already have.
- **Diocese-level donations** (`parishId` null) — subscriptions are parish-scoped, so there is no
  subscriber to notify.

### Delivery envelope and signature

```
POST <subscription.url>
Content-Type: application/json
X-Webhook-Id: <delivery uuid>
X-Webhook-Event: member.created
X-Webhook-Timestamp: <unix seconds>
X-Webhook-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${body}`)>

{ "id": "<delivery uuid>", "event": "member.created",
  "createdAt": "<event ISO timestamp>", "data": { … } }
```

Verify with `verifyWebhookSignature(secret, timestamp, rawBody, signature)`
(`lib/webhooks/sign.ts`) — constant-time compare. **The timestamp is part of the signed material**,
so a captured body cannot be replayed under a different timestamp header.

The signing secret is returned **exactly once**, at create or rotate. Listings show only the last
four characters. Unlike sharing tokens (which are verify-only and therefore hashed), the worker must
*produce* signatures, so the secret is stored raw and protected by RLS.

### Retry ladder

| Attempt | Delay before next |
| ------: | ----------------- |
| 1 | 1 min |
| 2 | 5 min |
| 3 | 30 min |
| 4 | 2 h |
| 5 | 6 h |
| 6 | — → `DEAD` |

Non-2xx responses and network errors both count. Status flow:
`PENDING → PROCESSING → DELIVERED | FAILED(retry) | DEAD`. The claim uses
`FOR UPDATE SKIP LOCKED` and **commits the claim before any network I/O**, so concurrent cron
invocations take disjoint sets and no lock is held across a request. Deliveries stuck in
`PROCESSING` (worker crash) are reclaimed after 15 minutes. Parish admins can re-queue a `FAILED`
or `DEAD` delivery from the UI.

Cron: `/api/jobs/deliver-webhooks` every 5 minutes (`vercel.json`), guarded by `CRON_SECRET` and
allowlisted in `proxy.ts` exactly like the communications worker.

### API and UI

| Endpoint | Purpose |
| -------- | ------- |
| `GET/POST /api/integrations/webhooks` | list (masked) / create (returns secret once) |
| `PATCH/DELETE /api/integrations/webhooks/[id]` | update name/url/events/isActive; delete |
| `POST /api/integrations/webhooks/[id]/rotate-secret` | new secret, returned once |
| `GET /api/integrations/webhooks/[id]/deliveries` | most recent 50 deliveries |
| `POST /api/integrations/webhooks/[id]/test` | queue a synthetic `webhook.test` delivery |
| `POST /api/integrations/webhooks/[id]/deliveries/[deliveryId]/retry` | re-queue now |

All role-gated to `PARISH_ADMIN` / `GLOBAL_ADMIN` and audited under `integration.webhook.*`.
Webhook configuration is infrastructure administration (like Parish Users), so it carries **no**
permission resource of its own. UI: `/settings/integrations`.

URLs must be `https`, except `http://localhost` / `127.0.0.1` so local development can receive
deliveries.

---

## 2. Member CSV import (IN-3)

Stateless by design — no import-run tables. The client holds the file and calls
`POST /api/members/import` with `{ content, mode: 'dry-run' | 'commit' }`.

- **Columns.** Required: first name, last name. Optional: email, phone, gender, status, member id,
  family name. Header matching is alias-driven and case/underscore/space insensitive
  (`first_name`, `First Name`, `firstname`, `given_name` all resolve). Unknown columns are ignored
  rather than failing the file.
- **Validation.** Email shape, gender/status enum membership, member-id collisions against both the
  file and the parish. Every problem is reported as `{ line, field, reason }` against the **original
  file line number**, and the UI offers the error list as a CSV download.
- **Commit.** Rows are created independently, so one bad row is reported rather than rolling back
  the whole import; the response is a partial-success report (`created` / `failed` / `errors`).
  Families are found-or-created by name; member identifiers are derived when absent.
- **Guards.** Parish comes from claims — a `parishId` in the body cannot retarget another parish.
  Row cap 2000. Role-gated to `PARISH_ADMIN` / `GLOBAL_ADMIN` plus the `member_import` permission
  resource, so a parish can revoke bulk import without revoking member editing. Audited under
  `member.import.dry_run` / `member.import.commit` with row counts.

UI: `/members/import`, reachable from the "Import CSV" button in the `/members` header.

---

## 3. Provider wiring status (IN-4/5/6)

- **Stripe (IN-6) — live.** `app/api/webhooks/stripe/route.ts` verifies signatures with
  `STRIPE_WEBHOOK_SECRET` and ingests idempotently via the `StripeEvent` unique-id row
  (`lib/finance/stripe.ts`).
- **Resend (IN-4) / Twilio (IN-5) — seam present, adapters pending.**
  `lib/communications/providers.ts` is the provider seam and defaults to a no-network stub. The
  queue, opt-out handling, delivery-status tracking, and idempotency keys are all real and tested;
  what remains is wiring the production adapters and setting `RESEND_API_KEY` / `TWILIO_*` in the
  deployment environment. **Tracked as a follow-up, not delivered in R6.**

---

## 4. Tests

| Layer | File | Covers |
| ----- | ---- | ------ |
| Unit | `tests/unit/lib/webhook-sign.test.ts` | HMAC round-trip, tamper, replay, wrong secret, malformed signature, event catalog, secret masking |
| Unit | `tests/unit/members/import-parse.test.ts` | header aliases, missing columns, line numbering, column-count mismatch, unknown columns |
| RLS | `tests/rls/r6-webhooks.test.ts` | secrets admin-only, staff INSERT-but-not-SELECT on the outbox, cross-parish isolation, no user INSERT on deliveries, admin retry |
| Integration | `tests/integration/api/r6-webhooks.test.ts` | secret-once, validation, staff denial, thin payloads, fan-out targeting, idempotent re-run, signature verification, backoff, dead-letter, stale reclaim, inactive skip |
| Integration | `tests/integration/api/r6-member-import.test.ts` | dry-run writes nothing, partial success, duplicate ids, parish from claims, row cap, staff denial, audit counts, no webhook emission |
| E2E | `tests/e2e/r6-reporting.test.ts` | auth gates, integrations page renders, member 403, axe |
