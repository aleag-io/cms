import { DEFAULT_PERMISSIONS } from '@/lib/permissions/defaults';
import type {
  PermissionAction,
  PermissionOverride,
  PermissionResource,
} from '@/lib/permissions/types';

export function can(
  roles: string[],
  resource: PermissionResource,
  action: PermissionAction,
  overrides: PermissionOverride[] = [],
): boolean {
  const normalizedRoles = roles.map((r) => r.toLowerCase());

  const baseAllowed = normalizedRoles.some((role) =>
    DEFAULT_PERMISSIONS[role]?.[resource]?.has(action),
  );

  const relevant = overrides.filter(
    (o) =>
      normalizedRoles.includes(o.role.toLowerCase()) &&
      o.resource === resource &&
      o.action === action,
  );

  if (relevant.some((o) => o.isAllowed === false)) {
    return false;
  }
  if (relevant.some((o) => o.isAllowed === true)) {
    return true;
  }

  return baseAllowed;
}

export function assertCanGrant(
  actorRoles: string[],
  override: PermissionOverride,
  existingOverrides: PermissionOverride[] = [],
): void {
  if (!override.isAllowed) {
    return;
  }

  const allowed = can(
    actorRoles,
    override.resource,
    override.action,
    existingOverrides,
  );

  if (!allowed) {
    throw new Error('Cannot grant a permission the actor does not hold');
  }
}
