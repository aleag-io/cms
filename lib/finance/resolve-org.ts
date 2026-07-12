import { ApiError } from '@/lib/api';
import type { SessionClaims } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import type { LedgerRef } from '@/lib/finance/ledger-scope';

/** Load Organization and set ledger.parishId for diocese vs parish orgs. */
export async function resolveOrgLedgerParishId(
  claims: SessionClaims,
  ledger: LedgerRef,
): Promise<LedgerRef> {
  if (ledger.ownerType !== 'ORGANIZATION') return ledger;

  const org = await withTenant(claims, (tx) =>
    tx.organization.findUnique({
      where: { id: ledger.ownerId },
      select: { id: true, dioceseId: true, parishId: true, hasOwnLedger: true },
    }),
  );
  if (!org) throw new ApiError(404, 'Organization not found');
  if (org.dioceseId !== ledger.dioceseId) {
    throw new ApiError(403, 'Organization is outside your diocese');
  }
  if (!org.hasOwnLedger) {
    throw new ApiError(400, 'Organization does not have its own ledger enabled');
  }
  return {
    ...ledger,
    parishId: org.parishId,
  };
}
