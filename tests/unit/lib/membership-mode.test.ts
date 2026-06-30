import { describe, expect, it } from 'vitest';
import { MembershipMode, OrganizationType } from '@prisma/client';
import { defaultMembershipMode } from '@/lib/organizations/membership-mode';

describe('defaultMembershipMode (PA-16)', () => {
  it('defaults prayer groups to EXCLUSIVE', () => {
    expect(defaultMembershipMode(OrganizationType.PRAYER_GROUP)).toBe(
      MembershipMode.EXCLUSIVE,
    );
  });

  it('defaults every other type to OPEN', () => {
    for (const type of [
      OrganizationType.COMMITTEE,
      OrganizationType.AUXILIARY,
      OrganizationType.MINISTRY,
      OrganizationType.OTHER,
    ]) {
      expect(defaultMembershipMode(type)).toBe(MembershipMode.OPEN);
    }
  });
});
