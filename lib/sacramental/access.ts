import type { SessionClaims } from '@/lib/auth';
import { can } from '@/lib/permissions/resolver';
import type {
  PermissionAction,
  PermissionOverride,
  PermissionResource,
} from '@/lib/permissions/types';
import type { ParishPermissionOverride } from '@prisma/client';

export function mapOverrides(
  rows: ParishPermissionOverride[],
): PermissionOverride[] {
  return rows.map((row) => ({
    role: row.role.toLowerCase(),
    resource: row.resource.toLowerCase() as PermissionResource,
    action: row.action.toLowerCase() as PermissionAction,
    isAllowed: row.isAllowed,
  }));
}

export function canAccessSacramental(
  claims: SessionClaims,
  action: PermissionAction,
  overrides: PermissionOverride[] = [],
): boolean {
  return can(
    claims.app_metadata.roles,
    'member_sacramental_record',
    action,
    overrides,
  );
}

/** Privileged or own-member read for a specific subject member. */
export function canReadMemberSacramental(
  claims: SessionClaims,
  memberId: string,
  overrides: PermissionOverride[] = [],
): boolean {
  if (canAccessSacramental(claims, 'read', overrides)) return true;
  return claims.app_metadata.member_id === memberId;
}
