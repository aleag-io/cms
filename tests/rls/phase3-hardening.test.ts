/**
 * @phase:3 @rls
 *
 * Phase 3 hardening coverage. These tests intentionally issue direct SQL as
 * app_authenticated to prove that RLS and DB triggers, not route handlers,
 * enforce production boundaries for denormalized parish operation tables.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EventType,
  ProgramType,
} from '@prisma/client';
import { resetTestDb, FX, testDb } from '../helpers/db';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';

const PROGRAM_A = '00000000-0000-0000-0000-0000000004a1';
const PROGRAM_B = '00000000-0000-0000-0000-0000000004b1';
const EVENT_A = '00000000-0000-0000-0000-0000000004c1';

const parishAAdminClaims = makeClaims({
  userId: FX.users.parishAAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_admin',
});

const parishAMemberClaims = makeClaims({
  userId: FX.users.parishAMember.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'member',
  memberId: FX.members.aliceSmithId,
});

beforeAll(async () => {
  await resetTestDb();

  await testDb.program.createMany({
    data: [
      {
        id: PROGRAM_A,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        name: 'Parish A Bible Study',
        programType: ProgramType.BIBLE_STUDY,
      },
      {
        id: PROGRAM_B,
        dioceseId: FX.dioceseId,
        parishId: FX.parishBId,
        name: 'Parish B Bible Study',
        programType: ProgramType.BIBLE_STUDY,
      },
    ],
  });

  await testDb.event.create({
    data: {
      id: EVENT_A,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      name: 'Parish A Retreat',
      eventType: EventType.OTHER,
      startAt: new Date('2026-08-01T10:00:00Z'),
      endAt: new Date('2026-08-01T12:00:00Z'),
    },
  });
});

afterAll(async () => {
  await closeRlsPool();
  await testDb.$disconnect();
});

describe('RLS write hardening', () => {
  it('member role cannot insert parish-managed Program rows directly', async () => {
    await expect(
      withTenantSession(parishAMemberClaims, (client) =>
        client.query(
          `INSERT INTO "Program"
             (id, "dioceseId", "parishId", name, "programType", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, 'Unauthorized Program', 'OTHER', now())`,
          [FX.dioceseId, FX.parishAId],
        ),
      ),
    ).rejects.toThrow();
  });

  it('member self-enrollment is limited to pending participant requests', async () => {
    await expect(
      withTenantSession(parishAMemberClaims, (client) =>
        client.query(
          `INSERT INTO "ProgramEnrollment"
             (id, "dioceseId", "parishId", "programId", "memberId", role, status, "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'COORDINATOR', 'ACTIVE', now())`,
          [FX.dioceseId, FX.parishAId, PROGRAM_A, FX.members.aliceSmithId],
        ),
      ),
    ).rejects.toThrow();

    await expect(
      withTenantSession(parishAMemberClaims, (client) =>
        client.query(
          `INSERT INTO "ProgramEnrollment"
             (id, "dioceseId", "parishId", "programId", "memberId", role, status, "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PARTICIPANT', 'PENDING', now())`,
          [FX.dioceseId, FX.parishAId, PROGRAM_A, FX.members.aliceSmithId],
        ),
      ),
    ).resolves.toBeTruthy();
  });
});

describe('Tenant-consistency triggers', () => {
  it('rejects a child row whose parent belongs to another parish', async () => {
    await expect(
      withTenantSession(parishAMemberClaims, (client) =>
        client.query(
          `INSERT INTO "ProgramEnrollment"
             (id, "dioceseId", "parishId", "programId", "memberId", role, status, "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PARTICIPANT', 'PENDING', now())`,
          [FX.dioceseId, FX.parishAId, PROGRAM_B, FX.members.aliceSmithId],
        ),
      ),
    ).rejects.toThrow(/tenant mismatch|row-level security/i);
  });

  it('rejects parish-managed rows that reference a member from another parish', async () => {
    await expect(
      withTenantSession(parishAAdminClaims, (client) =>
        client.query(
          `INSERT INTO "Program"
             (id, "dioceseId", "parishId", name, "programType", "coordinatorMemberId", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, 'Bad Coordinator', 'OTHER', $3, now())`,
          [FX.dioceseId, FX.parishAId, FX.members.bobJonesBId],
        ),
      ),
    ).rejects.toThrow(/tenant mismatch|row-level security/i);
  });

  it('members cannot mark themselves attended while RSVPing', async () => {
    await expect(
      withTenantSession(parishAMemberClaims, (client) =>
        client.query(
          `INSERT INTO "EventAttendance"
             (id, "dioceseId", "parishId", "eventId", "memberId", "rsvpStatus", attended, "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'YES', true, now())`,
          [FX.dioceseId, FX.parishAId, EVENT_A, FX.members.aliceSmithId],
        ),
      ),
    ).rejects.toThrow(/Only parish staff may mark event attendance|permission/i);
  });
});
