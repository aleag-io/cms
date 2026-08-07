import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import {
  elevatedRolesForWorkContext,
  isDioceseScopedRole,
  isParishHomeRole,
  portalForUser,
} from '@/lib/context/working-parish';
import { navSectionsForRoles, portalFromClaims } from '@/lib/nav/menu';
import type { SessionClaims } from '@/lib/auth';

describe('working parish helpers', () => {
  it('classifies diocese vs parish home roles', () => {
    expect(isDioceseScopedRole(Role.DIOCESE_ADMIN)).toBe(true);
    expect(isDioceseScopedRole(Role.PARISH_ADMIN)).toBe(false);
    expect(isParishHomeRole(Role.PARISH_STAFF)).toBe(true);
  });

  it('portal is parish for parish-home users', () => {
    expect(
      portalForUser(
        { role: Role.PARISH_ADMIN, parishId: 'p1' },
        null,
      ),
    ).toBe('parish');
  });

  it('portal is diocese until work-context is set', () => {
    expect(
      portalForUser({ role: Role.DIOCESE_ADMIN, parishId: null }, null),
    ).toBe('diocese');
    expect(
      portalForUser({ role: Role.DIOCESE_ADMIN, parishId: null }, 'p1'),
    ).toBe('parish');
  });

  it('elevates diocese admin to parish operators in work-context', () => {
    expect(elevatedRolesForWorkContext(Role.DIOCESE_ADMIN)).toContain(
      Role.PARISH_ADMIN,
    );
    expect(elevatedRolesForWorkContext(Role.DIOCESE_REPORT_VIEWER)).toEqual([
      Role.MEMBER,
    ]);
  });

  it('never elevates parish-home roles (members only narrow scope)', () => {
    expect(elevatedRolesForWorkContext(Role.MEMBER)).toEqual([]);
    expect(elevatedRolesForWorkContext(Role.PARISH_ADMIN)).toEqual([]);
  });
});

describe('member working-parish portal (MM-17)', () => {
  function claimsFor(opts: {
    role: string;
    parishId: string | null;
    workingParishId: string | null;
  }): SessionClaims {
    return {
      sub: 'user-1',
      app_metadata: {
        diocese_id: 'd1',
        parish_id: opts.parishId,
        working_parish_id: opts.workingParishId,
        roles: [opts.role],
        member_id: 'm1',
        clergy_parish_ids: [],
        program_leader_ids: [],
        org_leader_ids: [],
      },
    };
  }

  it('member portal is always parish — with or without a working parish', () => {
    expect(
      portalFromClaims(
        claimsFor({ role: 'member', parishId: 'pA', workingParishId: null }),
      ),
    ).toBe('parish');
    expect(
      portalFromClaims(
        claimsFor({ role: 'member', parishId: 'pA', workingParishId: 'pB' }),
      ),
    ).toBe('parish');
  });

  it('member nav in a working parish stays parish-portal only (no diocese chrome)', () => {
    const sections = navSectionsForRoles(['member'], 'parish');
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/directory');
    expect(hrefs.some((h) => h.startsWith('/diocese'))).toBe(false);
    expect(sections.some((s) => s.title === 'Diocese')).toBe(false);
  });

  it('diocese admin in work-context gets parish portal nav, not diocese items', () => {
    // Claims as produced by lib/auth for a diocese admin in work-context:
    // roles include the elevated parish operators.
    const claims = claimsFor({
      role: 'diocese_admin',
      parishId: 'pX',
      workingParishId: 'pX',
    });
    claims.app_metadata.roles = [
      'diocese_admin',
      'parish_admin',
      'parish_staff',
      'member',
    ];
    expect(portalFromClaims(claims)).toBe('parish');
    const sections = navSectionsForRoles(claims.app_metadata.roles, 'parish');
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/members');
    expect(hrefs).toContain('/programs');
    expect(hrefs.some((h) => h.startsWith('/diocese'))).toBe(false);
  });
});
