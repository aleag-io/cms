import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { parseAccountCreate } from '@/lib/finance/validate';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';

const FINANCE_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...FINANCE_ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    let ledger = parseOwnerQuery(url.searchParams.get('owner'), claims);
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }

    const accounts = await withTenant(claims, (tx) =>
      tx.account.findMany({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          ...(url.searchParams.get('includeInactive') === '1'
            ? {}
            : { isActive: true }),
        },
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
        include: { fund: { select: { id: true, name: true } } },
      }),
    );

    return Response.json({
      ok: true,
      ledger,
      accounts: accounts.map((a) => ({
        ...a,
        // BigInt not present on Account
      })),
    });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...FINANCE_ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    let ledger = parseOwnerQuery(
      typeof body.owner === 'string' ? body.owner : null,
      claims,
    );
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }
    const input = parseAccountCreate(body);

    const row = await withTenant(claims, (tx) =>
      tx.account.create({
        data: {
          dioceseId: ledger.dioceseId,
          parishId: ledger.parishId,
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          code: input.code,
          name: input.name,
          type: input.type,
          fundId: input.fundId,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.account.create',
      entityType: 'finance_account',
      entityId: row.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: { accountId: row.id, code: row.code, ownerType: ledger.ownerType },
    });

    return Response.json({ ok: true, account: row }, { status: 201 });
  });
