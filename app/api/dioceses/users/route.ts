import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
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

async function assertParishScope(dioceseId: string, parishId: string | null) {
  if (!parishId) return null;
  const parish = await prisma.parish.findFirst({
    where: { id: parishId, dioceseId },
    select: { id: true, name: true },
  });
  if (!parish) throw new ApiError(404, 'Parish not found');
  return parish;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([Role.GLOBAL_ADMIN, Role.DIOCESE_ADMIN]);
    const claims = await claimsFromUser(actor);

    const users = await withTenant(claims, (tx) =>
      tx.appUser.findMany({
        where: { dioceseId: actor.dioceseId },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          parishId: true,
          isActive: true,
          createdAt: true,
          parish: { select: { name: true } },
        },
        orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
      }),
    );

    return Response.json({ ok: true, users });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.GLOBAL_ADMIN, Role.DIOCESE_ADMIN]);
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      displayName?: string;
      role?: string;
      parishId?: string | null;
      isActive?: boolean;
    } | null;

    const email = body?.email?.trim().toLowerCase();
    const displayName = body?.displayName?.trim();
    const role = validateRole(body?.role);
    const parishId =
      role === Role.PARISH_ADMIN ? (body?.parishId ?? null) : null;
    const isActive = body?.isActive ?? true;

    if (!email || !displayName) {
      throw new ApiError(400, 'email and displayName are required');
    }
    if (role === Role.PARISH_ADMIN && !parishId) {
      throw new ApiError(400, 'parishId is required for Parish Admin');
    }

    await assertParishScope(actor.dioceseId, parishId);

    const existing = await prisma.appUser.findUnique({ where: { email } });
    if (existing && existing.dioceseId !== actor.dioceseId) {
      throw new ApiError(409, 'User already belongs to another diocese');
    }

    const user = await prisma.appUser.upsert({
      where: { email },
      update: {
        displayName,
        role,
        parishId,
        dioceseId: actor.dioceseId,
        isActive,
      },
      create: {
        email,
        displayName,
        role,
        parishId,
        dioceseId: actor.dioceseId,
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
        before: existing
          ? {
              role: existing.role,
              parishId: existing.parishId,
              isActive: existing.isActive,
            }
          : null,
        after: {
          role: user.role,
          parishId: user.parishId,
          isActive: user.isActive,
        },
      },
    });

    return Response.json({ ok: true, user });
  });
