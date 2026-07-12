import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { optionalUuid } from '@/lib/finance/validate';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

const opt = (v: unknown) => (typeof v === 'string' ? v.trim() || null : undefined);

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
    if ('notes' in body) data.notes = opt(body.notes);
    if ('linkedFamilyId' in body) data.linkedFamilyId = optionalUuid('linkedFamilyId', body.linkedFamilyId);
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

    const donor = await withTenant(claims, async (tx) => {
      const existing = await tx.externalDonor.findUnique({ where: { id } });
      if (!existing) throw new ApiError(404, 'Donor not found');
      return tx.externalDonor.update({ where: { id }, data });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.externaldonor.update',
      entityType: 'finance_external_donor',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: donor.dioceseId,
      parishId: donor.parishId,
      metadata: { name: donor.name },
    });

    return Response.json({ ok: true, donor });
  });
