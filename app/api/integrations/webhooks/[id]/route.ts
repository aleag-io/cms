import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import { writeAuditEntry } from '@/lib/audit';
import {
  maskSecret,
  parseWebhookEvents,
  parseWebhookName,
  parseWebhookUrl,
} from '@/lib/webhooks/validate';

const ROLES = [Role.GLOBAL_ADMIN, Role.PARISH_ADMIN] as const;

export const PATCH = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const requestId = randomUUID();
    const body = (await request.json()) as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = parseWebhookName(body.name);
    if (body.url !== undefined) data.url = parseWebhookUrl(body.url);
    if (body.events !== undefined) data.events = parseWebhookEvents(body.events);
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        throw new ApiError(400, 'isActive must be a boolean');
      }
      data.isActive = body.isActive;
    }
    if (Object.keys(data).length === 0) {
      throw new ApiError(400, 'No updatable fields provided');
    }

    // RLS scopes the update to this parish; a cross-parish id matches no row.
    const updated = await withTenant(claims, async (tx) => {
      const result = await tx.webhookSubscription.updateMany({
        where: { id },
        data,
      });
      if (result.count === 0) throw new ApiError(404, 'Subscription not found');
      return tx.webhookSubscription.findFirst({ where: { id } });
    });
    if (!updated) throw new ApiError(404, 'Subscription not found');

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'integration.webhook.updated',
      entityType: 'WebhookSubscription',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId: claims.app_metadata.parish_id,
      metadata: { changed: Object.keys(data) },
    });

    return Response.json({
      ok: true,
      subscription: {
        id: updated.id,
        name: updated.name,
        url: updated.url,
        events: updated.events,
        isActive: updated.isActive,
        secretPreview: maskSecret(updated.secret),
      },
    });
  });

export const DELETE = (
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const requestId = randomUUID();

    const deleted = await withTenant(claims, (tx) =>
      tx.webhookSubscription.deleteMany({ where: { id } }),
    );
    if (deleted.count === 0) throw new ApiError(404, 'Subscription not found');

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'integration.webhook.deleted',
      entityType: 'WebhookSubscription',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId: claims.app_metadata.parish_id,
    });

    return Response.json({ ok: true });
  });
