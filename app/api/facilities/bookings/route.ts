import { randomUUID } from 'node:crypto';
import { AuditOutcome, FacilityBookingStatus, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { isFacilityOverlapViolation } from '@/lib/db/errors';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const facilityId = new URL(request.url).searchParams.get('facilityId');

    const bookings = await withTenant(claims, (tx) =>
      tx.facilityBooking.findMany({
        where: {
          parishId,
          ...(facilityId ? { facilityId } : {}),
          status: { not: FacilityBookingStatus.CANCELLED },
        },
        include: {
          facility: { select: { id: true, name: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
    );

    return Response.json({ ok: true, bookings });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      facilityId?: string;
      eventId?: string | null;
      title?: string;
      startAt?: string;
      endAt?: string;
      status?: FacilityBookingStatus;
    };

    if (!body.facilityId) throw new ApiError(400, 'facilityId is required');
    if (!body.title?.trim()) throw new ApiError(400, 'title is required');
    if (!body.startAt || !body.endAt) {
      throw new ApiError(400, 'startAt and endAt are required');
    }
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (endAt <= startAt)
      throw new ApiError(400, 'endAt must be after startAt');

    try {
      const booking = await withTenant(claims, async (tx) => {
        const facility = await tx.facility.findFirst({
          where: { id: body.facilityId, parishId },
          select: { id: true },
        });
        if (!facility) throw new ApiError(404, 'Facility not found');

        return tx.facilityBooking.create({
          data: {
            dioceseId: actor.dioceseId,
            parishId,
            facilityId: body.facilityId!,
            eventId: body.eventId || null,
            title: body.title!.trim(),
            startAt,
            endAt,
            status: body.status ?? FacilityBookingStatus.CONFIRMED,
          },
        });
      });

      await writeAuditEntry({
        requestId,
        actorUserId: actor.id,
        actorLabel: actor.email,
        action: 'operations.facility_booking.create',
        entityType: 'facility_booking',
        entityId: booking.id,
        outcome: AuditOutcome.SUCCESS,
        dioceseId: actor.dioceseId,
        parishId,
        metadata: { facilityId: booking.facilityId, title: booking.title },
      });

      return Response.json({ ok: true, booking });
    } catch (err) {
      if (isFacilityOverlapViolation(err)) {
        await writeAuditEntry({
          requestId,
          actorUserId: actor.id,
          actorLabel: actor.email,
          action: 'operations.facility_booking.create',
          entityType: 'facility_booking',
          entityId: null,
          outcome: AuditOutcome.DENIED,
          dioceseId: actor.dioceseId,
          parishId,
          metadata: { facilityId: body.facilityId, reason: 'overlap' },
        });
        return Response.json(
          { ok: false, error: 'Facility is already booked for that time' },
          { status: 409 },
        );
      }
      throw err;
    }
  });
