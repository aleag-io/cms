/**
 * @rls @r5 @m10
 * GivingCategory RLS: owner isolation — a parish sees only its own categories and
 * cannot write another owner's.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';
import { FX, resetTestDb, testDb } from '../helpers/db';

const ACC_A = '00000000-0000-0000-0000-0000000c0001';
const CAT_A = '00000000-0000-0000-0000-0000000c0002';

const adminA = makeClaims({ userId: FX.users.parishAAdmin.id, dioceseId: FX.dioceseId, parishId: FX.parishAId, role: 'parish_admin' });
const adminB = makeClaims({ userId: FX.users.parishBAdmin.id, dioceseId: FX.dioceseId, parishId: FX.parishBId, role: 'parish_admin' });

async function seed() {
  await testDb.account.create({
    data: { id: ACC_A, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '4110', name: 'Subscription', type: 'INCOME' },
  });
  await testDb.givingCategory.create({
    data: { id: CAT_A, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, name: 'Subscription', section: 'Church Operation', incomeAccountId: ACC_A, updatedAt: new Date() },
  });
}

describe('r5 giving-category RLS', () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeRlsPool();
  });

  it('parish A category is invisible to parish B; visible to parish A', async () => {
    const seenB = await withTenantSession(adminB, async (c) => {
      const { rows } = await c.query(`SELECT id FROM "GivingCategory" WHERE "ownerId" = $1`, [FX.parishAId]);
      return rows;
    });
    expect(seenB).toHaveLength(0);

    const seenA = await withTenantSession(adminA, async (c) => {
      const { rows } = await c.query(`SELECT id FROM "GivingCategory" WHERE "ownerId" = $1`, [FX.parishAId]);
      return rows.map((r) => r.id);
    });
    expect(seenA).toContain(CAT_A);
  });

  it('parish A cannot INSERT a category for parish B owner', async () => {
    await expect(
      withTenantSession(adminA, async (c) => {
        await c.query(
          `INSERT INTO "GivingCategory"(id,"dioceseId","parishId","ownerType","ownerId",name,section,"incomeAccountId","updatedAt")
           VALUES (gen_random_uuid(),$1,$2,'PARISH',$2,'X','S',$3,now())`,
          [FX.dioceseId, FX.parishBId, ACC_A],
        );
      }),
    ).rejects.toThrow();
  });
});
