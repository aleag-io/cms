import { randomUUID } from 'node:crypto';
import { AuditOutcome, RsvpStatus, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const POST = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id: eventId } = await ctx.params;
    const actor = await requireRole([
      Role.MEMBER,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
    ]);
    const claims = await claimsFromUser(actor);
    const memberId = claims.app_metadata.member_id;
    if (!memberId) throw new ApiError(400, 'No member profile for this user');

    const body = (await request.json()) as { rsvpStatus?: RsvpStatus };
    const rsvpStatus = body.rsvpStatus ?? RsvpStatus.YES;

    const attendance = await withTenant(claims, async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          parishId: true,
          dioceseId: true,
          maxCapacity: true,
        },
      });
      if (!event) throw new ApiError(404, 'Event not found');

      const existing = await tx.eventAttendance.findUnique({
        where: { eventId_memberId: { eventId, memberId } },
        select: { id: true, rsvpStatus: true },
      });

      // Capacity check: only count NEW "YES" RSVPs against the cap.
      if (
        event.maxCapacity != null &&
        rsvpStatus === RsvpStatus.YES &&
        existing?.rsvpStatus !== RsvpStatus.YES
      ) {
        const yesCount = await tx.eventAttendance.count({
          where: { eventId, rsvpStatus: RsvpStatus.YES },
        });
        if (yesCount >= event.maxCapacity) {
          throw new ApiError(409, 'Event is at capacity');
        }
      }

      return tx.eventAttendance.upsert({
        where: { eventId_memberId: { eventId, memberId } },
        create: {
          dioceseId: event.dioceseId,
          parishId: event.parishId,
          eventId,
          memberId,
          rsvpStatus,
        },
        update: { rsvpStatus },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.event.rsvp',
      entityType: 'event_attendance',
      entityId: attendance.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
      metadata: { eventId, rsvpStatus },
    });

    return Response.json({ ok: true, attendance });
  });
