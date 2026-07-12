import { Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { centsToJson } from '@/lib/finance/money';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    const runId = url.searchParams.get('runId');
    let ledger = parseOwnerQuery(url.searchParams.get('owner'), claims);
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }

    if (runId) {
      const lines = await withTenant(claims, (tx) =>
        tx.bankStatementLine.findMany({
          where: { reconciliationRunId: runId },
          orderBy: { postedDate: 'asc' },
        }),
      );
      return Response.json({
        ok: true,
        lines: lines.map((l) => ({ ...l, amountCents: centsToJson(l.amountCents) })),
      });
    }

    const runs = await withTenant(claims, (tx) =>
      tx.reconciliationRun.findMany({
        where: { ownerType: ledger.ownerType, ownerId: ledger.ownerId },
        orderBy: { importedAt: 'desc' },
        take: 100,
      }),
    );
    return Response.json({ ok: true, ledger, runs });
  });
