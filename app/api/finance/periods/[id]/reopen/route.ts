import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

/** GLOBAL_ADMIN only — mandatory non-empty reason (PA-21). */
export const POST = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([Role.GLOBAL_ADMIN]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const reason =
      typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      throw new ApiError(400, 'reason is required to reopen a period');
    }

    const period = await withTenant(claims, (tx) =>
      tx.accountingPeriod.update({
        where: { id },
        data: {
          status: 'OPEN',
          reopenReason: reason,
          reopenedAt: new Date(),
          reopenedByUserId: actor.id,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.period.reopen',
      entityType: 'finance_period',
      entityId: period.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: period.dioceseId,
      parishId: period.parishId,
      metadata: { periodId: period.id, reason },
    });

    return Response.json({ ok: true, period });
  });
