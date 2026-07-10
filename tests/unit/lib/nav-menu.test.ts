import { describe, expect, it } from 'vitest';
import {
  navSectionsFromClaims,
  navSectionsForRoles,
  portalFromClaims,
  visibleNavItems,
} from '@/lib/nav/menu';
import type { SessionClaims } from '@/lib/auth';

function claims(
  roles: string[],
  opts?: { workingParishId?: string | null; parishId?: string | null },
): SessionClaims {
  return {
    sub: 'user-1',
    app_metadata: {
      diocese_id: 'diocese-1',
      parish_id: opts?.parishId ?? null,
      working_parish_id: opts?.workingParishId ?? null,
      roles,
      member_id: 'member-1',
      clergy_parish_ids: [],
      program_leader_ids: [],
      org_leader_ids: [],
    },
  };
}

describe('visibleNavItems', () => {
  it('shows member-safe destinations to ordinary members (parish portal)', () => {
    expect(
      visibleNavItems(['member'], { portal: 'parish' }).map((item) => item.href),
    ).toEqual([
      '/app',
      '/directory',
      '/self-service',
      '/programs',
      '/organizations',
      '/events',
      '/facilities',
    ]);
  });

  it('shows parish admin destinations without any diocese section', () => {
    const hrefs = visibleNavItems(['parish_admin'], { portal: 'parish' }).map(
      (item) => item.href,
    );
    expect(hrefs).toEqual([
      '/app',
      '/directory',
      '/registrations',
      '/members',
      '/families',
      '/sacramental-records',
      '/programs',
      '/organizations',
      '/events',
      '/facilities',
      '/messages',
      '/sharing',
      '/settings/parish',
      '/settings/officers',
      '/settings/users',
      '/settings/permissions',
      '/audit',
    ]);
    expect(hrefs.some((h) => h.startsWith('/diocese'))).toBe(false);
    expect(hrefs).not.toContain('/parishes');
  });

  it('shows aggregate reporting to diocese report viewers in diocese portal', () => {
    expect(
      visibleNavItems(['diocese_report_viewer'], { portal: 'diocese' }).map(
        (item) => item.href,
      ),
    ).toEqual(['/app', '/diocese/aggregate']);
  });

  it('hides parish ops from diocese admin in diocese portal', () => {
    const hrefs = visibleNavItems(['diocese_admin'], { portal: 'diocese' }).map(
      (item) => item.href,
    );
    expect(hrefs).toEqual([
      '/app',
      '/diocese/settings',
      '/parishes',
      '/diocese/users',
      '/diocese/aggregate',
      '/diocese/liturgical',
      '/sharing',
      '/audit',
    ]);
    expect(hrefs).not.toContain('/programs');
    expect(hrefs).not.toContain('/members');
  });

  it('shows parish portal items for diocese admin elevated roles in parish portal', () => {
    const hrefs = visibleNavItems(
      ['diocese_admin', 'parish_admin', 'parish_staff', 'member'],
      { portal: 'parish' },
    ).map((item) => item.href);
    expect(hrefs).toContain('/programs');
    expect(hrefs).toContain('/members');
    expect(hrefs).toContain('/sacramental-records');
    expect(hrefs).not.toContain('/diocese/aggregate');
    expect(hrefs).not.toContain('/parishes');
  });

  it('merges derived clergy roles with the base user role', () => {
    expect(
      visibleNavItems(['member', 'clergy'], { portal: 'parish' }).map(
        (item) => item.href,
      ),
    ).toEqual([
      '/app',
      '/directory',
      '/self-service',
      '/members',
      '/families',
      '/sacramental-records',
      '/programs',
      '/organizations',
      '/events',
      '/facilities',
      '/settings/officers',
    ]);
  });

  it('shows ministry leader parish operations without admin-only messages', () => {
    expect(
      visibleNavItems(['ministry_leader'], { portal: 'parish' }).map(
        (item) => item.href,
      ),
    ).toEqual(['/app', '/directory', '/programs', '/events']);
  });
});

describe('portalFromClaims', () => {
  it('keeps diocese admin on diocese portal without work-context', () => {
    expect(portalFromClaims(claims(['diocese_admin']))).toBe('diocese');
  });

  it('switches diocese admin to parish portal when working_parish_id is set', () => {
    expect(
      portalFromClaims(
        claims(['diocese_admin', 'parish_admin'], {
          workingParishId: 'parish-1',
          parishId: 'parish-1',
        }),
      ),
    ).toBe('parish');
  });

  it('keeps parish admin on parish portal', () => {
    expect(
      portalFromClaims(claims(['parish_admin'], { parishId: 'parish-1' })),
    ).toBe('parish');
  });
});

describe('navSectionsFromClaims', () => {
  it('groups parish admin items without a Diocese section', () => {
    expect(
      navSectionsFromClaims(claims(['parish_admin'], { parishId: 'p1' })).map(
        (section) => ({
          title: section.title,
          items: section.items.map((item) => item.href),
        }),
      ),
    ).toEqual([
      {
        title: 'People',
        items: [
          '/app',
          '/directory',
          '/registrations',
          '/members',
          '/families',
          '/sacramental-records',
        ],
      },
      {
        title: 'Parish',
        items: [
          '/programs',
          '/organizations',
          '/events',
          '/facilities',
          '/messages',
        ],
      },
      { title: 'Sharing', items: ['/sharing'] },
      {
        title: 'Administration',
        items: [
          '/settings/parish',
          '/settings/officers',
          '/settings/users',
          '/settings/permissions',
          '/audit',
        ],
      },
    ]);
  });

  it('groups diocese admin diocese portal without parish ops', () => {
    expect(
      navSectionsForRoles(['diocese_admin'], 'diocese').map((section) => ({
        title: section.title,
        items: section.items.map((item) => item.href),
      })),
    ).toEqual([
      { title: 'People', items: ['/app'] },
      {
        title: 'Diocese',
        items: [
          '/diocese/settings',
          '/parishes',
          '/diocese/users',
          '/diocese/aggregate',
          '/diocese/liturgical',
        ],
      },
      { title: 'Sharing', items: ['/sharing'] },
      { title: 'Administration', items: ['/audit'] },
    ]);
  });
});
