/**
 * @integration Dashboard aggregate API — role projection + parish isolation.
 */
import { MemberStatus, RegistrationStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asGuest, asUser } from '../../helpers/auth';
import { FX, testDb } from '../../helpers/db';

let dashboardGET: () => Promise<Response>;

async function loadRoute() {
  ({ GET: dashboardGET } = await import('@/app/api/dashboard/route'));
}

describe('GET /api/dashboard', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await loadRoute();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('requires authentication', async () => {
    resetAuth = asGuest();
    const res = await dashboardGET();
    expect(res.status).toBe(401);
  });

  it('parish admin sees stats and pastoral sections', async () => {
    const user = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(user);

    // Ensure pastoral DOB for Alice is in the current week window for a hit,
    // or at least that ageBands appear when DOB exists.
    await testDb.memberPastoralData.upsert({
      where: { memberId: FX.members.aliceSmithId },
      create: {
        memberId: FX.members.aliceSmithId,
        parishId: FX.parishAId,
        dateOfBirth: new Date('1990-01-15'),
      },
      update: { dateOfBirth: new Date('1990-01-15') },
    });

    const res = await dashboardGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.dashboard.mode).toBe('parish');
    expect(data.dashboard.scope.parishId).toBe(FX.parishAId);
    expect(data.dashboard.stats.membersTotal).toBeGreaterThanOrEqual(2);
    expect(data.dashboard.demographics.byStatus.ACTIVE).toBeGreaterThanOrEqual(1);
    expect(data.dashboard.demographics.ageBands).toBeDefined();
    expect(data.dashboard.birthdaysThisWeek).toBeDefined();
    expect(data.dashboard.anniversariesThisWeek).toBeDefined();
    expect(Array.isArray(data.dashboard.workItems)).toBe(true);
  });

  it('parish staff does not receive pastoral birthdays or age bands', async () => {
    const user = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(user);

    const res = await dashboardGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.dashboard.mode).toBe('parish');
    expect(data.dashboard.birthdaysThisWeek).toBeUndefined();
    expect(data.dashboard.anniversariesThisWeek).toBeUndefined();
    expect(data.dashboard.demographics.ageBands).toBeUndefined();
    expect(data.dashboard.newMembers).toBeDefined();
    // Staff should see registration/message queues, not sharing
    const keys = data.dashboard.workItems.map((w: { key: string }) => w.key);
    expect(keys).toContain('pending_registrations');
    expect(keys).not.toContain('pending_sharing_requests');
  });

  it('member role gets reduced member mode without peer pastoral data', async () => {
    const user = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(user);

    const res = await dashboardGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.dashboard.mode).toBe('member');
    expect(data.dashboard.birthdaysThisWeek).toBeUndefined();
    expect(data.dashboard.workItems).toEqual([]);
    expect(data.dashboard.memberLinks?.length).toBeGreaterThan(0);
  });

  it('pending registration appears in work items for parish admin', async () => {
    const user = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(user);

    await testDb.memberRegistration.create({
      data: {
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        firstName: 'Pending',
        lastName: 'Reg',
        email: 'pending.reg@test.local',
        approvalStatus: RegistrationStatus.PENDING,
      },
    });

    const res = await dashboardGET();
    const data = await res.json();
    const regItem = data.dashboard.workItems.find(
      (w: { key: string }) => w.key === 'pending_registrations',
    );
    expect(regItem?.count).toBeGreaterThanOrEqual(1);
    expect(data.dashboard.stats.pendingWorkItemCount).toBeGreaterThanOrEqual(1);
  });

  it('does not surface parish B member counts to parish A staff', async () => {
    const user = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(user);

    // Parish B has bob; parish A should not include him in new members list by id
    const res = await dashboardGET();
    const data = await res.json();
    const ids = (data.dashboard.newMembers as { id: string }[]).map((m) => m.id);
    expect(ids).not.toContain(FX.members.bobJonesBId);
    expect(data.dashboard.scope.parishId).toBe(FX.parishAId);
  });

  it('diocese admin without parish gets diocese mode', async () => {
    const user = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(user);

    const res = await dashboardGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.dashboard.mode).toBe('diocese');
    expect(data.dashboard.scope.parishId).toBeNull();
    expect(data.dashboard.stats.parishCount).toBeGreaterThanOrEqual(2);
    expect(data.dashboard.birthdaysThisWeek).toBeUndefined();
  });
});

describe('dashboard fixtures', () => {
  it('seed has at least one active member in parish A', async () => {
    const count = await testDb.member.count({
      where: { parishId: FX.parishAId, status: MemberStatus.ACTIVE },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
