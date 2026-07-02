import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

const ASSIGNABLE_ROLES = new Set<Role>([
  Role.DIOCESE_STAFF,
  Role.DIOCESE_REPORT_VIEWER,
  Role.PARISH_ADMIN,
]);

function validateRole(value: string | undefined): Role {
  if (!value) throw new ApiError(400, 'role is required');
  const role = value.toUpperCase() as Role;
  if (!ASSIGNABLE_ROLES.has(role)) {
    throw new ApiError(400, 'Unsupported role assignment');
  }
  return role;
}

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.GLOBAL_ADMIN, Role.DIOCESE_ADMIN]);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | {
          displayName?: string;
          role?: string;
          parishId?: string | null;
          isActive?: boolean;
        }
      | null;

    const existing = await prisma.appUser.findUnique({ where: { id } });
    if (!existing || existing.dioceseId !== actor.dioceseId) {
      throw new ApiError(404, 'User not found');
    }

    const role = validateRole(body?.role);
    const displayName = body?.displayName?.trim();
    const isActive = body?.isActive;
    const parishId = role === Role.PARISH_ADMIN ? body?.parishId ?? null : null;

    if (!displayName || isActive === undefined) {
      throw new ApiError(400, 'displayName, role, and isActive are required');
    }

    if (role === Role.PARISH_ADMIN) {
      if (!parishId) {
        throw new ApiError(400, 'parishId is required for Parish Admin');
      }
      const parish = await prisma.parish.findFirst({
        where: { id: parishId, dioceseId: actor.dioceseId },
        select: { id: true },
      });
      if (!parish) throw new ApiError(404, 'Parish not found');
    }

    const user = await prisma.appUser.update({
      where: { id },
      data: {
        displayName,
        role,
        parishId,
        isActive,
      },
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'access.role.assign',
      entityType: 'app_user',
      entityId: user.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: parishId ?? null,
      metadata: {
        before: {
          role: existing.role,
          parishId: existing.parishId,
          isActive: existing.isActive,
        },
        after: {
          role: user.role,
          parishId: user.parishId,
          isActive: user.isActive,
        },
      },
    });

    return Response.json({ ok: true, user });
  });