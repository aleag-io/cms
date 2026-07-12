import { randomUUID } from 'node:crypto';
import { AuditOutcome, CampaignStatus, Role } from '@prisma/client';
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

const STATUSES = new Set<CampaignStatus>(['ACTIVE', 'COMPLETED', 'CANCELLED']);

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
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if ('description' in body) {
      data.description = typeof body.description === 'string' ? body.description.trim() || null : null;
    }
    if (body.goalCents != null && body.goalCents !== '') data.goalCents = requireCents('goalCents', body.goalCents);
    if (typeof body.startDate === 'string' && body.startDate.trim()) data.startDate = requireDate('startDate', body.startDate);
    if (typeof body.endDate === 'string' && body.endDate.trim()) data.endDate = requireDate('endDate', body.endDate);
    if (typeof body.status === 'string' && STATUSES.has(body.status as CampaignStatus)) {
      data.status = body.status as CampaignStatus;
    }

    const campaign = await withTenant(claims, async (tx) => {
      const existing = await tx.campaign.findUnique({ where: { id } });
      if (!existing) throw new ApiError(404, 'Campaign not found');
      return tx.campaign.update({ where: { id }, data });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.campaign.update',
      entityType: 'finance_campaign',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: campaign.dioceseId,
      parishId: campaign.parishId,
      metadata: { name: campaign.name },
    });

    return Response.json({
      ok: true,
      campaign: { ...campaign, goalCents: centsToJson(campaign.goalCents) },
    });
  });
