import { Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { handle } from '@/lib/api';

const ROLES = [Role.GLOBAL_ADMIN, Role.PARISH_ADMIN] as const;

export const GET = (
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);

    const deliveries = await withTenant(claims, (tx) =>
      tx.webhookDelivery.findMany({
        where: { subscriptionId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          eventType: true,
          status: true,
          attemptCount: true,
          responseStatus: true,
          lastError: true,
          nextAttemptAt: true,
          lastAttemptAt: true,
          deliveredAt: true,
          createdAt: true,
        },
      }),
    );

    return Response.json({ ok: true, deliveries });
  });
