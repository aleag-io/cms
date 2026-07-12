import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { parseFundCreate } from '@/lib/finance/validate';
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

    const funds = await withTenant(claims, (tx) =>
      tx.fund.findMany({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          ...(url.searchParams.get('includeInactive') === '1'
            ? {}
            : { isActive: true }),
        },
        orderBy: { name: 'asc' },
      }),
    );

    return Response.json({ ok: true, ledger, funds });
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
    const input = parseFundCreate(body);

    const row = await withTenant(claims, (tx) =>
      tx.fund.create({
        data: {
          dioceseId: ledger.dioceseId,
          parishId: ledger.parishId,
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          name: input.name,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.fund.create',
      entityType: 'finance_fund',
      entityId: row.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: { fundId: row.id, name: row.name, ownerType: ledger.ownerType },
    });

    return Response.json({ ok: true, fund: row }, { status: 201 });
  });
