import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { optionalUuid, requireUuid } from '@/lib/finance/validate';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

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
    if (typeof body.section === 'string' && body.section.trim()) data.section = body.section.trim();
    if (typeof body.sortOrder === 'number' && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
    if ('fundId' in body) data.fundId = optionalUuid('fundId', body.fundId);
    if ('incomeAccountId' in body && body.incomeAccountId) data.incomeAccountId = requireUuid('incomeAccountId', body.incomeAccountId);
    if (typeof body.isTaxDeductible === 'boolean') data.isTaxDeductible = body.isTaxDeductible;
    if (typeof body.countsToStatement === 'boolean') data.countsToStatement = body.countsToStatement;
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

    const category = await withTenant(claims, async (tx) => {
      const existing = await tx.givingCategory.findUnique({ where: { id } });
      if (!existing) throw new ApiError(404, 'Category not found');
      if (data.incomeAccountId) {
        const account = await tx.account.findUnique({ where: { id: data.incomeAccountId as string } });
        if (!account || account.ownerType !== existing.ownerType || account.ownerId !== existing.ownerId || account.type !== 'INCOME') {
          throw new ApiError(400, 'income account must be an INCOME account on this ledger');
        }
      }
      return tx.givingCategory.update({ where: { id }, data });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.givingcategory.update',
      entityType: 'finance_giving_category',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: category.dioceseId,
      parishId: category.parishId,
      metadata: { name: category.name },
    });

    return Response.json({ ok: true, category });
  });
