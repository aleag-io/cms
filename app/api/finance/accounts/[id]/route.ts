import { randomUUID } from 'node:crypto';
import { AccountType, AuditOutcome, Role } from '@prisma/client';
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
  Role.ORGANIZATION_LEADER,
] as const;

const ACCOUNT_TYPES = new Set<AccountType>([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE',
]);

/** Edit an existing account (name/type/fund/active + code). RLS gates writes. */
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

    const data: {
      code?: string;
      name?: string;
      type?: AccountType;
      fundId?: string | null;
      isActive?: boolean;
    } = {};
    if (typeof body.code === 'string') {
      const code = body.code.trim();
      if (!/^[A-Za-z0-9.\-]{1,32}$/.test(code)) {
        throw new ApiError(400, 'code must be 1–32 alphanumeric characters');
      }
      data.code = code;
    }
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body.type === 'string') {
      if (!ACCOUNT_TYPES.has(body.type as AccountType)) {
        throw new ApiError(400, 'type must be ASSET|LIABILITY|EQUITY|INCOME|EXPENSE');
      }
      data.type = body.type as AccountType;
    }
    if ('fundId' in body) data.fundId = optionalUuid('fundId', body.fundId);
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

    const account = await withTenant(claims, async (tx) => {
      const existing = await tx.account.findUnique({ where: { id } });
      if (!existing) throw new ApiError(404, 'Account not found');
      return tx.account.update({ where: { id }, data });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.account.update',
      entityType: 'finance_account',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: account.dioceseId,
      parishId: account.parishId,
      metadata: { code: account.code },
    });

    return Response.json({ ok: true, account });
  });
