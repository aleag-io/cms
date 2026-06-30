import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
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
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const facilities = await withTenant(claims, (tx) =>
      tx.facility.findMany({
        where: { parishId },
        orderBy: { name: 'asc' },
      }),
    );

    return Response.json({ ok: true, facilities });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      name?: string;
      capacity?: number | null;
      location?: string | null;
    };
    if (!body.name?.trim()) throw new ApiError(400, 'name is required');

    const facility = await withTenant(claims, (tx) =>
      tx.facility.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          name: body.name!.trim(),
          capacity: body.capacity ?? null,
          location: body.location?.trim() || null,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.facility.create',
      entityType: 'facility',
      entityId: facility.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { name: facility.name },
    });

    return Response.json({ ok: true, facility });
  });
