import { describe, expect, it } from 'vitest';
import {
  membershipModeDisplay,
  organizationTypeLabel,
} from '@/lib/organizations/display';

describe('organization display helpers', () => {
  it('labels organization types', () => {
    expect(organizationTypeLabel('PRAYER_GROUP')).toBe('Prayer group');
  });

  it('flags membership mode defaults from type (PA-15)', () => {
    expect(membershipModeDisplay('PRAYER_GROUP', 'EXCLUSIVE')).toEqual({
      label: 'Exclusive',
      isDefault: true,
    });

    expect(membershipModeDisplay('PRAYER_GROUP', 'OPEN')).toEqual({
      label: 'Open',
      isDefault: false,
    });

    expect(membershipModeDisplay('COMMITTEE', 'OPEN')).toEqual({
      label: 'Open',
      isDefault: true,
    });
  });
});
