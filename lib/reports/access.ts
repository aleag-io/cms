import type { Prisma } from '@prisma/client';
import type { SessionClaims } from '@/lib/auth';
import { can } from '@/lib/permissions/resolver';
import { mapOverrides } from '@/lib/sacramental/access';
import type { PermissionAction } from '@/lib/permissions/types';

/// Parish permission overrides governing report read/export for this actor.
export async function loadReportOverrides(
  tx: Prisma.TransactionClient,
  parishId: string | null,
) {
  if (!parishId) return [];
  const rows = await tx.parishPermissionOverride.findMany({
    where: { parishId, resource: 'REPORT' },
  });
  return mapOverrides(rows);
}

export function canRunReport(
  claims: SessionClaims,
  action: PermissionAction,
  overrides: ReturnType<typeof mapOverrides> = [],
): boolean {
  return can(claims.app_metadata.roles, 'report', action, overrides);
}
