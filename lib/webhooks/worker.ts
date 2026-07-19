import { WebhookDeliveryStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { signWebhookPayload } from './sign';

/**
 * Webhook delivery worker (IN-2) — modeled on the communications worker.
 *
 * Two phases, both idempotent:
 *  1. Fan-out: unprocessed WebhookEvent outbox rows → one WebhookDelivery per
 *     matching active subscription. `@@unique([subscriptionId, eventId])` plus
 *     skipDuplicates makes a re-run a no-op.
 *  2. Delivery: claim due deliveries with FOR UPDATE SKIP LOCKED, flip to
 *     PROCESSING and COMMIT before any network I/O, then POST. Concurrent cron
 *     invocations therefore take disjoint sets and never hold a lock across a
 *     request. Deliveries stuck in PROCESSING (worker crash) are reclaimed
 *     after 15 minutes.
 *
 * Runs as a trusted system job under the privileged client, like the comms
 * worker and audit writes — subscription secrets are never exposed to user
 * sessions.
 */

/** Backoff between attempts, in minutes. Index = attempts already made. */
export const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
export const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 10_000;

export interface WebhookProcessResult {
  fannedOut: number;
  claimed: number;
  delivered: number;
  failed: number;
  dead: number;
}

type ClaimedDelivery = {
  id: string;
  eventType: string;
  attemptCount: number;
  url: string;
  secret: string;
  payload: unknown;
  eventCreatedAt: Date;
};

export async function processWebhookQueue(opts?: {
  batchSize?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<WebhookProcessResult> {
  const batchSize = opts?.batchSize ?? 50;
  const doFetch = opts?.fetchImpl ?? fetch;
  const now = opts?.now ?? (() => new Date());
  const result: WebhookProcessResult = {
    fannedOut: 0,
    claimed: 0,
    delivered: 0,
    failed: 0,
    dead: 0,
  };

  // ── Phase 1: fan out the outbox ──────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    const events = await tx.$queryRaw<
      { id: string; dioceseId: string; parishId: string; type: string }[]
    >`
      SELECT id, "dioceseId", "parishId", type
      FROM "WebhookEvent"
      WHERE "processedAt" IS NULL
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `;
    if (events.length === 0) return;

    const subscriptions = await tx.webhookSubscription.findMany({
      where: {
        isActive: true,
        parishId: { in: [...new Set(events.map((e) => e.parishId))] },
      },
      select: { id: true, parishId: true, dioceseId: true, events: true },
    });

    const deliveries = events.flatMap((event) =>
      subscriptions
        .filter(
          (sub) =>
            sub.parishId === event.parishId && sub.events.includes(event.type),
        )
        .map((sub) => ({
          dioceseId: event.dioceseId,
          parishId: event.parishId,
          subscriptionId: sub.id,
          eventId: event.id,
          eventType: event.type,
        })),
    );

    if (deliveries.length > 0) {
      const created = await tx.webhookDelivery.createMany({
        data: deliveries,
        skipDuplicates: true,
      });
      result.fannedOut = created.count;

      // Re-stamp nextAttemptAt with the DATABASE clock. Prisma applies
      // `@default(now())` client-side, so a freshly fanned-out delivery would
      // otherwise carry the application's clock while the claim query below
      // compares against the database's now(). Even sub-second skew between
      // the two hosts leaves new deliveries permanently "not yet due".
      await tx.$executeRaw`
        UPDATE "WebhookDelivery"
        SET "nextAttemptAt" = now()
        WHERE "eventId" = ANY(${events.map((e) => e.id)}::uuid[])
          AND "attemptCount" = 0
          AND status = 'PENDING'
      `;
    }

    await tx.webhookEvent.updateMany({
      where: { id: { in: events.map((e) => e.id) } },
      data: { processedAt: now() },
    });
  });

  // ── Phase 2: claim due deliveries, then send after commit ────────────────
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "WebhookDelivery"
      WHERE (status IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= now())
         OR (status = 'PROCESSING' AND "updatedAt" < now() - interval '15 minutes')
      ORDER BY "nextAttemptAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `;
    if (rows.length === 0) return [];

    await tx.webhookDelivery.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: WebhookDeliveryStatus.PROCESSING },
    });

    const detailed = await tx.webhookDelivery.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        eventType: true,
        attemptCount: true,
        subscription: { select: { url: true, secret: true } },
        event: { select: { payload: true, createdAt: true } },
      },
    });

    return detailed.map(
      (row): ClaimedDelivery => ({
        id: row.id,
        eventType: row.eventType,
        attemptCount: row.attemptCount,
        url: row.subscription.url,
        secret: row.subscription.secret,
        payload: row.event.payload,
        eventCreatedAt: row.event.createdAt,
      }),
    );
  });

  result.claimed = claimed.length;

  for (const delivery of claimed) {
    const attempt = delivery.attemptCount + 1;
    const body = JSON.stringify({
      id: delivery.id,
      event: delivery.eventType,
      createdAt: delivery.eventCreatedAt.toISOString(),
      data: delivery.payload,
    });
    const timestamp = String(Math.floor(now().getTime() / 1000));

    let responseStatus: number | null = null;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await doFetch(delivery.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-webhook-id': delivery.id,
            'x-webhook-event': delivery.eventType,
            'x-webhook-timestamp': timestamp,
            'x-webhook-signature': signWebhookPayload(
              delivery.secret,
              timestamp,
              body,
            ),
          },
          body,
          signal: controller.signal,
        });
        responseStatus = response.status;
        if (!response.ok) error = `HTTP ${response.status}`;
      } finally {
        clearTimeout(timer);
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'request failed';
    }

    if (!error) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.DELIVERED,
          attemptCount: attempt,
          lastAttemptAt: now(),
          deliveredAt: now(),
          responseStatus,
          lastError: null,
        },
      });
      result.delivered += 1;
      continue;
    }

    const exhausted = attempt >= MAX_ATTEMPTS;
    const backoff = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)];
    // nextAttemptAt is computed from the database clock (now() + interval) for
    // the same reason fan-out leaves it to the column default.
    await prisma.$executeRaw`
      UPDATE "WebhookDelivery"
      SET status = ${exhausted ? 'DEAD' : 'FAILED'}::"WebhookDeliveryStatus",
          "attemptCount" = ${attempt},
          "lastAttemptAt" = now(),
          "nextAttemptAt" = now() + (${backoff} * interval '1 minute'),
          "responseStatus" = ${responseStatus},
          "lastError" = ${error.slice(0, 500)},
          "updatedAt" = now()
      WHERE id = ${delivery.id}::uuid
    `;
    if (exhausted) result.dead += 1;
    else result.failed += 1;
  }

  return result;
}
