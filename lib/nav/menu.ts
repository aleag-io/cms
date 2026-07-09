import type { SessionClaims } from '@/lib/auth';
import type { PortalMode } from '@/lib/context/working-parish';

export type AppRole =
  | 'global_admin'
  | 'diocese_admin'
  | 'diocese_staff'
  | 'diocese_report_viewer'
  | 'parish_admin'
  | 'parish_staff'
  | 'parish_data_sharing_manager'
  | 'clergy'
  | 'ministry_leader'
  | 'organization_leader'
  | 'pastoral_data_accessor'
  | 'member';

export type NavItem = {
  title: string;
  href: string;
  roles: AppRole[];
  section: 'People' | 'Parish' | 'Diocese' | 'Sharing' | 'Administration';
  /** When set, item only appears in this portal mode (shell plan §7). */
  portals?: PortalMode[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/',
    section: 'People',
    roles: [
      'global_admin',
      'diocese_admin',
      'diocese_staff',
      'diocese_report_viewer',
      'parish_admin',
      'parish_staff',
      'parish_data_sharing_manager',
      'clergy',
      'ministry_leader',
      'organization_leader',
      'pastoral_data_accessor',
      'member',
    ],
  },
  {
    title: 'Directory',
    href: '/directory',
    section: 'People',
    portals: ['parish'],
    roles: [
      'parish_admin',
      'parish_staff',
      'parish_data_sharing_manager',
      'clergy',
      'ministry_leader',
      'organization_leader',
      'pastoral_data_accessor',
      'member',
    ],
  },
  {
    title: 'My Profile',
    href: '/self-service',
    section: 'People',
    portals: ['parish'],
    roles: ['member'],
  },
  {
    title: 'Registrations',
    href: '/registrations',
    section: 'People',
    portals: ['parish'],
    roles: ['parish_admin', 'parish_staff'],
  },
  {
    title: 'Members',
    href: '/members',
    section: 'People',
    portals: ['parish'],
    roles: ['parish_admin', 'parish_staff', 'clergy', 'pastoral_data_accessor'],
  },
  {
    title: 'Families',
    href: '/families',
    section: 'People',
    portals: ['parish'],
    roles: ['parish_admin', 'parish_staff', 'clergy'],
  },
  {
    title: 'Programs',
    href: '/programs',
    section: 'Parish',
    portals: ['parish'],
    roles: ['parish_admin', 'parish_staff', 'ministry_leader', 'member'],
  },
  {
    title: 'Organizations',
    href: '/organizations',
    section: 'Parish',
    portals: ['parish'],
    roles: [
      'parish_admin',
      'parish_staff',
      'organization_leader',
      'member',
    ],
  },
  {
    title: 'Events',
    href: '/events',
    section: 'Parish',
    portals: ['parish'],
    roles: [
      'parish_admin',
      'parish_staff',
      'ministry_leader',
      'organization_leader',
      'member',
    ],
  },
  {
    title: 'Facilities',
    href: '/facilities',
    section: 'Parish',
    portals: ['parish'],
    roles: ['parish_admin', 'parish_staff', 'member'],
  },
  {
    title: 'Messages',
    href: '/messages',
    section: 'Parish',
    portals: ['parish'],
    roles: ['parish_admin', 'parish_staff'],
  },
  {
    title: 'Diocese Settings',
    href: '/diocese/settings',
    section: 'Diocese',
    portals: ['diocese'],
    roles: ['global_admin', 'diocese_admin', 'diocese_staff'],
  },
  {
    title: 'Parishes',
    href: '/parishes',
    section: 'Diocese',
    portals: ['diocese'],
    roles: ['global_admin', 'diocese_admin', 'diocese_staff'],
  },
  {
    title: 'Diocese Users',
    href: '/diocese/users',
    section: 'Diocese',
    portals: ['diocese'],
    roles: ['global_admin', 'diocese_admin'],
  },
  {
    title: 'Aggregate',
    href: '/diocese/aggregate',
    section: 'Diocese',
    portals: ['diocese'],
    roles: [
      'global_admin',
      'diocese_admin',
      'diocese_staff',
      'diocese_report_viewer',
    ],
  },
  {
    title: 'Sharing',
    href: '/sharing',
    section: 'Sharing',
    // Visible in both portals (diocese request side vs parish grant side)
    roles: [
      'diocese_admin',
      'diocese_staff',
      'parish_admin',
      'parish_data_sharing_manager',
    ],
  },
  {
    title: 'Parish Settings',
    href: '/settings/parish',
    section: 'Administration',
    portals: ['parish'],
    roles: ['parish_admin'],
  },
  {
    title: 'Officers',
    href: '/settings/officers',
    section: 'Administration',
    portals: ['parish'],
    roles: ['parish_admin', 'parish_staff', 'clergy'],
  },
  {
    title: 'Parish Users',
    href: '/settings/users',
    section: 'Administration',
    portals: ['parish'],
    roles: ['parish_admin'],
  },
  {
    title: 'Permissions',
    href: '/settings/permissions',
    section: 'Administration',
    portals: ['parish'],
    roles: ['parish_admin'],
  },
  {
    title: 'Audit Log',
    href: '/audit',
    section: 'Administration',
    roles: ['global_admin', 'diocese_admin', 'parish_admin'],
  },
];

