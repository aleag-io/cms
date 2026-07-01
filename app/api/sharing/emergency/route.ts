import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.DIOCESE_STAFF,
      Role.PARISH_ADMIN,
      Role.PARISH_DATA_SHARING_MANAGER,
    ]);
    const claims = await claimsFromUser(actor);

    const grants = await withTenant(claims, (tx) =>
      tx.emergencyAccessGrant.findMany({
        where: actor.parishId
          ? { parishId: actor.parishId }
          : { dioceseId: actor.dioceseId },
        orderBy: [{ grantedAt: 'desc' }],
      }),
    );

    return Response.json({ ok: true, grants });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.DIOCESE_ADMIN]);
    const claims = await claimsFromUser(actor);

    const body = (await request.json().catch(() => null)) as
      | { parishId?: string; justification?: string; durationDays?: number }
      | null;

    if (!body?.parishId || !body.justification?.trim()) {
      throw new ApiError(400, 'parishId and justification are required');
    }

    const parish = await prisma.parish.findFirst({
      where: { id: body.parishId, dioceseId: actor.dioceseId },
      select: { id: true },
    });
    if (!parish) throw new ApiError(404, 'Parish not found');

    const rawDuration = Number(body.durationDays ?? 7);
    if (!Number.isFinite(rawDuration)) {
      throw new ApiError(400, 'durationDays must be a number');
    }
    // Forced ≤7-day ceiling (plan §2.4 / §8).
    const durationDays = Math.max(1, Math.min(Math.floor(rawDuration), 7));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    const grant = await withTenant(claims, (tx) =>
      tx.emergencyAccessGrant.create({
        data: {
          parishId: body.parishId!,
          dioceseId: actor.dioceseId,
          grantedByUserId: actor.id,
          justification: body.justification!.trim(),
          expiresAt,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'sharing.emergency.create',
      entityType: 'emergency_access_grant',
      entityId: grant.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: grant.parishId,
      metadata: { durationDays },
    });

    return Response.json({ ok: true, grant });
  });
