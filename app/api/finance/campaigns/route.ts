import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import {
  requireCents,
  requireDate,
  requireNonEmptyString,
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

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const dioceseId = claims.app_metadata.diocese_id!;
    const parishId = claims.app_metadata.parish_id;

    const campaigns = await withTenant(claims, (tx) =>
      tx.campaign.findMany({
        where: { dioceseId, ...(parishId ? { parishId } : {}) },
        include: {
          fund: { select: { name: true } },
          _count: { select: { pledges: true, donations: true } },
        },
        orderBy: { startDate: 'desc' },
        take: 200,
      }),
    );

    // Progress: received (donations) + pledged (pledge totals) per campaign.
    const progress = await withTenant(claims, async (tx) => {
      const [received, pledged] = await Promise.all([
        tx.donation.groupBy({
          by: ['campaignId'],
          where: {
            dioceseId,
            campaignId: { in: campaigns.map((c) => c.id) },
            status: 'ACTIVE',
          },
          _sum: { amountCents: true },
        }),
        tx.pledge.groupBy({
          by: ['campaignId'],
          where: { campaignId: { in: campaigns.map((c) => c.id) } },
          _sum: { amountCents: true },
        }),
      ]);
      return { received, pledged };
    });
    const receivedMap = new Map(
      progress.received.map((r) => [r.campaignId, r._sum.amountCents ?? BigInt(0)]),
    );
    const pledgedMap = new Map(
      progress.pledged.map((r) => [r.campaignId, r._sum.amountCents ?? BigInt(0)]),
    );

    return Response.json({
      ok: true,
      campaigns: campaigns.map((c) => ({
        ...c,
        goalCents: centsToJson(c.goalCents),
        receivedCents: centsToJson(receivedMap.get(c.id) ?? BigInt(0)),
        pledgedCents: centsToJson(pledgedMap.get(c.id) ?? BigInt(0)),
      })),
    });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const parishId =
      body.scope === 'diocese' ? null : claims.app_metadata.parish_id;

    const campaign = await withTenant(claims, (tx) =>
      tx.campaign.create({
        data: {
          dioceseId: claims.app_metadata.diocese_id!,
          parishId,
          name: requireNonEmptyString('name', body.name),
          description:
            typeof body.description === 'string'
              ? body.description.trim() || null
              : null,
          fundId: requireUuid('fundId', body.fundId),
          accountId: requireUuid('accountId', body.accountId),
          goalCents: requireCents('goalCents', body.goalCents),
          startDate: requireDate('startDate', body.startDate),
          endDate: requireDate('endDate', body.endDate),
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.campaign.create',
      entityType: 'finance_campaign',
      entityId: campaign.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id!,
      parishId,
      metadata: { name: campaign.name },
    });

    return Response.json(
      { ok: true, campaign: { ...campaign, goalCents: centsToJson(campaign.goalCents) } },
      { status: 201 },
    );
  });
