import { randomUUID } from 'node:crypto';
import { AuditOutcome, MessageChannel, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const templates = await withTenant(claims, (tx) =>
      tx.messageTemplate.findMany({
        where: { parishId },
        orderBy: { name: 'asc' },
      }),
    );

    return Response.json({ ok: true, templates });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      name?: string;
      channel?: MessageChannel;
      subject?: string | null;
      body?: string;
    };
    if (!body.name?.trim()) throw new ApiError(400, 'name is required');
    if (!body.body?.trim()) throw new ApiError(400, 'body is required');

    const template = await withTenant(claims, (tx) =>
      tx.messageTemplate.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          name: body.name!.trim(),
          channel: body.channel ?? MessageChannel.EMAIL,
          subject: body.subject?.trim() || null,
          body: body.body!.trim(),
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.message_template.create',
      entityType: 'message_template',
      entityId: template.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { name: template.name, channel: template.channel },
    });

    return Response.json({ ok: true, template });
  });
