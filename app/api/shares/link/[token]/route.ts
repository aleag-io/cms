import { randomUUID } from 'node:crypto';
import { AuditOutcome, ShareMode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { hashToken } from '@/lib/sharing/tokens';
import { anonymizeResource } from '@/lib/sharing/anonymize';
import { resolveSharedResource } from '@/lib/sharing/resources';

type Ctx = { params: Promise<{ token: string }> };

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
    const { token } = await ctx.params;
    const tokenHash = hashToken(token);

    const share = await prisma.contextualShare.findUnique({
      where: { tokenHash },
    });

    if (!share || share.shareMode !== ShareMode.SECURE_LINK || !isShareAccessible(share)) {
      if (share) {
        await writeAuditEntry({
          requestId,
          actorLabel: 'secure-link',
          action: 'sharing.share.denied',
          entityType: 'contextual_share',
          entityId: share.id,
          outcome: AuditOutcome.DENIED,
          dioceseId: share.dioceseId,
          parishId: share.parishId,
          metadata: { shareId: share.id },
        });
      }
      throw new ApiError(403, 'Share is no longer accessible');
    }

    const updated = await prisma.contextualShare.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 } },
    });

    const payload = await resolveSharedResource({
      parishId: updated.parishId,
      resourceType: updated.resourceType,
      resourceId: updated.resourceId,
    });

    await writeAuditEntry({
      requestId,
      actorLabel: 'secure-link',
      action: 'sharing.share.view',
      entityType: 'contextual_share',
      entityId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: updated.dioceseId,
      parishId: updated.parishId,
      metadata: {
        shareId: updated.id,
        viewCount: updated.viewCount,
      },
    });

    return Response.json({
      ok: true,
      payload: updated.isAnonymized
        ? anonymizeResource(payload as Record<string, unknown>)
        : payload,
    });
  });
