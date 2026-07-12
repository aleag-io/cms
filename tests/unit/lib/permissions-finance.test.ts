import { describe, expect, it } from 'vitest';
import { can } from '@/lib/permissions/resolver';

describe('finance permission defaults', () => {
  it('diocese admin can write finance ledger and giving', () => {
    expect(can(['diocese_admin'], 'finance_ledger', 'write')).toBe(true);
    expect(can(['diocese_admin'], 'finance_giving', 'write')).toBe(true);
    expect(can(['diocese_admin'], 'finance_approval', 'write')).toBe(true);
  });

  it('parish staff can write ledger and giving but not manage approvals write defaults', () => {
    expect(can(['parish_staff'], 'finance_ledger', 'write')).toBe(true);
    expect(can(['parish_staff'], 'finance_giving', 'write')).toBe(true);
    expect(can(['parish_staff'], 'finance_approval', 'read')).toBe(true);
    expect(can(['parish_staff'], 'finance_approval', 'write')).toBe(false);
  });

  it('organization leader can write ledger but not giving', () => {
    expect(can(['organization_leader'], 'finance_ledger', 'write')).toBe(true);
    expect(can(['organization_leader'], 'finance_approval', 'write')).toBe(
      true,
    );
    expect(can(['organization_leader'], 'finance_giving', 'write')).toBe(
      false,
    );
  });

  it('member can only read finance_giving (self-service statements)', () => {
    expect(can(['member'], 'finance_giving', 'read')).toBe(true);
    expect(can(['member'], 'finance_giving', 'write')).toBe(false);
    expect(can(['member'], 'finance_ledger', 'read')).toBe(false);
  });

  it('deny override beats role default for finance_ledger write', () => {
    expect(
      can(['parish_admin'], 'finance_ledger', 'write', [
        {
          role: 'parish_admin',
          resource: 'finance_ledger',
          action: 'write',
          isAllowed: false,
        },
      ]),
    ).toBe(false);
  });
});
