import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireSessionUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { publicShare } from '@/lib/sharing/public-share';
import { elevatedRolesForWorkContext } from '@/lib/context/working-parish';

function canManage(role: Role): boolean {
  const elevated = elevatedRolesForWorkContext(role);
  return (
    role === Role.PARISH_ADMIN ||
    role === Role.PARISH_DATA_SHARING_MANAGER ||
    elevated.includes(Role.PARISH_ADMIN) ||
    elevated.includes(Role.PARISH_DATA_SHARING_MANAGER)
  );
}

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireSessionUser();
    const claims = await claimsFromUser(actor);

    const share = await withTenant(claims, (tx) =>
      tx.contextualShare.findFirst({
        where: {
          id,
          OR: canManage(actor.role)
            ? [
                { parishId: actor.parishId ?? undefined },
                { createdByUserId: actor.id },
              ]
            : [{ createdByUserId: actor.id }],
        },
      }),
    );

    if (!share) throw new ApiError(404, 'Share not found');
    return Response.json({ ok: true, share: publicShare(share) });
  });

export const DELETE = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireSessionUser();
    const claims = await claimsFromUser(actor);

    const updated = await withTenant(claims, async (tx) => {
      const share = await tx.contextualShare.findFirst({
        where: {
          id,
          OR: canManage(actor.role)
            ? [
                { parishId: actor.parishId ?? undefined },
                { createdByUserId: actor.id },
              ]
            : [{ createdByUserId: actor.id }],
        },
      });
      if (!share) throw new ApiError(404, 'Share not found');
      if (!share.isActive) throw new ApiError(409, 'Share already revoked');

      return tx.contextualShare.update({
        where: { id: share.id },
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
      action: 'sharing.share.revoke',
      entityType: 'contextual_share',
      entityId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
    });

    return Response.json({ ok: true, share: publicShare(updated) });
  });
