import { describe, expect, it } from 'vitest';
import { assertCanGrant, can } from '@/lib/permissions/resolver';
import type { PermissionOverride } from '@/lib/permissions/types';

describe('permissions resolver', () => {
  it('applies defaults for allowed and denied actions', () => {
    expect(can(['parish_admin'], 'member_profile', 'read')).toBe(true);
    expect(can(['member'], 'member_private_note', 'read')).toBe(false);
  });

  it('applies overrides on top of defaults', () => {
    const overrides: PermissionOverride[] = [
      {
        role: 'parish_staff',
        resource: 'member_profile',
        action: 'write',
        isAllowed: false,
      },
      {
        role: 'member',
        resource: 'member_export',
        action: 'read',
        isAllowed: true,
      },
    ];

    expect(can(['parish_staff'], 'member_profile', 'write', overrides)).toBe(
      false,
    );
    expect(can(['member'], 'member_export', 'read', overrides)).toBe(true);
  });

  it('blocks escalation when actor cannot grant target capability', () => {
    expect(() =>
      assertCanGrant(['parish_staff'], {
        role: 'member',
        resource: 'member_private_note',
        action: 'read',
        isAllowed: true,
      }),
    ).toThrow(/cannot grant/i);
  });

  it('allows grant when actor already has capability', () => {
    expect(() =>
      assertCanGrant(['clergy'], {
        role: 'member',
        resource: 'member_pastoral_data',
        action: 'read',
        isAllowed: true,
      }),
    ).not.toThrow();
  });

  it('defaults sacramental register like pastoral data for clergy/admin, not staff', () => {
    expect(can(['clergy'], 'member_sacramental_record', 'write')).toBe(true);
    expect(can(['parish_admin'], 'member_sacramental_record', 'export')).toBe(
      true,
    );
    expect(can(['pastoral_data_accessor'], 'member_sacramental_record', 'read')).toBe(
      true,
    );
    expect(can(['parish_staff'], 'member_sacramental_record', 'read')).toBe(
      false,
    );
    expect(can(['member'], 'member_sacramental_record', 'read')).toBe(false);
  });

  it('allows parish admin to grant staff sacramental access via override', () => {
    expect(() =>
      assertCanGrant(['parish_admin'], {
        role: 'parish_staff',
        resource: 'member_sacramental_record',
        action: 'write',
        isAllowed: true,
      }),
    ).not.toThrow();
  });
});
