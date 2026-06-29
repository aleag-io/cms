import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { requireRole, claimsFromUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

export const GET = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const actor = await requireRole([
      Role.GLOBAL_ADMIN,
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
    ]);
    const claims = await claimsFromUser(actor);
    const { id } = await context.params;

    // Parish-scoped users can only read their own parish.
    if (actor.parishId && actor.parishId !== id) {
      throw new ApiError(403, 'Forbidden');
    }

    const parish = await withTenant(claims, async (tx) => {
      const p = await tx.parish.findFirst({
        where: { id, dioceseId: actor.dioceseId },
      });
      if (!p) throw new ApiError(404, 'Parish not found');
      return p;
    });

    return Response.json({ ok: true, parish });
  });

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([
      Role.GLOBAL_ADMIN,
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
    ]);
    const claims = await claimsFromUser(actor);
    const { id } = await context.params;

    // Parish Admins can only update their own parish.
    if (actor.role === Role.PARISH_ADMIN && actor.parishId !== id) {
      throw new ApiError(403, 'Forbidden');
    }

    const body = (await request.json()) as {
      name?: string;
      address?: string | null;
      isActive?: boolean;
      familyNumberPrefix?: string;
      familyNumberWidth?: number;
      familyNumberStart?: number;
    };

    const parish = await withTenant(claims, async (tx) => {
      const existing = await tx.parish.findFirst({
        where: { id, dioceseId: actor.dioceseId },
      });
      if (!existing) throw new ApiError(404, 'Parish not found');

      return tx.parish.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name.trim() }),
          ...(body.address !== undefined && {
            address: body.address?.trim() || null,
          }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.familyNumberPrefix !== undefined && {
            familyNumberPrefix: body.familyNumberPrefix,
          }),
          ...(body.familyNumberWidth !== undefined && {
            familyNumberWidth: body.familyNumberWidth,
          }),
          ...(body.familyNumberStart !== undefined && {
            familyNumberStart: body.familyNumberStart,
          }),
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'tenant.parish.update',
      entityType: 'parish',
      entityId: parish.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      metadata: { changes: Object.keys(body) },
    });

    return Response.json({ ok: true, parish });
  });
