import { randomUUID } from 'node:crypto';
import { AuditOutcome, PledgeFrequency, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import {
  optionalUuid,
  requireCents,
  requireDate,
  requireUuid,
} from '@/lib/finance/validate';
import { centsToJson } from '@/lib/finance/money';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

const FREQUENCIES = new Set<PledgeFrequency>([
  'ONE_TIME',
  'WEEKLY',
  'MONTHLY',
  'ANNUAL',
]);

function serialize<T extends { amountCents: bigint; fulfilledCents: bigint }>(p: T) {
  return {
    ...p,
    amountCents: centsToJson(p.amountCents),
    fulfilledCents: centsToJson(p.fulfilledCents),
  };
}

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    const campaignId = url.searchParams.get('campaignId');
    const pledges = await withTenant(claims, (tx) =>
      tx.pledge.findMany({
        where: {
          dioceseId: claims.app_metadata.diocese_id!,
          ...(campaignId ? { campaignId } : {}),
        },
        include: {
          family: { select: { familyName: true } },
          member: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    );
    return Response.json({ ok: true, pledges: pledges.map(serialize) });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const campaignId = requireUuid('campaignId', body.campaignId);
    const familyId = optionalUuid('familyId', body.familyId);
    const memberId = optionalUuid('memberId', body.memberId);
    if (!familyId && !memberId) {
      throw new ApiError(400, 'A pledge needs a family or member');
    }
    const frequency =
      typeof body.frequency === 'string' && FREQUENCIES.has(body.frequency as PledgeFrequency)
        ? (body.frequency as PledgeFrequency)
        : 'ONE_TIME';

    const pledge = await withTenant(claims, async (tx) => {
      const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw new ApiError(404, 'Campaign not found');
      return tx.pledge.create({
        data: {
          dioceseId: campaign.dioceseId,
          parishId: campaign.parishId,
          campaignId,
          familyId,
          memberId,
          amountCents: requireCents('amountCents', body.amountCents),
          frequency,
          startDate: requireDate('startDate', body.startDate),
          endDate:
            typeof body.endDate === 'string' && body.endDate.trim()
              ? requireDate('endDate', body.endDate)
              : null,
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.pledge.create',
      entityType: 'finance_pledge',
      entityId: pledge.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: pledge.dioceseId,
      parishId: pledge.parishId,
      metadata: { campaignId, amountCents: centsToJson(pledge.amountCents) },
    });

    return Response.json({ ok: true, pledge: serialize(pledge) }, { status: 201 });
  });
