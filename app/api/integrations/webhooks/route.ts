import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import { writeAuditEntry } from '@/lib/audit';
import {
  generateWebhookSecret,
  maskSecret,
  parseWebhookEvents,
  parseWebhookName,
  parseWebhookUrl,
} from '@/lib/webhooks/validate';

// Webhook configuration is infrastructure administration (like Parish Users),
// so it is role-gated rather than carrying its own permission resource (D8).
const ROLES = [Role.GLOBAL_ADMIN, Role.PARISH_ADMIN] as const;

function requireParish(parishId: string | null | undefined): string {
  if (!parishId) throw new ApiError(400, 'Parish context required');
  return parishId;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const parishId = requireParish(claims.app_metadata.parish_id);

    const rows = await withTenant(claims, (tx) =>
      tx.webhookSubscription.findMany({
        where: { parishId },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { deliveries: true } },
        },
      }),
    );

    return Response.json({
      ok: true,
      subscriptions: rows.map((row) => ({
        id: row.id,
        name: row.name,
        url: row.url,
        events: row.events,
        isActive: row.isActive,
        createdAt: row.createdAt,
        deliveryCount: row._count.deliveries,
        // Never return the signing secret after creation/rotation.
        secretPreview: maskSecret(row.secret),
      })),
    });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const parishId = requireParish(claims.app_metadata.parish_id);
    const requestId = randomUUID();

    const body = (await request.json()) as Record<string, unknown>;
    const name = parseWebhookName(body.name);
    const url = parseWebhookUrl(body.url);
    const events = parseWebhookEvents(body.events);
    const secret = generateWebhookSecret();

    const created = await withTenant(claims, (tx) =>
      tx.webhookSubscription.create({
        data: {
          dioceseId: claims.app_metadata.diocese_id,
          parishId,
          name,
          url,
          secret,
          events,
          createdByUserId: actor.id,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'integration.webhook.created',
      entityType: 'WebhookSubscription',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId,
      metadata: { name, url, events },
    });

    return Response.json(
      {
        ok: true,
        subscription: {
          id: created.id,
          name: created.name,
          url: created.url,
          events: created.events,
          isActive: created.isActive,
        },
        // Shown exactly once — the API never returns it again.
        secret,
      },
      { status: 201 },
    );
  });
