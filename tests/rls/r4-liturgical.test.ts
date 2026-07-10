/**
 * @rls @r4 @m9
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';
import { FX, resetTestDb, testDb } from '../helpers/db';

const DIOCESE_ROW = '00000000-0000-0000-0000-000000000601';
const PARISH_A_ROW = '00000000-0000-0000-0000-000000000602';
const PARISH_B_ROW = '00000000-0000-0000-0000-000000000603';

const dioceseAdmin = makeClaims({
  userId: FX.users.dioceseAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: null,
  role: 'diocese_admin',
});

const parishAdminA = makeClaims({
  userId: FX.users.parishAAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_admin',
});

const parishAdminB = makeClaims({
  userId: FX.users.parishBAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishBId,
  role: 'parish_admin',
});

const memberA = makeClaims({
  userId: FX.users.parishAMember.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'member',
  memberId: FX.members.aliceSmithId,
});

beforeAll(async () => {
  await resetTestDb();
});

beforeEach(async () => {
  await testDb.liturgicalObservance.deleteMany({});
  await testDb.liturgicalObservance.createMany({
    data: [
      {
        id: DIOCESE_ROW,
        dioceseId: FX.dioceseId,
        parishId: null,
        title: 'Denaha',
        observanceType: 'FEAST',
        month: 1,
        day: 6,
        isPublished: true,
      },
      {
        id: PARISH_A_ROW,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        title: 'Parish feast A',
        observanceType: 'OTHER',
        month: 3,
        day: 1,
        isPublished: true,
      },
      {
        id: PARISH_B_ROW,
        dioceseId: FX.dioceseId,
        parishId: FX.parishBId,
        title: 'Parish feast B',
        observanceType: 'OTHER',
        month: 4,
        day: 1,
        isPublished: true,
      },
    ],
  });
});

afterAll(async () => {
  await closeRlsPool();
  await testDb.$disconnect();
});

describe('R4 LiturgicalObservance RLS', () => {
  it('parish admin sees diocese-wide + own parish local only', async () => {
    const ids = await withTenantSession(parishAdminA, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM "LiturgicalObservance" ORDER BY id',
      );
      return rows.map((r) => r.id as string);
    });
    expect(ids.sort()).toEqual([DIOCESE_ROW, PARISH_A_ROW].sort());
  });

  it('parish admin cannot see other parish local rows', async () => {
    const ids = await withTenantSession(parishAdminB, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM "LiturgicalObservance" ORDER BY id',
      );
      return rows.map((r) => r.id as string);
    });
    expect(ids).toContain(DIOCESE_ROW);
    expect(ids).toContain(PARISH_B_ROW);
    expect(ids).not.toContain(PARISH_A_ROW);
  });

  it('parish admin cannot update diocese-wide rows', async () => {
    // RLS filters matching rows; zero-row UPDATE does not throw.
    const n = await withTenantSession(parishAdminA, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE "LiturgicalObservance" SET title = 'hacked' WHERE id = $1::uuid`,
        [DIOCESE_ROW],
      );
      return rowCount ?? 0;
    });
    expect(n).toBe(0);
  });

  it('diocese admin can update diocese-wide rows', async () => {
    const n = await withTenantSession(dioceseAdmin, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE "LiturgicalObservance" SET title = 'Denaha (updated)' WHERE id = $1::uuid`,
        [DIOCESE_ROW],
      );
      return rowCount ?? 0;
    });
    expect(n).toBe(1);
  });

  it('unpublished parish-local draft is hidden from plain members but visible to parish admin', async () => {
    await testDb.liturgicalObservance.update({
      where: { id: PARISH_A_ROW },
      data: { isPublished: false },
    });

    const memberIds = await withTenantSession(memberA, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM "LiturgicalObservance" WHERE "parishId" IS NOT NULL',
      );
      return rows.map((r) => r.id as string);
    });
    expect(memberIds).toHaveLength(0);

    const adminIds = await withTenantSession(parishAdminA, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM "LiturgicalObservance" WHERE "parishId" IS NOT NULL',
      );
      return rows.map((r) => r.id as string);
    });
    expect(adminIds).toEqual([PARISH_A_ROW]);
  });

  it('unpublished diocese draft is hidden from parish admin', async () => {
    await testDb.liturgicalObservance.update({
      where: { id: DIOCESE_ROW },
      data: { isPublished: false },
    });
    const ids = await withTenantSession(parishAdminA, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM "LiturgicalObservance" WHERE "parishId" IS NULL',
      );
      return rows.map((r) => r.id as string);
    });
    expect(ids).toHaveLength(0);
  });
});
