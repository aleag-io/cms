import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import { writeAuditEntry } from '@/lib/audit';

const ROLES = [Role.GLOBAL_ADMIN, Role.PARISH_ADMIN] as const;

/** Re-queue a failed or dead delivery for immediate retry by the worker. */
export const POST = (
  _request: Request,
  ctx: { params: Promise<{ id: string; deliveryId: string }> },
) =>
  handle(async () => {
    const { id, deliveryId } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const requestId = randomUUID();

    // nextAttemptAt is stamped with the database clock (see lib/webhooks/worker.ts)
    // so "retry now" is immediately due for the claim query.
    const updated = await withTenant(claims, (tx) =>
      tx.$executeRaw`
        UPDATE "WebhookDelivery"
        SET status = 'PENDING'::"WebhookDeliveryStatus",
            "nextAttemptAt" = now(),
            "lastError" = NULL,
            "updatedAt" = now()
        WHERE id = ${deliveryId}::uuid
          AND "subscriptionId" = ${id}::uuid
          AND status IN ('FAILED', 'DEAD')
      `,
    );
    if (updated === 0) {
      throw new ApiError(404, 'No retryable delivery found');
    }

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'integration.webhook.delivery_retried',
      entityType: 'WebhookDelivery',
      entityId: deliveryId,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId: claims.app_metadata.parish_id,
    });

    return Response.json({ ok: true });
  });
