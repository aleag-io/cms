import { describe, expect, it } from 'vitest';
import { Gender, MemberStatus } from '@prisma/client';
import {
  DIOCESE_NEW_MEMBER_STATUSES,
  genderTotalsFromDobMembers,
  PARISH_NEW_MEMBER_STATUSES,
} from '@/lib/dashboard/queries';

describe('genderTotalsFromDobMembers', () => {
  it('counts only the provided DOB members (does not invent no-DOB padding)', () => {
    const totals = genderTotalsFromDobMembers([
      { gender: Gender.MALE },
      { gender: Gender.MALE },
      { gender: Gender.FEMALE },
      { gender: null },
      { gender: Gender.UNSPECIFIED },
      { gender: Gender.OTHER },
    ]);
    expect(totals).toEqual({ male: 2, female: 1, unassigned: 3 });
    // Legend sum equals DOB-row count — not parish active headcount.
    expect(totals.male + totals.female + totals.unassigned).toBe(6);
  });

  it('returns zeros for empty input (no phantom unassigned)', () => {
    expect(genderTotalsFromDobMembers([])).toEqual({
      male: 0,
      female: 0,
      unassigned: 0,
    });
  });
});

describe('new-member status filters', () => {
  it('parish KPI/list use ACTIVE + PENDING only', () => {
    expect(PARISH_NEW_MEMBER_STATUSES).toEqual([
      MemberStatus.ACTIVE,
      MemberStatus.PENDING,
    ]);
    expect(PARISH_NEW_MEMBER_STATUSES).not.toContain(MemberStatus.INACTIVE);
    expect(PARISH_NEW_MEMBER_STATUSES).not.toContain(MemberStatus.MOVED);
    expect(PARISH_NEW_MEMBER_STATUSES).not.toContain(MemberStatus.DECEASED);
  });

  it('diocese KPI/list use ACTIVE only', () => {
    expect(DIOCESE_NEW_MEMBER_STATUSES).toEqual([MemberStatus.ACTIVE]);
  });
});
