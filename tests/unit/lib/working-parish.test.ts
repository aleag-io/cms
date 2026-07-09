import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import {
  elevatedRolesForWorkContext,
  isDioceseScopedRole,
  isParishHomeRole,
  portalForUser,
} from '@/lib/context/working-parish';

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
});
