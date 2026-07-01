import { prisma } from '@/lib/prisma';
import { projectDirectoryMember } from '@/lib/projection';
import { ApiError } from '@/lib/api';

/**
 * Resolve the payload behind a ContextualShare.
 *
 * This uses the privileged `prisma` client deliberately: a share's recipient
 * may be in a different parish, or be a diocese-level user, than the shared
 * resource (see the `share_recipient_read` RLS policy). The validated share
 * record is itself the authorization grant — analogous to the pre-auth
 * secure-link and self-registration lookups — so RLS on `Member` cannot be
 * the enforcement boundary here. Isolation is enforced by filtering strictly
 * on the trusted `input.parishId` taken from the share row. Callers MUST
 * validate the share (recipient match, active, unexpired, view limits) before
 * invoking this.
 */
export async function resolveSharedResource(input: {
  parishId: string;
  resourceType: string;
  resourceId?: string | null;
}) {
  const resourceType = input.resourceType.toLowerCase();

  if (resourceType === 'member_list' || resourceType === 'members') {
    const members = await prisma.member.findMany({
      where: {
        parishId: input.parishId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        parishId: true,
        memberIdentifier: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
      },
      orderBy: [{ memberIdentifier: 'asc' }],
      take: 500,
    });

    return {
      type: 'member_list',
      members: members.map((m) => projectDirectoryMember({ ...m, status: m.status })),
    };
  }

  if (resourceType === 'member' && input.resourceId) {
    const member = await prisma.member.findFirst({
      where: {
        id: input.resourceId,
        parishId: input.parishId,
      },
      select: {
        id: true,
        parishId: true,
        memberIdentifier: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
      },
    });
    if (!member) throw new ApiError(404, 'Shared resource not found');
    return {
      type: 'member',
      member: projectDirectoryMember({ ...member, status: member.status }),
    };
  }

  return {
    type: resourceType,
    resourceId: input.resourceId ?? null,
  };
}
