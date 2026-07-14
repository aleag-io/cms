import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { parseGivingCategory } from '@/lib/finance/validate';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    let ledger = parseOwnerQuery(url.searchParams.get('owner'), claims);
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }
    const categories = await withTenant(claims, (tx) =>
      tx.givingCategory.findMany({
        where: { ownerType: ledger.ownerType, ownerId: ledger.ownerId },
        include: {
          fund: { select: { name: true } },
          incomeAccount: { select: { code: true, name: true } },
        },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        take: 500,
      }),
    );
    return Response.json({ ok: true, ledger, categories });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    let ledger = parseOwnerQuery(
      typeof body.owner === 'string' ? body.owner : null,
      claims,
    );
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }
    const input = parseGivingCategory(body);

    const category = await withTenant(claims, async (tx) => {
      const account = await tx.account.findUnique({ where: { id: input.incomeAccountId } });
      if (!account || account.ownerType !== ledger.ownerType || account.ownerId !== ledger.ownerId) {
        throw new ApiError(400, 'income account is not on this ledger');
      }
      if (account.type !== 'INCOME') {
        throw new ApiError(400, 'category must map to an INCOME account');
      }
      return tx.givingCategory.create({
        data: {
          dioceseId: ledger.dioceseId,
          parishId: ledger.parishId,
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          ...input,
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.givingcategory.create',
      entityType: 'finance_giving_category',
      entityId: category.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: { name: category.name, section: category.section },
    });

    return Response.json({ ok: true, category }, { status: 201 });
  });
