/**
 * @phase:4 @rls
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';
import { FX, resetTestDb, testDb } from '../helpers/db';

const dioceseClaims = makeClaims({
  userId: FX.users.dioceseAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: null,
  role: 'diocese_admin',
});

async function queryMembers(parishId: string): Promise<string[]> {
  return withTenantSession(dioceseClaims, async (c) => {
    const { rows } = await c.query(
      'SELECT id FROM "Member" WHERE "parishId" = $1::uuid ORDER BY id',
      [parishId],
    );
    return rows.map((r) => r.id as string);
  });
}

beforeAll(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeRlsPool();
  await testDb.$disconnect();
});

describe('Phase 4 emergency-access RLS', () => {
  it('active emergency access allows diocese SELECT on members', async () => {
    await testDb.emergencyAccessGrant.create({
      data: {
        parishId: FX.parishAId,
        dioceseId: FX.dioceseId,
        grantedByUserId: FX.users.dioceseAdmin.id,
        justification: 'incident response',
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });

    const rows = await queryMembers(FX.parishAId);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('expired emergency access returns zero rows', async () => {
    await testDb.emergencyAccessGrant.deleteMany({ where: { parishId: FX.parishAId } });
    await testDb.emergencyAccessGrant.create({
      data: {
        parishId: FX.parishAId,
        dioceseId: FX.dioceseId,
        grantedByUserId: FX.users.dioceseAdmin.id,
        justification: 'expired access',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const rows = await queryMembers(FX.parishAId);
    expect(rows).toHaveLength(0);
  });
});
