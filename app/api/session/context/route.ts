import { randomUUID } from 'node:crypto';
import { AuditOutcome } from '@prisma/client';
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
  memberWorkingParishChoices,
  resolveMemberWorkingParish,
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

    const dioceseScoped = isDioceseScopedRole(raw.role);
    const working = await resolveWorkingParish(raw);

    const homeParish =
      raw.parishId && !dioceseScoped
        ? await prisma.parish.findFirst({
            where: { id: raw.parishId },
            select: { id: true, name: true },
          })
        : null;

    // Multi-parish members (MM-17) may switch working parish between their
    // own MemberParish memberships; diocese-scoped roles may enter any parish
    // in their diocese (list loaded client-side from /api/parishes).
    let switchableParishes: { id: string; name: string; isPrimary: boolean }[] = [];
    if (!dioceseScoped) {
      const member = await prisma.member.findFirst({
        where: { userId: raw.id },
        select: { id: true },
      });
      if (member) {
        switchableParishes = await memberWorkingParishChoices(member.id);
      }
    }

    const portal = dioceseScoped && !working ? 'diocese' : 'parish';

    return Response.json({
      ok: true,
      portal,
      workingParish: working,
      homeParish,
      canSwitchParish: dioceseScoped || switchableParishes.length > 1,
      switchableParishes,
    });
  });

/** Enter parish work-context — diocese-scoped roles (any parish in their
 *  diocese) or members (only their own MemberParish memberships, MM-17). */
export const PUT = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const raw = await getSessionUser();
    if (!raw) throw new ApiError(401, 'Unauthorized');

    const body = (await request.json()) as { parishId?: string };
    if (!body.parishId) throw new ApiError(400, 'parishId is required');

    let parish: { id: string; name: string } | null;
    if (isDioceseScopedRole(raw.role)) {
      parish = await prisma.parish.findFirst({
        where: {
          id: body.parishId,
          dioceseId: raw.dioceseId,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      if (!parish) {
        throw new ApiError(404, 'Parish not found in your diocese');
      }
    } else {
      // Parish-home roles: only their own active memberships are valid.
      parish = await resolveMemberWorkingParish(raw, body.parishId);
      if (!parish) {
        throw new ApiError(403, 'You are not a member of that parish');
      }
    }

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

/** Exit parish work-context → home portal (diocese portal for diocese roles,
 *  home parish for members). */
export const DELETE = () =>
  handle(async () => {
    const requestId = randomUUID();
    const raw = await getSessionUser();
    if (!raw) throw new ApiError(401, 'Unauthorized');

    const previous = await resolveWorkingParish(raw);

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
