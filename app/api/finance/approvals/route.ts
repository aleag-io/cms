import { Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { centsToJson } from '@/lib/finance/money';

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
    const status = url.searchParams.get('status');

    const requests = await withTenant(claims, (tx) =>
      tx.approvalRequest.findMany({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          ...(status
            ? {
                status: status as
                  | 'PENDING'
                  | 'APPROVED'
                  | 'REJECTED'
                  | 'AUTO_APPROVED',
              }
            : {}),
        },
        include: { decisions: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );

    return Response.json({
      ok: true,
      ledger,
      requests: requests.map((r) => ({
        ...r,
        amountCents: centsToJson(r.amountCents),
      })),
    });
  });
