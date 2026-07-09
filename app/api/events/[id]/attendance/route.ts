import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role, RsvpStatus } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const { id: eventId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MINISTRY_LEADER,
      Role.ORGANIZATION_LEADER,
    ]);
    requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const attendance = await withTenant(claims, (tx) =>
      tx.eventAttendance.findMany({
        where: { eventId },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );

    return Response.json({ ok: true, attendance });
  });

export const PATCH = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id: eventId } = await ctx.params;
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      memberId?: string;
      attended?: boolean;
      rsvpStatus?: RsvpStatus;
    };
    if (!body.memberId) throw new ApiError(400, 'memberId is required');
    if (body.attended === undefined && body.rsvpStatus === undefined) {
      throw new ApiError(400, 'attended or rsvpStatus is required');
    }

    const attendance = await withTenant(claims, async (tx) => {
      const event = await tx.event.findFirst({
        where: { id: eventId, parishId },
        select: { id: true, dioceseId: true, parishId: true },
      });
      if (!event) throw new ApiError(404, 'Event not found');

      return tx.eventAttendance.upsert({
        where: {
          eventId_memberId: { eventId, memberId: body.memberId! },
        },
        create: {
          dioceseId: event.dioceseId,
          parishId: event.parishId,
          eventId,
          memberId: body.memberId!,
          rsvpStatus: body.rsvpStatus ?? RsvpStatus.YES,
          attended: body.attended ?? false,
        },
        update: {
          ...(body.attended !== undefined ? { attended: body.attended } : {}),
          ...(body.rsvpStatus !== undefined
            ? { rsvpStatus: body.rsvpStatus }
            : {}),
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.event.attendance',
      entityType: 'event_attendance',
      entityId: attendance.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        eventId,
        memberId: body.memberId,
        attended: attendance.attended,
        rsvpStatus: attendance.rsvpStatus,
      },
    });

    return Response.json({ ok: true, attendance });
  });
