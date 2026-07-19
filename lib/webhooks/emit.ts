import type { Prisma } from '@prisma/client';
import type { WebhookEventType } from './events';

export type WebhookPayload = Record<string, string | number | boolean | null>;

/**
 * Append an event to the transactional outbox (D1).
 *
 * Call this INSIDE the same withTenant transaction as the domain write so the
 * event and its cause commit together — no lost events, no phantom events.
 * Fan-out to subscriptions and delivery happen later in the privileged worker,
 * which is why the emitting actor never needs to read subscription secrets.
 *
 * Uses createMany deliberately: outbox rows are INSERT-only for tenant actors
 * (reads are parish-admin-only), and `create` would emit a RETURNING clause
 * that Postgres evaluates against the SELECT policy — which parish staff do not
 * have. createMany issues a plain INSERT, so emission works for every role that
 * can perform the underlying domain write.
 */
export async function emitWebhookEvent(
  tx: Prisma.TransactionClient,
  event: {
    dioceseId: string;
    parishId: string;
    type: WebhookEventType;
    entityId?: string | null;
    payload: WebhookPayload;
  },
): Promise<void> {
  await tx.webhookEvent.createMany({
    data: [
      {
        dioceseId: event.dioceseId,
        parishId: event.parishId,
        type: event.type,
        entityId: event.entityId ?? null,
        payload: event.payload,
      },
    ],
  });
}
