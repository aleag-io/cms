import { Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { computeFinancePicture } from '@/lib/finance/dashboard';
import type { ReportBasis } from '@/lib/finance/reporting';

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
    let ledger = parseOwnerQuery(url.searchParams.get('owner'), claims);
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }
    const basis: ReportBasis =
      url.searchParams.get('basis') === 'cash' ? 'cash' : 'accrual';
    const fiscalYearRaw = url.searchParams.get('fiscalYear');
    const fiscalYear = fiscalYearRaw ? Number(fiscalYearRaw) : undefined;

    const picture = await withTenant(claims, (tx) =>
      computeFinancePicture(
        tx,
        { ownerType: ledger.ownerType, ownerId: ledger.ownerId },
        {
          basis,
          fiscalYear:
            fiscalYear && Number.isFinite(fiscalYear) ? fiscalYear : undefined,
          givingParishId: ledger.parishId,
        },
      ),
    );

    return Response.json({
      ok: true,
      ledger: {
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        parishId: ledger.parishId,
      },
      picture,
    });
  });
