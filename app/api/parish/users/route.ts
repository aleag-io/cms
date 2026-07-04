import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

const PARISH_ASSIGNABLE_ROLES: Role[] = [
  Role.PARISH_STAFF,
  Role.PARISH_DATA_SHARING_MANAGER,
  Role.MINISTRY_LEADER,
  Role.ORGANIZATION_LEADER,
  Role.PASTORAL_DATA_ACCESSOR,
  Role.MEMBER,
];

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([Role.PARISH_ADMIN]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const users = await withTenant(claims, (tx) =>
      tx.appUser.findMany({
        where: { parishId, role: { in: PARISH_ASSIGNABLE_ROLES } },
        orderBy: { createdAt: 'desc' },
      }),
    );

    return Response.json({ ok: true, users });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      email?: string;
      displayName?: string;
      role?: Role;
    };

    const email = body.email?.trim();
    const displayName = body.displayName?.trim();
    if (!email || !displayName || !body.role) {
      throw new ApiError(400, 'email, displayName, and role are required');
    }
    if (!PARISH_ASSIGNABLE_ROLES.includes(body.role)) {
      throw new ApiError(400, 'Role cannot be assigned at parish scope');
    }

    const admin = createSupabaseAdminClient();
    const password = `Temp${randomUUID().slice(0, 8)}!`;
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      if (/already|exists|registered/i.test(authError.message)) {
        throw new ApiError(409, 'A user with this email already exists');
      }
      throw new ApiError(500, authError.message);
    }

    const user = await withTenant(claims, (tx) =>
      tx.appUser.create({
        data: {
          id: authData.user!.id,
          email,
          displayName,
          role: body.role!,
          dioceseId: actor.dioceseId,
          parishId,
          isActive: true,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'access.role.assign',
      entityType: 'app_user',
      entityId: user.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        after: { role: user.role, parishId, isActive: true },
        tempPassword: true,
      },
    });

    return Response.json({
      ok: true,
      user: { ...user, tempPassword: password },
    });
  });
