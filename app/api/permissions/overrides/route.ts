import { randomUUID } from 'node:crypto';
import {
  AuditOutcome,
  PermissionAction,
  PermissionResource,
  Role,
} from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { assertCanGrant } from '@/lib/permissions/resolver';
import type { PermissionOverride } from '@/lib/permissions/types';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

function toPermissionResource(resource: PermissionResource) {
  return resource.toLowerCase() as PermissionOverride['resource'];
}

function toPermissionAction(action: PermissionAction) {
  return action.toLowerCase() as PermissionOverride['action'];
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([Role.PARISH_ADMIN]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const overrides = await withTenant(claims, (tx) =>
      tx.parishPermissionOverride.findMany({
        where: { parishId },
        orderBy: [{ role: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
      }),
    );

    return Response.json({ ok: true, overrides });
  });

export const PUT = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      role?: Role;
      resource?: PermissionResource;
      action?: PermissionAction;
      isAllowed?: boolean;
    };

    if (!body.role || !body.resource || !body.action || body.isAllowed === undefined) {
      throw new ApiError(400, 'role, resource, action, and isAllowed are required');
    }

    const currentOverrides = await withTenant(claims, (tx) =>
      tx.parishPermissionOverride.findMany({ where: { parishId } }),
    );

    const mappedOverrides: PermissionOverride[] = currentOverrides.map((row) => ({
      role: row.role.toLowerCase(),
      resource: toPermissionResource(row.resource),
      action: toPermissionAction(row.action),
      isAllowed: row.isAllowed,
    }));

    try {
      assertCanGrant(
        claims.app_metadata.roles,
        {
          role: body.role.toLowerCase(),
          resource: toPermissionResource(body.resource),
          action: toPermissionAction(body.action),
          isAllowed: body.isAllowed,
        },
        mappedOverrides,
      );
    } catch (err) {
      throw new ApiError(403, err instanceof Error ? err.message : 'Forbidden');
    }

    const before = currentOverrides.find(
      (row) =>
        row.role === body.role &&
        row.resource === body.resource &&
        row.action === body.action,
    );

    const override = await withTenant(claims, (tx) =>
      tx.parishPermissionOverride.upsert({
        where: {
          parishId_role_resource_action: {
            parishId,
            role: body.role!,
            resource: body.resource!,
            action: body.action!,
          },
        },
        update: {
          isAllowed: body.isAllowed!,
          grantedByUserId: actor.id,
        },
        create: {
          parishId,
          role: body.role!,
          resource: body.resource!,
          action: body.action!,
          isAllowed: body.isAllowed!,
          grantedByUserId: actor.id,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'access.permission.override',
      entityType: 'parish_permission_override',
      entityId: override.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        before,
        after: override,
      },
    });

    return Response.json({ ok: true, override });
  });
