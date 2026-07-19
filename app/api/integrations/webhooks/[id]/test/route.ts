import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import { writeAuditEntry } from '@/lib/audit';
import { WEBHOOK_TEST_EVENT } from '@/lib/webhooks/events';

const ROLES = [Role.GLOBAL_ADMIN, Role.PARISH_ADMIN] as const;

/**
 * Queue a synthetic delivery so an operator can verify their endpoint and
 * signature handling. The event is written pre-processed so normal fan-out
 * skips it — only this one subscription receives it.
 */
export const POST = (
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const parishId = claims.app_metadata.parish_id;
    if (!parishId) throw new ApiError(400, 'Parish context required');
    const requestId = randomUUID();

    const delivery = await withTenant(claims, async (tx) => {
      const subscription = await tx.webhookSubscription.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!subscription) throw new ApiError(404, 'Subscription not found');

      const event = await tx.webhookEvent.create({
        data: {
          dioceseId: claims.app_metadata.diocese_id,
          parishId,
          type: WEBHOOK_TEST_EVENT,
          payload: { test: true, requestedAt: new Date().toISOString() },
          processedAt: new Date(),
        },
      });

      return tx.webhookDelivery.create({
        data: {
          dioceseId: claims.app_metadata.diocese_id,
          parishId,
          subscriptionId: subscription.id,
          eventId: event.id,
          eventType: WEBHOOK_TEST_EVENT,
        },
        select: { id: true, status: true, eventType: true },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'integration.webhook.test_sent',
      entityType: 'WebhookSubscription',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId,
    });

    return Response.json({ ok: true, delivery }, { status: 202 });
  });
