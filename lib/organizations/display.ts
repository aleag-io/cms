/**
 * Client-safe display helpers for organization type / membership mode.
 * Avoid importing @prisma/client so these can ship in the browser bundle.
 */

export type OrganizationTypeValue =
  | 'PRAYER_GROUP'
  | 'COMMITTEE'
  | 'AUXILIARY'
  | 'MINISTRY'
  | 'OTHER';

export type MembershipModeValue = 'OPEN' | 'EXCLUSIVE';

/** Human-readable organization type labels for UI. */
export function organizationTypeLabel(
  type: OrganizationTypeValue | string,
): string {
  switch (type) {
    case 'PRAYER_GROUP':
      return 'Prayer group';
    case 'COMMITTEE':
      return 'Committee';
    case 'AUXILIARY':
      return 'Auxiliary';
    case 'MINISTRY':
      return 'Ministry';
    default:
      return 'Other';
  }
}

/** Default membership mode for a type (PA-15/PA-16). */
export function defaultMembershipModeForType(
  type: OrganizationTypeValue | string,
): MembershipModeValue {
  return type === 'PRAYER_GROUP' ? 'EXCLUSIVE' : 'OPEN';
}

/** Membership mode label including whether it is the type default (PA-15). */
export function membershipModeDisplay(
  type: OrganizationTypeValue | string,
  mode: MembershipModeValue | string,
): { label: string; isDefault: boolean } {
  const isDefault = mode === defaultMembershipModeForType(type);
  return {
    label: mode === 'EXCLUSIVE' ? 'Exclusive' : 'Open',
    isDefault,
  };
}
