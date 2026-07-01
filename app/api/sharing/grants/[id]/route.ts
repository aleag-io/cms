import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_DATA_SHARING_MANAGER,
      Role.DIOCESE_ADMIN,
      Role.DIOCESE_STAFF,
      Role.DIOCESE_REPORT_VIEWER,
    ]);
    const claims = await claimsFromUser(actor);

    const grant = await withTenant(claims, (tx) =>
      tx.dataSharingGrant.findFirst({
        where: {
          id,
          OR: actor.parishId
            ? [{ parishId: actor.parishId }]
            : [{ dioceseId: actor.dioceseId, granteeId: actor.dioceseId }],
        },
      }),
    );

    if (!grant) throw new ApiError(404, 'Grant not found');
    return Response.json({ ok: true, grant });
  });

export const DELETE = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_DATA_SHARING_MANAGER,
    ]);
    if (!actor.parishId) throw new ApiError(400, 'Parish scope required');
    const claims = await claimsFromUser(actor);

    const revoked = await withTenant(claims, async (tx) => {
      const grant = await tx.dataSharingGrant.findFirst({
        where: { id, parishId: actor.parishId! },
      });
      if (!grant) throw new ApiError(404, 'Grant not found');
      if (!grant.isActive) throw new ApiError(409, 'Grant already revoked');

      return tx.dataSharingGrant.update({
        where: { id: grant.id },
        data: {
          isActive: false,
          revokedAt: new Date(),
          revokedByUserId: actor.id,
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'sharing.grant.revoke',
      entityType: 'data_sharing_grant',
      entityId: revoked.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
    });

    return Response.json({ ok: true, grant: revoked });
  });
