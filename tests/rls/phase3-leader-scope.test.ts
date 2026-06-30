/**
 * @phase:3 @rls
 *
 * Sub-parish leader scoping (Phase 3 exit gate item 2).
 *
 * A Ministry Leader can read/write enrollments ONLY for the programs they
 * lead; an Organization Leader can manage the roster ONLY for the orgs they
 * lead. Everything else in the same parish is invisible to them. Scope is
 * derived in the database from claims.member_id via the SECURITY DEFINER
 * helper functions, so a member with role 'member' still gets exactly the
 * rows their leadership grants — no more.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EnrollmentRole,
  EnrollmentStatus,
  MembershipMode,
  OrganizationType,
  ProgramType,
} from '@prisma/client';
import { resetTestDb, FX, testDb } from '../helpers/db';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';

const P1 = '00000000-0000-0000-0000-0000000003a1';
const P2 = '00000000-0000-0000-0000-0000000003a2';
const E1 = '00000000-0000-0000-0000-0000000003b1';
const E2 = '00000000-0000-0000-0000-0000000003b2';
const O1 = '00000000-0000-0000-0000-0000000003c1';
const O2 = '00000000-0000-0000-0000-0000000003c2';
const M1 = '00000000-0000-0000-0000-0000000003d1';
const M2 = '00000000-0000-0000-0000-0000000003d2';
// A spare Parish-A member used as the target of a leader-driven write.
const DAVID = '00000000-0000-0000-0000-0000000003e1';

beforeAll(async () => {
  await resetTestDb();

  await testDb.member.create({
    data: {
      id: DAVID,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      familyId: FX.families.smithId,
      memberIdentifier: '100.9',
      firstName: 'David',
      lastName: 'Smith',
    },
  });

  // Alice coordinates P1; clergy coordinates P2 (both in Parish A).
  await testDb.program.createMany({
    data: [
      {
        id: P1,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        name: 'Sunday School',
        programType: ProgramType.FAITH_FORMATION,
        coordinatorMemberId: FX.members.aliceSmithId,
      },
      {
        id: P2,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        name: 'Youth Ministry',
        programType: ProgramType.YOUTH,
        coordinatorMemberId: FX.members.clergyAId,
      },
    ],
  });

  await testDb.programEnrollment.createMany({
    data: [
      {
        id: E1,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        programId: P1,
        memberId: FX.members.clergyAId,
        role: EnrollmentRole.PARTICIPANT,
        status: EnrollmentStatus.ACTIVE,
      },
      {
        id: E2,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        programId: P2,
        memberId: FX.members.clergyAId,
        role: EnrollmentRole.PARTICIPANT,
        status: EnrollmentStatus.ACTIVE,
      },
    ],
  });

  // Alice is an officer of O1; she leads nothing in O2.
  await testDb.organization.createMany({
    data: [
      {
        id: O1,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        name: 'Finance Committee',
        organizationType: OrganizationType.COMMITTEE,
        membershipMode: MembershipMode.OPEN,
      },
      {
        id: O2,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        name: 'Building Committee',
        organizationType: OrganizationType.COMMITTEE,
        membershipMode: MembershipMode.OPEN,
      },
    ],
  });

  await testDb.organizationOfficer.create({
    data: {
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      organizationId: O1,
      memberId: FX.members.aliceSmithId,
      title: 'Chair',
      isActive: true,
    },
  });

  await testDb.organizationMembership.createMany({
    data: [
      {
        id: M1,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        organizationId: O1,
        memberId: FX.members.clergyAId,
        organizationType: OrganizationType.COMMITTEE,
        membershipMode: MembershipMode.OPEN,
      },
      {
        id: M2,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        organizationId: O2,
        memberId: FX.members.clergyAId,
        organizationType: OrganizationType.COMMITTEE,
        membershipMode: MembershipMode.OPEN,
      },
    ],
  });
});

afterAll(async () => {
  await closeRlsPool();
  await testDb.$disconnect();
});

// Alice — plain MEMBER role; her leadership is resolved from member_id.
const aliceClaims = makeClaims({
  userId: FX.users.parishAMember.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'member',
  memberId: FX.members.aliceSmithId,
});

describe('Ministry Leader — program scope', () => {
  it('reads enrollments only for the program they coordinate', async () => {
    const rows = await withTenantSession(aliceClaims, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM "ProgramEnrollment" ORDER BY id',
      );
      return rows.map((r) => r.id);
    });
    expect(rows).toEqual([E1]); // P1 only — never E2 (P2).
  });

  it('can write an enrollment into a led program but not an unled one', async () => {
    await withTenantSession(aliceClaims, async (c) => {
      // Into P1 (led) — allowed via leader_rw, for a member other than herself.
      await expect(
        c.query(
          `INSERT INTO "ProgramEnrollment"
             (id, "dioceseId", "parishId", "programId", "memberId", role, status, "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PARTICIPANT', 'ACTIVE', now())`,
          [FX.dioceseId, FX.parishAId, P1, DAVID],
        ),
      ).resolves.toBeTruthy();
    });

    await withTenantSession(aliceClaims, async (c) => {
      // Into P2 (not led) — rejected by RLS WITH CHECK.
      await expect(
        c.query(
          `INSERT INTO "ProgramEnrollment"
             (id, "dioceseId", "parishId", "programId", "memberId", role, status, "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PARTICIPANT', 'ACTIVE', now())`,
          [FX.dioceseId, FX.parishAId, P2, FX.members.bobJonesBId],
        ),
      ).rejects.toThrow();
    });
  });
});

describe('Organization Leader — roster scope', () => {
  it('reads memberships only for the organization they lead', async () => {
    const rows = await withTenantSession(aliceClaims, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM "OrganizationMembership" ORDER BY id',
      );
      return rows.map((r) => r.id);
    });
    expect(rows).toEqual([M1]); // O1 only — never M2 (O2).
  });

  it('cannot add a member to an organization they do not lead', async () => {
    await withTenantSession(aliceClaims, async (c) => {
      await expect(
        c.query(
          `INSERT INTO "OrganizationMembership"
             (id, "dioceseId", "parishId", "organizationId", "memberId",
              "organizationType", "membershipMode", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'COMMITTEE', 'OPEN', now())`,
          [FX.dioceseId, FX.parishAId, O2, FX.members.aliceSmithId],
        ),
      ).rejects.toThrow();
    });
  });
});
