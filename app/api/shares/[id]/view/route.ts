import { randomUUID } from 'node:crypto';
import { AuditOutcome, ShareMode } from '@prisma/client';
import { claimsFromUser, requireSessionUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { anonymizeResource } from '@/lib/sharing/anonymize';
import { resolveSharedResource } from '@/lib/sharing/resources';

type Ctx = { params: Promise<{ id: string }> };

function isShareAccessible(share: {
  isActive: boolean;
  expiresAt: Date | null;
  maxViews: number | null;
  viewCount: number;
}) {
  if (!share.isActive) return false;
  if (share.expiresAt && share.expiresAt <= new Date()) return false;
  if (share.maxViews !== null && share.viewCount >= share.maxViews) return false;
  return true;
}

export const GET = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireSessionUser();
    const claims = await claimsFromUser(actor);
    const roleSet = new Set(claims.app_metadata.roles.map((r) => r.toLowerCase()));

    const result = await withTenant(claims, async (tx) => {
      const share = await tx.contextualShare.findFirst({ where: { id } });
      if (!share) throw new ApiError(404, 'Share not found');
      if (
        share.shareMode !== ShareMode.USER_SHARE &&
        share.shareMode !== ShareMode.ROLE_SHARE
      ) {
        throw new ApiError(400, 'Invalid share mode for authenticated view');
      }

      const allowedByTarget =
        (share.shareMode === ShareMode.USER_SHARE &&
          share.recipientUserId === actor.id) ||
        (share.shareMode === ShareMode.ROLE_SHARE &&
          share.recipientRole &&
          roleSet.has(share.recipientRole.toLowerCase()));

      if (!allowedByTarget || !isShareAccessible(share)) {
        return { share, denied: true as const };
      }

      const updated = await tx.contextualShare.update({
        where: { id: share.id },
        data: { viewCount: { increment: 1 } },
      });
      return { share: updated, denied: false as const };
    });

    if (result.denied) {
      await writeAuditEntry({
        requestId,
        actorUserId: actor.id,
        actorLabel: actor.email,
        action: 'sharing.share.denied',
        entityType: 'contextual_share',
        entityId: result.share.id,
        outcome: AuditOutcome.DENIED,
        dioceseId: actor.dioceseId,
        parishId: actor.parishId,
      });
      throw new ApiError(403, 'Share is no longer accessible');
    }

    // The validated share is the authorization grant: recipients may be in a
    // different parish/diocese-level than the shared resource, so the payload
    // is read with the privileged client (RLS would deny a cross-parish
    // recipient). Isolation is enforced by the trusted share.parishId filter.
    const payload = await resolveSharedResource({
      parishId: result.share.parishId,
      resourceType: result.share.resourceType,
      resourceId: result.share.resourceId,
    });

    const responsePayload = result.share.isAnonymized
      ? anonymizeResource(payload as Record<string, unknown>)
      : payload;

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'sharing.share.view',
      entityType: 'contextual_share',
      entityId: result.share.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
      metadata: {
        shareId: result.share.id,
        viewCount: result.share.viewCount,
      },
    });

    return Response.json({ ok: true, payload: responsePayload });
  });
