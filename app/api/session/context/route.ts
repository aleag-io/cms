import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { cookies } from 'next/headers';
import { handle, ApiError } from '@/lib/api';
import { writeAuditEntry } from '@/lib/audit';
import {
  getSessionUser,
  withWorkingParishApplied,
} from '@/lib/auth';
import {
  WORKING_PARISH_COOKIE,
  isDioceseScopedRole,
  resolveWorkingParish,
} from '@/lib/context/working-parish';
import { prisma } from '@/lib/prisma';

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export const GET = () =>
  handle(async () => {
    const raw = await getSessionUser();
    if (!raw) throw new ApiError(401, 'Unauthorized');

    const working = isDioceseScopedRole(raw.role)
      ? await resolveWorkingParish(raw)
      : null;

    const homeParish =
      raw.parishId && !isDioceseScopedRole(raw.role)
        ? await prisma.parish.findFirst({
            where: { id: raw.parishId },
            select: { id: true, name: true },
          })
        : null;

    const portal =
      isDioceseScopedRole(raw.role) && !working ? 'diocese' : 'parish';

    return Response.json({
      ok: true,
      portal,
      workingParish: working,
      homeParish,
      canSwitchParish: isDioceseScopedRole(raw.role),
    });
  });

/** Enter parish work-context (diocese-scoped roles only). */
export const PUT = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const raw = await getSessionUser();
    if (!raw) throw new ApiError(401, 'Unauthorized');

    if (!isDioceseScopedRole(raw.role)) {
      throw new ApiError(
        403,
        'Only diocese-scoped roles can enter parish work-context',
      );
    }

    const body = (await request.json()) as { parishId?: string };
    if (!body.parishId) throw new ApiError(400, 'parishId is required');

    const parish = await prisma.parish.findFirst({
      where: {
        id: body.parishId,
        dioceseId: raw.dioceseId,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    if (!parish) throw new ApiError(404, 'Parish not found in your diocese');

    const store = await cookies();
    store.set(WORKING_PARISH_COOKIE, parish.id, cookieOptions(60 * 60 * 24 * 7));

    await writeAuditEntry({
      requestId,
      actorUserId: raw.id,
      actorLabel: raw.email,
      action: 'context.parish.enter',
      entityType: 'parish',
      entityId: parish.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: raw.dioceseId,
      parishId: parish.id,
      metadata: { parishName: parish.name, role: raw.role },
    });

    // Verify scope applies for the response
    const scoped = await withWorkingParishApplied(raw);

    return Response.json({
      ok: true,
      portal: 'parish',
      workingParish: parish,
      parishId: scoped.parishId,
    });
  });

/** Exit parish work-context → diocese portal. */
export const DELETE = () =>
  handle(async () => {
    const requestId = randomUUID();
    const raw = await getSessionUser();
    if (!raw) throw new ApiError(401, 'Unauthorized');

    const previous = isDioceseScopedRole(raw.role)
      ? await resolveWorkingParish(raw)
      : null;

    const store = await cookies();
    store.set(WORKING_PARISH_COOKIE, '', cookieOptions(0));

    if (previous) {
      await writeAuditEntry({
        requestId,
        actorUserId: raw.id,
        actorLabel: raw.email,
        action: 'context.parish.exit',
        entityType: 'parish',
        entityId: previous.id,
        outcome: AuditOutcome.SUCCESS,
        dioceseId: raw.dioceseId,
        parishId: previous.id,
        metadata: { parishName: previous.name, role: raw.role },
      });
    }

    return Response.json({
      ok: true,
      portal: isDioceseScopedRole(raw.role) ? 'diocese' : 'parish',
      workingParish: null,
    });
  });
