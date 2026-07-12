import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

const opt = (v: unknown) =>
  typeof v === 'string' ? v.trim() || null : undefined;

export const PATCH = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if ('email' in body) data.email = opt(body.email);
    if ('phone' in body) data.phone = opt(body.phone);
    if ('address' in body) data.address = opt(body.address);
    if ('taxId' in body) data.taxId = opt(body.taxId);
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

    const vendor = await withTenant(claims, async (tx) => {
      const existing = await tx.vendor.findUnique({ where: { id } });
      if (!existing) throw new ApiError(404, 'Vendor not found');
      return tx.vendor.update({ where: { id }, data });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.vendor.update',
      entityType: 'finance_vendor',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: vendor.dioceseId,
      parishId: vendor.parishId,
      metadata: { name: vendor.name },
    });

    return Response.json({ ok: true, vendor });
  });
