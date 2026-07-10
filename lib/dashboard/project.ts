import type { SessionClaims } from '@/lib/auth';
import type {
  DashboardDto,
  DioceseDashboardRaw,
  ParishDashboardRaw,
} from '@/lib/dashboard/types';

const PASTORAL_ROLES = new Set([
  'clergy',
  'parish_admin',
  'pastoral_data_accessor',
]);

const STAFF_QUEUE_ROLES = new Set([
  'parish_admin',
  'parish_staff',
  'clergy',
  'pastoral_data_accessor',
]);

const SHARING_QUEUE_ROLES = new Set([
  'parish_admin',
  'parish_data_sharing_manager',
  'diocese_admin',
  'diocese_staff',
]);

const NEW_MEMBER_ROLES = new Set([
  'parish_admin',
  'parish_staff',
  'clergy',
  'pastoral_data_accessor',
  'parish_data_sharing_manager',
  'ministry_leader',
  'organization_leader',
  'diocese_admin',
  'diocese_staff',
  'diocese_report_viewer',
  'global_admin',
]);

function roleSet(claims: SessionClaims): Set<string> {
  return new Set(claims.app_metadata.roles.map((r) => r.toLowerCase()));
}

export function canSeePastoral(claims: SessionClaims): boolean {
  const roles = roleSet(claims);
  return [...PASTORAL_ROLES].some((r) => roles.has(r));
}

export function canSeeStaffQueues(claims: SessionClaims): boolean {
  const roles = roleSet(claims);
  return [...STAFF_QUEUE_ROLES].some((r) => roles.has(r));
}

export function canSeeSharingQueues(claims: SessionClaims): boolean {
  const roles = roleSet(claims);
  return [...SHARING_QUEUE_ROLES].some((r) => roles.has(r));
}

export function canSeeNewMembers(claims: SessionClaims): boolean {
  const roles = roleSet(claims);
  return [...NEW_MEMBER_ROLES].some((r) => roles.has(r));
}

export function isMemberOnly(claims: SessionClaims): boolean {
  const roles = roleSet(claims);
  // Pure member: has member role and none of the staff/pastoral operator roles
  if (!roles.has('member')) return false;
  const operator = [
    ...PASTORAL_ROLES,
    ...STAFF_QUEUE_ROLES,
    ...SHARING_QUEUE_ROLES,
    'ministry_leader',
    'organization_leader',
    'diocese_admin',
    'diocese_staff',
    'diocese_report_viewer',
    'global_admin',
  ];
  return !operator.some((r) => roles.has(r));
}

/** Filter work items by role capabilities. */
export function filterWorkItems(
  items: ParishDashboardRaw['workItems'],
  claims: SessionClaims,
): ParishDashboardRaw['workItems'] {
  const staff = canSeeStaffQueues(claims);
  const sharing = canSeeSharingQueues(claims);

  return items.filter((item) => {
    if (
      item.key === 'pending_registrations' ||
      item.key === 'pending_members' ||
      item.key === 'failed_messages' ||
      item.key === 'queued_messages' ||
      item.key === 'upcoming_events'
    ) {
      return staff;
    }
    if (
      item.key === 'pending_sharing_requests' ||
      item.key === 'expiring_emergency_access'
    ) {
      return sharing;
    }
    return staff;
  });
}

export function projectParishDashboard(
  raw: ParishDashboardRaw,
  claims: SessionClaims,
): DashboardDto {
  const pastoral = canSeePastoral(claims);
  const showNew = canSeeNewMembers(claims);
  const workItems = filterWorkItems(raw.workItems, claims);
  const pendingWorkItemCount = workItems
    .filter((w) => w.severity !== 'info')
    .reduce((sum, w) => sum + w.count, 0);

  return {
    mode: 'parish',
    generatedAt: new Date().toISOString(),
    scope: raw.scope,
    stats: {
      ...raw.stats,
      pendingWorkItemCount,
      // Hide registration count from pure non-staff? Keep for staff; zero for others via filter
      pendingRegistrations: workItems.find((w) => w.key === 'pending_registrations')
        ?.count ?? 0,
    },
    demographics: {
      byStatus: raw.demographics.byStatus,
      ageBands: pastoral ? raw.demographics.ageBands : undefined,
      ageGenderBands: pastoral ? raw.demographics.ageGenderBands : undefined,
      genderTotals: pastoral ? raw.demographics.genderTotals : undefined,
    },
    birthdaysThisWeek: pastoral ? raw.birthdaysThisWeek : undefined,
    anniversariesThisWeek: pastoral ? raw.anniversariesThisWeek : undefined,
    newMembers: showNew ? raw.newMembers : [],
    workItems,
    upcomingEvents: canSeeStaffQueues(claims) ? raw.upcomingEvents : undefined,
  };
}

export function projectDioceseDashboard(
  raw: DioceseDashboardRaw,
  claims: SessionClaims,
): DashboardDto {
  const showNew = canSeeNewMembers(claims);
  const workItems = raw.workItems.filter((item) => {
    if (item.key === 'pending_sharing_requests') return canSeeSharingQueues(claims);
    return canSeeNewMembers(claims);
  });
  const pendingWorkItemCount = workItems
    .filter((w) => w.severity !== 'info')
    .reduce((sum, w) => sum + w.count, 0);

  return {
    mode: 'diocese',
    generatedAt: new Date().toISOString(),
    scope: raw.scope,
    stats: {
      ...raw.stats,
      pendingWorkItemCount,
    },
    demographics: {
      byStatus: raw.demographics.byStatus,
    },
    newMembers: showNew ? raw.newMembers : [],
    workItems,
  };
}

export function projectMemberDashboard(input: {
  scope: DashboardDto['scope'];
  memberId: string | null;
}): DashboardDto {
  const emptyStatus = {
    ACTIVE: 0,
    INACTIVE: 0,
    PENDING: 0,
    DECEASED: 0,
    MOVED: 0,
  };

  return {
    mode: 'member',
    generatedAt: new Date().toISOString(),
    scope: input.scope,
    stats: {
      membersActive: 0,
      membersTotal: 0,
      familiesActive: 0,
      familiesTotal: 0,
      newMembersLast30Days: 0,
      pendingRegistrations: 0,
      pendingWorkItemCount: 0,
    },
    demographics: { byStatus: emptyStatus },
    newMembers: [],
    workItems: [],
    memberLinks: [
      {
        href: '/directory',
        title: 'Parish directory',
        description: 'Find fellow members (directory-safe fields only).',
      },
      {
        href: '/self-service',
        title: 'My profile',
        description: 'Update your contact info and communication preferences.',
      },
      ...(input.memberId
        ? [
            {
              href: `/members/${input.memberId}`,
              title: 'My member record',
              description: 'View your membership profile.',
            },
          ]
        : []),
    ],
  };
}
