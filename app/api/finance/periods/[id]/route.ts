import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

const CLOSE_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.PARISH_ADMIN,
  Role.ORGANIZATION_LEADER,
] as const;

export const PATCH = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([...CLOSE_ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action !== 'CLOSE') {
      throw new ApiError(400, 'action must be CLOSE');
    }

    const period = await withTenant(claims, async (tx) => {
      const openWork = await tx.journalEntry.count({
        where: {
          periodId: id,
          status: { in: ['DRAFT', 'PENDING_APPROVAL'] },
        },
      });
      if (openWork > 0) {
        throw new ApiError(
          400,
          'Cannot close period while draft or pending journals exist',
        );
      }
      return tx.accountingPeriod.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedByUserId: actor.id,
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.period.close',
      entityType: 'finance_period',
      entityId: period.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: period.dioceseId,
      parishId: period.parishId,
      metadata: { periodId: period.id },
    });

    return Response.json({ ok: true, period });
  });
