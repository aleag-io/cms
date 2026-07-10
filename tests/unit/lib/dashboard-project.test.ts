import { describe, expect, it } from 'vitest';
import type { SessionClaims } from '@/lib/auth';
import {
  canSeePastoral,
  filterWorkItems,
  isMemberOnly,
  projectMemberDashboard,
  projectParishDashboard,
} from '@/lib/dashboard/project';
import type { ParishDashboardRaw } from '@/lib/dashboard/types';
import { MemberStatus } from '@prisma/client';

function claims(roles: string[], parishId: string | null = 'p1'): SessionClaims {
  return {
    sub: 'u1',
    app_metadata: {
      diocese_id: 'd1',
      parish_id: parishId,
      working_parish_id: null,
      roles,
      member_id: null,
      clergy_parish_ids: [],
      program_leader_ids: [],
      org_leader_ids: [],
    },
  };
}

const emptyStatus = {
  ACTIVE: 10,
  INACTIVE: 1,
  PENDING: 2,
  DECEASED: 0,
  MOVED: 0,
};

const raw: ParishDashboardRaw = {
  scope: { dioceseId: 'd1', parishId: 'p1', parishName: 'Test' },
  stats: {
    membersActive: 10,
    membersTotal: 13,
    familiesActive: 5,
    familiesTotal: 5,
    newMembersLast30Days: 2,
    pendingRegistrations: 1,
  },
  demographics: {
    byStatus: emptyStatus,
    ageBands: [{ key: '26-35', label: '26-35', count: 4 }],
    ageGenderBands: [
      {
        key: '26-35',
        label: '26-35',
        male: 2,
        female: 2,
        unassigned: 0,
      },
    ],
    genderTotals: { male: 2, female: 2, unassigned: 0 },
  },
  birthdaysThisWeek: [
    {
      memberId: 'm1',
      name: 'Alice',
      occurrenceDate: '2026-07-10',
      dateOfBirth: '1990-07-10',
      turnsAge: 36,
    },
  ],
  anniversariesThisWeek: [
    {
      familyId: 'f1',
      familyName: 'Smith',
      occurrenceDate: '2026-07-12',
      anniversaryDate: '2000-07-12',
      years: 26,
    },
  ],
  newMembers: [
    {
      id: 'm2',
      name: 'Bob',
      memberIdentifier: '100.1',
      createdAt: new Date().toISOString(),
      status: MemberStatus.ACTIVE,
    },
  ],
  workItems: [
    {
      key: 'pending_registrations',
      title: 'Pending registrations',
      count: 1,
      severity: 'warning',
      href: '/registrations',
    },
    {
      key: 'pending_sharing_requests',
      title: 'Sharing requests',
      count: 2,
      severity: 'urgent',
      href: '/sharing',
    },
    {
      key: 'upcoming_events',
      title: 'Events this week',
      count: 3,
      severity: 'info',
      href: '/events',
    },
  ],
  upcomingEvents: [
    { id: 'e1', name: 'Qurbana', startAt: new Date().toISOString() },
  ],
};

describe('pastoral visibility', () => {
  it('parish_admin can see pastoral', () => {
    expect(canSeePastoral(claims(['parish_admin']))).toBe(true);
  });

  it('parish_staff cannot see pastoral', () => {
    expect(canSeePastoral(claims(['parish_staff']))).toBe(false);
  });

  it('clergy can see pastoral', () => {
    expect(canSeePastoral(claims(['parish_staff', 'clergy']))).toBe(true);
  });
});

describe('projectParishDashboard', () => {
  it('strips birthdays/anniversaries/ageBands for staff without pastoral', () => {
    const dto = projectParishDashboard(raw, claims(['parish_staff']));
    expect(dto.birthdaysThisWeek).toBeUndefined();
    expect(dto.anniversariesThisWeek).toBeUndefined();
    expect(dto.demographics.ageBands).toBeUndefined();
    expect(dto.demographics.ageGenderBands).toBeUndefined();
    expect(dto.demographics.genderTotals).toBeUndefined();
    expect(dto.newMembers).toHaveLength(1);
    expect(dto.workItems.map((w) => w.key)).toContain('pending_registrations');
    expect(dto.workItems.map((w) => w.key)).not.toContain(
      'pending_sharing_requests',
    );
  });

  it('includes pastoral fields for parish_admin', () => {
    const dto = projectParishDashboard(raw, claims(['parish_admin']));
    expect(dto.birthdaysThisWeek).toHaveLength(1);
    expect(dto.anniversariesThisWeek).toHaveLength(1);
    expect(dto.demographics.ageBands).toHaveLength(1);
    expect(dto.demographics.ageGenderBands).toHaveLength(1);
    expect(dto.demographics.genderTotals?.male).toBe(2);
    expect(dto.workItems.map((w) => w.key)).toContain(
      'pending_sharing_requests',
    );
  });

  it('counts only non-info work items in pendingWorkItemCount', () => {
    const dto = projectParishDashboard(raw, claims(['parish_admin']));
    // registrations 1 + sharing 2 = 3 (upcoming is info)
    expect(dto.stats.pendingWorkItemCount).toBe(3);
  });
});

describe('filterWorkItems', () => {
  it('sharing manager sees sharing items only among sharing keys', () => {
    const items = filterWorkItems(raw.workItems, claims(['parish_data_sharing_manager']));
    expect(items.map((i) => i.key)).toEqual(['pending_sharing_requests']);
  });
});

describe('member mode', () => {
  it('detects pure member role', () => {
    expect(isMemberOnly(claims(['member']))).toBe(true);
    expect(isMemberOnly(claims(['member', 'parish_admin']))).toBe(false);
  });

  it('projectMemberDashboard has no pastoral lists or work items', () => {
    const dto = projectMemberDashboard({
      scope: { dioceseId: 'd1', parishId: 'p1' },
      memberId: 'm1',
    });
    expect(dto.mode).toBe('member');
    expect(dto.birthdaysThisWeek).toBeUndefined();
    expect(dto.workItems).toEqual([]);
    expect(dto.memberLinks?.some((l) => l.href.includes('/members/m1'))).toBe(
      true,
    );
  });
});