export type NavSection = {
  title: NavItem['section'];
  items: NavItem[];
};

export type NavScope = {
  portal: PortalMode;
};

export function normalizeRoles(roles: string[]): AppRole[] {
  return roles.map((role) => role.toLowerCase() as AppRole);
}

export function visibleNavItems(
  roles: string[],
  scope: NavScope = { portal: 'parish' },
): NavItem[] {
  const roleSet = new Set(normalizeRoles(roles));
  return NAV_ITEMS.filter((item) => {
    if (!item.roles.some((role) => roleSet.has(role))) return false;
    if (item.portals && !item.portals.includes(scope.portal)) return false;
    // Hard rule: never show Diocese section in parish portal
    if (scope.portal === 'parish' && item.section === 'Diocese') return false;
    // Hard rule: never show parish-ops-only sections without portal tag in diocese mode
    if (
      scope.portal === 'diocese' &&
      (item.section === 'Parish' ||
        (item.section === 'People' && item.href !== '/') ||
        (item.section === 'Administration' &&
          item.href.startsWith('/settings')))
    ) {
      // Allow if explicitly portals includes diocese; otherwise exclude
      if (!item.portals?.includes('diocese')) return false;
    }
    return true;
  });
}

export function portalFromClaims(claims: SessionClaims): PortalMode {
  const roles = claims.app_metadata.roles.map((r) => r.toLowerCase());
  const isDioceseRole = roles.some((r) =>
    [
      'global_admin',
      'diocese_admin',
      'diocese_staff',
      'diocese_report_viewer',
    ].includes(r),
  );

  // Diocese-scoped roles stay on the diocese portal until they enter work-context.
  if (isDioceseRole) {
    return claims.app_metadata.working_parish_id ? 'parish' : 'diocese';
  }
  return 'parish';
}

export function navSectionsFromClaims(claims: SessionClaims): NavSection[] {
  return navSectionsForRoles(
    claims.app_metadata.roles,
    portalFromClaims(claims),
  );
}

/** Pure helper for tests / callers that already know portal mode. */
export function navSectionsForRoles(
  roles: string[],
  portal: PortalMode,
): NavSection[] {
  const items = visibleNavItems(roles, { portal });
  const sections = new Map<NavItem['section'], NavItem[]>();
  for (const item of items) {
    sections.set(item.section, [...(sections.get(item.section) ?? []), item]);
  }
  return Array.from(sections.entries()).map(([title, sectionItems]) => ({
    title,
    items: sectionItems,
  }));
}
