import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import { writeAuditEntry } from '@/lib/audit';
import { generateWebhookSecret } from '@/lib/webhooks/validate';

const ROLES = [Role.GLOBAL_ADMIN, Role.PARISH_ADMIN] as const;

export const POST = (
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const requestId = randomUUID();
    const secret = generateWebhookSecret();

    const updated = await withTenant(claims, (tx) =>
      tx.webhookSubscription.updateMany({ where: { id }, data: { secret } }),
    );
    if (updated.count === 0) throw new ApiError(404, 'Subscription not found');

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'integration.webhook.secret_rotated',
      entityType: 'WebhookSubscription',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId: claims.app_metadata.parish_id,
    });

    // Returned exactly once; existing receivers must be updated to match.
    return Response.json({ ok: true, secret });
  });
