import { MembershipMode, OrganizationType } from '@prisma/client';

/**
 * Default membership mode for an organization type (PA-16).
 *
 * Prayer groups are exclusive by default (a member may belong to at most one
 * active prayer group per parish); everything else is open. Admins may override
 * the default at creation time.
 */
export function defaultMembershipMode(
  type: OrganizationType,
): MembershipMode {
  return type === OrganizationType.PRAYER_GROUP
    ? MembershipMode.EXCLUSIVE
    : MembershipMode.OPEN;
}
