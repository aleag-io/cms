import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const { id: organizationId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.ORGANIZATION_LEADER,
    ]);
    requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const officers = await withTenant(claims, (tx) =>
      tx.organizationOfficer.findMany({
        where: { organizationId, isActive: true },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { termStart: 'desc' },
      }),
    );

    return Response.json({ ok: true, officers });
  });

export const POST = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id: organizationId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.ORGANIZATION_LEADER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      memberId?: string;
      title?: string;
    };
    if (!body.memberId) throw new ApiError(400, 'memberId is required');
    if (!body.title?.trim()) throw new ApiError(400, 'title is required');

    const officer = await withTenant(claims, async (tx) => {
      const org = await tx.organization.findFirst({
        where: { id: organizationId, parishId },
        select: { id: true },
      });
      if (!org) throw new ApiError(404, 'Organization not found');

      return tx.organizationOfficer.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          organizationId,
          memberId: body.memberId!,
          title: body.title!.trim(),
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.organization_officer.create',
      entityType: 'organization_officer',
      entityId: officer.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        organizationId,
        memberId: officer.memberId,
        title: officer.title,
      },
    });

    return Response.json({ ok: true, officer });
  });
