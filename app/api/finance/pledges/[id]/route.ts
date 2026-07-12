import { randomUUID } from 'node:crypto';
import { AuditOutcome, PledgeFrequency, PledgeStatus, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { requireCents, requireDate } from '@/lib/finance/validate';
import { centsToJson } from '@/lib/finance/money';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

const FREQUENCIES = new Set<PledgeFrequency>(['ONE_TIME', 'WEEKLY', 'MONTHLY', 'ANNUAL']);
const STATUSES = new Set<PledgeStatus>(['ACTIVE', 'FULFILLED', 'LAPSED', 'CANCELLED']);

export const PATCH = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    if (body.amountCents != null && body.amountCents !== '') data.amountCents = requireCents('amountCents', body.amountCents);
    if (typeof body.frequency === 'string' && FREQUENCIES.has(body.frequency as PledgeFrequency)) {
      data.frequency = body.frequency as PledgeFrequency;
    }
    if (typeof body.status === 'string' && STATUSES.has(body.status as PledgeStatus)) {
      data.status = body.status as PledgeStatus;
    }
    if (typeof body.endDate === 'string' && body.endDate.trim()) data.endDate = requireDate('endDate', body.endDate);

    const pledge = await withTenant(claims, async (tx) => {
      const existing = await tx.pledge.findUnique({ where: { id } });
      if (!existing) throw new ApiError(404, 'Pledge not found');
      return tx.pledge.update({ where: { id }, data });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.pledge.update',
      entityType: 'finance_pledge',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: pledge.dioceseId,
      parishId: pledge.parishId,
      metadata: { status: pledge.status },
    });

    return Response.json({
      ok: true,
      pledge: {
        ...pledge,
        amountCents: centsToJson(pledge.amountCents),
        fulfilledCents: centsToJson(pledge.fulfilledCents),
      },
    });
  });
