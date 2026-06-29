import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { requireRole, claimsFromUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = claimsFromUser(actor);
    const { id } = await context.params;

    const family = await withTenant(claims, async (tx) => {
      const f = await tx.family.findFirst({
        where: { id, parishId },
        include: { members: { orderBy: { memberIdentifier: 'asc' } } },
      });
      if (!f) throw new ApiError(404, 'Family not found');
      return f;
    });

    return Response.json({ ok: true, family });
  });

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = claimsFromUser(actor);
    const { id } = await context.params;

    const body = (await request.json()) as {
      familyName?: string;
      primaryContactEmail?: string | null;
      primaryContactPhone?: string | null;
      address?: string | null;
    };

    const family = await withTenant(claims, async (tx) => {
      const existing = await tx.family.findFirst({ where: { id, parishId } });
      if (!existing) throw new ApiError(404, 'Family not found');

      return tx.family.update({
        where: { id },
        data: {
          ...(body.familyName && { familyName: body.familyName.trim() }),
          ...(body.primaryContactEmail !== undefined && {
            primaryContactEmail: body.primaryContactEmail?.trim() || null,
          }),
          ...(body.primaryContactPhone !== undefined && {
            primaryContactPhone: body.primaryContactPhone?.trim() || null,
          }),
          ...(body.address !== undefined && {
            address: body.address?.trim() || null,
          }),
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.family.update',
      entityType: 'family',
      entityId: family.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { changes: Object.keys(body) },
    });

    return Response.json({ ok: true, family });
  });

// Deactivate a family (soft-delete: sets isActive=false).
export const DELETE = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.DIOCESE_ADMIN, Role.PARISH_ADMIN]);
    const parishId = requireParishId(actor.parishId);
    const claims = claimsFromUser(actor);
    const { id } = await context.params;

    const family = await withTenant(claims, async (tx) => {
      const existing = await tx.family.findFirst({ where: { id, parishId } });
      if (!existing) throw new ApiError(404, 'Family not found');
      if (!existing.isActive) throw new ApiError(409, 'Family is already inactive');
      return tx.family.update({ where: { id }, data: { isActive: false } });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.family.deactivate',
      entityType: 'family',
      entityId: family.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
    });

    return Response.json({ ok: true, family });
  });
