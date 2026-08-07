/**
 * @m0 @rls
 *
 * M0 shell close-out — member working-parish scoping (MM-17 UX, shell plan §7).
 *
 * Fixture clergy (Fr. Clergy, FX.members.clergyAId) belongs to BOTH parishes
 * (MemberParish: A primary, B secondary). This suite proves at the DATABASE
 * layer that the claims shape a member working-parish switch produces is
 * coherent:
 *
 *   1. Scoped to parish B, a multi-parish member reads parish B rows
 *      (member_parish_read / directory view honor the MemberParish branch).
 *   2. The same member still cannot read rows of a parish they do NOT belong
 *      to (a third parish, created inline).
 *   3. Writes remain keyed to the *effective* parish claim: a member cannot
 *      write Member rows at all (member role has no member_parish_write),
 *      and even a staff-role session scoped to parish B cannot write
 *      parish A rows (WITH CHECK on effective parish).
 *   4. MemberParish self-read stays member-keyed regardless of scope.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetTestDb, FX, testDb } from '../helpers/db';
import { withTenantSession, makeClaims, closeRlsPool } from '../helpers/rls';

let parishCId: string;

beforeAll(async () => {
  await resetTestDb();
  // A third parish nobody in the fixture belongs to (as a member).
  parishCId = '00000000-0000-0000-0000-000000000012';
  await testDb.parish.create({
    data: { id: parishCId, dioceseId: FX.dioceseId, name: 'Parish C (unaffiliated)' },
  });
  await testDb.family.create({
    data: {
      id: '00000000-0000-0000-0000-000000000202',
      dioceseId: FX.dioceseId,
      parishId: parishCId,
      familyNumber: '1',
      familyName: 'Outsider',
    },
  });
  await testDb.member.create({
    data: {
      id: '00000000-0000-0000-0000-000000000303',
      dioceseId: FX.dioceseId,
      parishId: parishCId,
      memberIdentifier: '1.1',
      firstName: 'Carol',
      lastName: 'Outsider',
    },
  });
});

afterAll(async () => {
  await closeRlsPool();
  await testDb.$disconnect();
});

/** Clergy fixture scoped to parish B via the working-parish overlay. */
const clergyScopedToB = makeClaims({
  userId: FX.users.clergyA.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishBId, // effective parish after working-parish overlay
  role: 'parish_staff', // AppUser role; clergy derives from ParishOfficer
  memberId: FX.members.clergyAId,
  clergyParishIds: [FX.parishAId],
});

describe('multi-parish member read scope (MemberParish branch)', () => {
  it('scoped to parish B, the member reads parish B Member rows', async () => {
    const res = await withTenantSession(clergyScopedToB, (client) =>
      client.query(
        `SELECT id FROM "Member" WHERE "parishId" = $1`,
        [FX.parishBId],
      ),
    );
    const ids = res.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(FX.members.bobJonesBId);
  });

  it('the same member still reads parish A rows via their MemberParish branch', async () => {
    // Read policy: parish match OR member belongs to the row's parish.
    // This documents that the working-parish overlay narrows *writes* and
    // UX scope, while same-member cross-parish reads stay policy-allowed.
    const res = await withTenantSession(clergyScopedToB, (client) =>
      client.query(
        `SELECT id FROM "Member" WHERE "parishId" = $1`,
        [FX.parishAId],
      ),
    );
    const ids = res.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(FX.members.aliceSmithId);
  });

  it('never reads a parish the member does not belong to', async () => {
    const res = await withTenantSession(clergyScopedToB, (client) =>
      client.query(`SELECT id FROM "Member" WHERE "parishId" = $1`, [
        parishCId,
      ]),
    );
    expect(res.rowCount).toBe(0);
  });

  it('directory view follows the same scope (B visible, C absent)', async () => {
    const res = await withTenantSession(clergyScopedToB, (client) =>
      client.query(`SELECT id, "parishId" FROM parish_member_directory`),
    );
    const parishIds = new Set(
      res.rows.map((r: { parishId: string }) => r.parishId),
    );
    expect(parishIds.has(FX.parishBId)).toBe(true);
    expect(parishIds.has(parishCId)).toBe(false);
  });
});

describe('write scope keyed to effective parish claim', () => {
  it('bare member role cannot write Member rows regardless of scope', async () => {
    const memberClaims = makeClaims({
      userId: FX.users.parishAMember.id,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      role: 'member',
      memberId: FX.members.aliceSmithId,
    });
    const res = await withTenantSession(memberClaims, (client) =>
      client.query(
        `UPDATE "Member" SET "firstName" = 'Nope' WHERE id = $1`,
        [FX.members.bobJonesBId],
      ),
    );
    expect(res.rowCount).toBe(0);
  });

  it('staff scoped to parish B cannot write parish A rows (WITH CHECK)', async () => {
    // clergyA holds PARISH_STAFF and is *scoped* to B — writes must target B.
    const res = await withTenantSession(clergyScopedToB, (client) =>
      client.query(
        `UPDATE "Member" SET "workNotes" = 'cross-scope write' WHERE id = $1`,
        [FX.members.aliceSmithId], // parish A row
      ),
    );
    expect(res.rowCount).toBe(0);
  });

  it('staff scoped to parish B CAN write parish B rows', async () => {
    const res = await withTenantSession(clergyScopedToB, (client) =>
      client.query(
        `UPDATE "Member" SET "workNotes" = 'in-scope write' WHERE id = $1`,
        [FX.members.bobJonesBId], // parish B row
      ),
    );
    expect(res.rowCount).toBe(1);
  });
});

describe('MemberParish self-read is scope-independent', () => {
  it('member reads their own mapping rows in both parishes from either scope', async () => {
    const res = await withTenantSession(clergyScopedToB, (client) =>
      client.query(
        `SELECT "parishId" FROM "MemberParish" WHERE "memberId" = $1 ORDER BY "parishId"`,
        [FX.members.clergyAId],
      ),
    );
    expect(res.rowCount).toBe(2);
  });

  it('member cannot read another member’s MemberParish rows in a foreign parish', async () => {
    const res = await withTenantSession(clergyScopedToB, (client) =>
      client.query(`SELECT id FROM "MemberParish" WHERE "parishId" = $1`, [
        parishCId,
      ]),
    );
    expect(res.rowCount).toBe(0);
  });
});
