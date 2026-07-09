import { randomUUID } from 'node:crypto';
import { AuditOutcome, ObservanceType, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await context.params;
    const body = (await request.json()) as {
      title?: string;
      observanceType?: ObservanceType;
      month?: number | null;
      day?: number | null;
      occursOn?: string | null;
      endsOn?: string | null;
      lectionaryRef?: string | null;
      isPublished?: boolean;
    };

    // Load with elevated path: try diocese first, then parish roles.
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.DIOCESE_STAFF,
      Role.GLOBAL_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
    ]);
    const claims = await claimsFromUser(actor);

    const updated = await withTenant(claims, async (tx) => {
      const existing = await tx.liturgicalObservance.findFirst({
        where: { id },
      });
      if (!existing) throw new ApiError(404, 'Observance not found');

      // Parish actors may only mutate parish-local rows in their parish.
      if (existing.parishId) {
        if (existing.parishId !== actor.parishId) {
          throw new ApiError(403, 'Forbidden');
        }
        const parishWriters: Role[] = [
          Role.PARISH_ADMIN,
          Role.PARISH_STAFF,
          Role.GLOBAL_ADMIN,
        ];
        if (!parishWriters.includes(actor.role)) {
          throw new ApiError(403, 'Forbidden');
        }
      } else {
        const dioceseWriters: Role[] = [
          Role.DIOCESE_ADMIN,
          Role.DIOCESE_STAFF,
          Role.GLOBAL_ADMIN,
        ];
        if (!dioceseWriters.includes(actor.role)) {
          throw new ApiError(403, 'Forbidden');
        }
      }

      return tx.liturgicalObservance.update({
        where: { id },
        data: {
          ...(body.title !== undefined && { title: body.title.trim() }),
          ...(body.observanceType !== undefined && {
            observanceType: body.observanceType,
          }),
          ...(body.month !== undefined && { month: body.month }),
          ...(body.day !== undefined && { day: body.day }),
          ...(body.occursOn !== undefined && {
            occursOn: body.occursOn ? new Date(body.occursOn) : null,
          }),
          ...(body.endsOn !== undefined && {
            endsOn: body.endsOn ? new Date(body.endsOn) : null,
          }),
          ...(body.lectionaryRef !== undefined && {
            lectionaryRef: body.lectionaryRef,
          }),
          ...(body.isPublished !== undefined && {
            isPublished: body.isPublished,
          }),
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'liturgical.observance.update',
      entityType: 'liturgical_observance',
      entityId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: updated.parishId,
    });

    return Response.json({ ok: true, observance: updated });
  });

export const DELETE = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await context.params;
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.DIOCESE_STAFF,
      Role.GLOBAL_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
    ]);
    const claims = await claimsFromUser(actor);

    await withTenant(claims, async (tx) => {
      const existing = await tx.liturgicalObservance.findFirst({
        where: { id },
      });
      if (!existing) throw new ApiError(404, 'Observance not found');

      if (existing.parishId) {
        if (existing.parishId !== actor.parishId) {
          throw new ApiError(403, 'Forbidden');
        }
      } else {
        const dioceseWriters: Role[] = [
          Role.DIOCESE_ADMIN,
          Role.DIOCESE_STAFF,
          Role.GLOBAL_ADMIN,
        ];
        if (!dioceseWriters.includes(actor.role)) {
          throw new ApiError(403, 'Forbidden');
        }
      }

      await tx.liturgicalObservance.delete({ where: { id } });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'liturgical.observance.delete',
      entityType: 'liturgical_observance',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
    });

    return Response.json({ ok: true });
  });
