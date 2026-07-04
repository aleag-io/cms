/**
 * @phase:9 @rls
 *
 * R1 self-service RLS — member self-update scope (Phase 9 exit gate).
 *
 * Proves at the DATABASE layer that:
 *   1. A bare member can UPDATE their OWN Member row (member_self_update).
 *   2. A bare member cannot UPDATE any peer's Member row.
 *   3. A member cannot move their own row to another parish (WITH CHECK).
 *   4. A member can write their OWN CommunicationPreference rows and no one
 *      else's (comm_pref_self_rw).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetTestDb, FX, testDb } from '../helpers/db';
import { withTenantSession, makeClaims, closeRlsPool } from '../helpers/rls';

beforeAll(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeRlsPool();
  await testDb.$disconnect();
});

const memberClaims = makeClaims({
  userId: FX.users.parishAMember.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'member',
  memberId: FX.members.aliceSmithId,
});

describe('member self-update on Member (member_self_update)', () => {
  it('member can update their own contact fields', async () => {
    const result = await withTenantSession(memberClaims, (client) =>
      client.query(
        `UPDATE "Member" SET email = 'alice-self@test.local' WHERE id = $1`,
        [FX.members.aliceSmithId],
      ),
    );
    expect(result.rowCount).toBe(1);
  });

  it('member cannot update a peer member row in the same parish', async () => {
    const result = await withTenantSession(memberClaims, (client) =>
      client.query(
        `UPDATE "Member" SET email = 'hijacked@test.local' WHERE id = $1`,
        [FX.members.clergyAId],
      ),
    );
    expect(result.rowCount).toBe(0);
  });

  it('member cannot move their own row to another parish (WITH CHECK)', async () => {
    await expect(
      withTenantSession(memberClaims, (client) =>
        client.query(`UPDATE "Member" SET "parishId" = $1 WHERE id = $2`, [
          FX.parishBId,
          FX.members.aliceSmithId,
        ]),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });
});

describe('member self communication preferences (comm_pref_self_rw)', () => {
  it('member can upsert their own preference rows', async () => {
    const result = await withTenantSession(memberClaims, (client) =>
      client.query(
        `INSERT INTO "CommunicationPreference"
           (id, "dioceseId", "parishId", "memberId", channel, "optedOut", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'EMAIL', true, now(), now())`,
        [FX.dioceseId, FX.parishAId, FX.members.aliceSmithId],
      ),
    );
    expect(result.rowCount).toBe(1);
  });

  it('member cannot write preference rows for another member', async () => {
    await expect(
      withTenantSession(memberClaims, (client) =>
        client.query(
          `INSERT INTO "CommunicationPreference"
             (id, "dioceseId", "parishId", "memberId", channel, "optedOut", "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, 'EMAIL', true, now(), now())`,
          [FX.dioceseId, FX.parishAId, FX.members.clergyAId],
        ),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });
});
