import { randomUUID } from 'node:crypto';
import { AuditOutcome, ShareMode } from '@prisma/client';
import { claimsFromUser, requireSessionUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { anonymizeResource } from '@/lib/sharing/anonymize';
import { resolveSharedResource } from '@/lib/sharing/resources';
import { tryConsumeShareView } from '@/lib/sharing/consume-view';

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireSessionUser();
    const claims = await claimsFromUser(actor);
    const roleSet = new Set(
      claims.app_metadata.roles.map((r) => r.toLowerCase()),
    );

    const existing = await withTenant(claims, (tx) =>
      tx.contextualShare.findFirst({ where: { id } }),
    );
    if (!existing) throw new ApiError(404, 'Share not found');
    if (
      existing.shareMode !== ShareMode.USER_SHARE &&
      existing.shareMode !== ShareMode.ROLE_SHARE
    ) {
      throw new ApiError(400, 'Invalid share mode for authenticated view');
    }

    const allowedByTarget =
      (existing.shareMode === ShareMode.USER_SHARE &&
        existing.recipientUserId === actor.id) ||
      (existing.shareMode === ShareMode.ROLE_SHARE &&
        existing.recipientRole &&
        roleSet.has(existing.recipientRole.toLowerCase()));

    if (!allowedByTarget) {
      await writeAuditEntry({
        requestId,
        actorUserId: actor.id,
        actorLabel: actor.email,
        action: 'sharing.share.denied',
        entityType: 'contextual_share',
        entityId: existing.id,
        outcome: AuditOutcome.DENIED,
        dioceseId: actor.dioceseId,
        parishId: actor.parishId,
      });
      throw new ApiError(403, 'Share is no longer accessible');
    }

    // Atomic view consume (privileged client — same isolation model as resource resolve).
    const updated = await tryConsumeShareView(existing.id);
    if (!updated) {
      await writeAuditEntry({
        requestId,
        actorUserId: actor.id,
        actorLabel: actor.email,
        action: 'sharing.share.denied',
        entityType: 'contextual_share',
        entityId: existing.id,
        outcome: AuditOutcome.DENIED,
        dioceseId: actor.dioceseId,
        parishId: actor.parishId,
      });
      throw new ApiError(403, 'Share is no longer accessible');
    }

    const payload = await resolveSharedResource({
      parishId: updated.parishId,
      resourceType: updated.resourceType,
      resourceId: updated.resourceId,
    });

    const responsePayload = updated.isAnonymized
      ? anonymizeResource(payload as Record<string, unknown>)
      : payload;

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'sharing.share.view',
      entityType: 'contextual_share',
      entityId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
      metadata: {
        shareId: updated.id,
        viewCount: updated.viewCount,
      },
    });

    return Response.json({ ok: true, payload: responsePayload });
  });
