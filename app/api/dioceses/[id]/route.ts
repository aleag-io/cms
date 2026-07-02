import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { prisma } from '@/lib/prisma';
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
      Role.DIOCESE_STAFF,
    ]);
    const claims = await claimsFromUser(actor);
    const { id } = await context.params;

    if (actor.dioceseId !== id) {
      throw new ApiError(403, 'Forbidden');
    }

    const diocese = await withTenant(claims, async (tx) => {
      const row = await tx.diocese.findFirst({
        where: { id: actor.dioceseId },
      });
      if (!row) throw new ApiError(404, 'Diocese not found');
      return row;
    });

    return Response.json({ ok: true, diocese });
  });

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.GLOBAL_ADMIN, Role.DIOCESE_ADMIN]);
    const { id } = await context.params;

    if (actor.dioceseId !== id) {
      throw new ApiError(403, 'Forbidden');
    }

    const body = (await request.json().catch(() => null)) as
      | { name?: string }
      | null;

    const name = body?.name?.trim();
    if (!name) {
      throw new ApiError(400, 'name is required');
    }

    const before = await prisma.diocese.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, 'Diocese not found');

    const diocese = await prisma.diocese.update({
      where: { id },
      data: { name },
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'tenant.diocese.update',
      entityType: 'diocese',
      entityId: diocese.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: diocese.id,
      metadata: {
        before: { name: before.name },
        after: { name: diocese.name },
      },
    });

    return Response.json({ ok: true, diocese });
  });