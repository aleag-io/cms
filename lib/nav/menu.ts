import type { SessionClaims } from '@/lib/auth';

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
    title: 'Members',
    href: '/members',
    section: 'People',
    roles: ['parish_admin', 'parish_staff', 'clergy', 'pastoral_data_accessor'],
  },
  {
    title: 'Families',
    href: '/families',
    section: 'People',
    roles: ['parish_admin', 'parish_staff', 'clergy'],
  },
  {
    title: 'Diocese Settings',
    href: '/diocese/settings',
    section: 'Diocese',
    roles: ['global_admin', 'diocese_admin', 'diocese_staff'],
  },
  {
    title: 'Parishes',
    href: '/parishes',
    section: 'Diocese',
    roles: ['global_admin', 'diocese_admin', 'diocese_staff'],
  },
  {
    title: 'Diocese Users',
    href: '/diocese/users',
    section: 'Diocese',
    roles: ['global_admin', 'diocese_admin'],
  },
  {
    title: 'Aggregate',
    href: '/diocese/aggregate',
    section: 'Diocese',
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
    roles: [
      'diocese_admin',
      'diocese_staff',
      'parish_admin',
      'parish_data_sharing_manager',
    ],
  },
  {
    title: 'Permissions',
    href: '/settings/permissions',
    section: 'Administration',
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

export function normalizeRoles(roles: string[]): AppRole[] {
  return roles.map((role) => role.toLowerCase() as AppRole);
}

export function visibleNavItems(roles: string[]): NavItem[] {
  const roleSet = new Set(normalizeRoles(roles));
  return NAV_ITEMS.filter((item) =>
    item.roles.some((role) => roleSet.has(role)),
  );
}

export function navSectionsFromClaims(claims: SessionClaims): NavSection[] {
  const items = visibleNavItems(claims.app_metadata.roles);
  const sections = new Map<NavItem['section'], NavItem[]>();

  for (const item of items) {
    sections.set(item.section, [...(sections.get(item.section) ?? []), item]);
  }

  return Array.from(sections.entries()).map(([title, sectionItems]) => ({
    title,
    items: sectionItems,
  }));
}
