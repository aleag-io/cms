import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([Role.DIOCESE_ADMIN]);
    const claims = await claimsFromUser(actor);

    const grant = await withTenant(claims, async (tx) => {
      const existing = await tx.emergencyAccessGrant.findFirst({
        where: { id, dioceseId: actor.dioceseId },
      });
      if (!existing) throw new ApiError(404, 'Emergency access grant not found');
      if (!existing.isActive) throw new ApiError(409, 'Emergency access already revoked');

      return tx.emergencyAccessGrant.update({
        where: { id: existing.id },
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
      action: 'sharing.emergency.revoke',
      entityType: 'emergency_access_grant',
      entityId: grant.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: grant.parishId,
    });

    return Response.json({ ok: true, grant });
  });
