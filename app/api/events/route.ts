import { randomUUID } from 'node:crypto';
import { AuditOutcome, EventType, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { emitWebhookEvent } from '@/lib/webhooks/emit';
import { ApiError, handle } from '@/lib/api';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MINISTRY_LEADER,
      Role.ORGANIZATION_LEADER,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const events = await withTenant(claims, (tx) =>
      tx.event.findMany({
        where: { parishId },
        orderBy: { startAt: 'asc' },
      }),
    );

    return Response.json({ ok: true, events });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      eventType?: EventType;
      startAt?: string;
      endAt?: string;
      recurrenceRule?: string | null;
      maxCapacity?: number | null;
      facilityId?: string | null;
      isPublic?: boolean;
    };

    if (!body.name?.trim()) throw new ApiError(400, 'name is required');
    if (!body.startAt || !body.endAt) {
      throw new ApiError(400, 'startAt and endAt are required');
    }
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (endAt <= startAt)
      throw new ApiError(400, 'endAt must be after startAt');

    const event = await withTenant(claims, async (tx) => {
      const created = await tx.event.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          name: body.name!.trim(),
          description: body.description?.trim() || null,
          eventType: body.eventType ?? EventType.OTHER,
          startAt,
          endAt,
          recurrenceRule: body.recurrenceRule?.trim() || null,
          maxCapacity: body.maxCapacity ?? null,
          facilityId: body.facilityId || null,
          isPublic: body.isPublic ?? true,
        },
      });

      await emitWebhookEvent(tx, {
        dioceseId: actor.dioceseId,
        parishId,
        type: 'event.created',
        entityId: created.id,
        payload: {
          eventId: created.id,
          parishId,
          name: created.name,
          eventType: created.eventType,
          startAt: created.startAt.toISOString(),
        },
      });

      return created;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.event.create',
      entityType: 'event',
      entityId: event.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { name: event.name, startAt: event.startAt.toISOString() },
    });

    return Response.json({ ok: true, event });
  });
