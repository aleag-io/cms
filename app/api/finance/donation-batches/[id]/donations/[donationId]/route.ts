import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

export const DELETE = (
  _request: Request,
  ctx: { params: Promise<{ id: string; donationId: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id, donationId } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);

    const batch = await withTenant(claims, async (tx) => {
      const b = await tx.donationBatch.findUnique({ where: { id } });
      if (!b) throw new ApiError(404, 'Batch not found');
      if (b.status !== 'OPEN') throw new ApiError(400, 'Batch is not open');
      await tx.donation.delete({ where: { id: donationId } });
      const agg = await tx.donation.aggregate({
        where: { batchId: id, status: 'ACTIVE' },
        _sum: { amountCents: true },
        _count: true,
      });
      return tx.donationBatch.update({
        where: { id },
        data: { totalCents: agg._sum.amountCents ?? BigInt(0), donationCount: agg._count },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.donation.void',
      entityType: 'finance_donation',
      entityId: donationId,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: batch.dioceseId,
      parishId: batch.parishId,
      metadata: { batchId: id },
    });

    return Response.json({ ok: true });
  });
