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

async function queryMemberIds(parishId: string): Promise<string[]> {
  return withTenantSession(dioceseClaims, async (c) => {
    const { rows } = await c.query(
      'SELECT id FROM "Member" WHERE "parishId" = $1::uuid ORDER BY id',
      [parishId],
    );
    return rows.map((r) => r.id as string);
  });
}

async function queryFamilyIds(parishId: string): Promise<string[]> {
  return withTenantSession(dioceseClaims, async (c) => {
    const { rows } = await c.query(
      'SELECT id FROM "Family" WHERE "parishId" = $1::uuid ORDER BY id',
      [parishId],
    );
    return rows.map((r) => r.id as string);
  });
}

async function grantCategory(parishId: string, dataCategory: 'MEMBER_DIRECTORY' | 'FAMILY_RECORDS', expiresAt?: Date) {
  return testDb.dataSharingGrant.create({
    data: {
      parishId,
      dioceseId: FX.dioceseId,
      dataCategory,
      granteeType: 'DIOCESE',
      granteeId: FX.dioceseId,
      scope: 'ALL_RECORDS',
      grantedByUserId: FX.users.parishAAdmin.id,
      expiresAt: expiresAt ?? null,
      isActive: true,
    },
  });
}

beforeAll(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeRlsPool();
  await testDb.$disconnect();
});

describe('Phase 4 grant-gated Tier-3 RLS', () => {
  it('diocese with no grant sees zero Member rows for Parish A', async () => {
    const rows = await queryMemberIds(FX.parishAId);
    expect(rows).toHaveLength(0);
  });

  it('diocese with active MEMBER_DIRECTORY grant sees Parish A members', async () => {
    await grantCategory(FX.parishAId, 'MEMBER_DIRECTORY');
    const rows = await queryMemberIds(FX.parishAId);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('MEMBER_DIRECTORY grant does not expose Family rows', async () => {
    const rows = await queryFamilyIds(FX.parishAId);
    expect(rows).toHaveLength(0);
  });

  it('expired grant returns zero rows', async () => {
    await testDb.dataSharingGrant.deleteMany({ where: { parishId: FX.parishAId } });
    const past = new Date(Date.now() - 60_000);
    await grantCategory(FX.parishAId, 'MEMBER_DIRECTORY', past);

    const rows = await queryMemberIds(FX.parishAId);
    expect(rows).toHaveLength(0);
  });

  it('revoked grant returns zero rows immediately', async () => {
    await testDb.dataSharingGrant.deleteMany({ where: { parishId: FX.parishAId } });
    const active = await grantCategory(FX.parishAId, 'MEMBER_DIRECTORY');

    let rows = await queryMemberIds(FX.parishAId);
    expect(rows.length).toBeGreaterThan(0);

    await testDb.dataSharingGrant.update({
      where: { id: active.id },
      data: { isActive: false },
    });

    rows = await queryMemberIds(FX.parishAId);
    expect(rows).toHaveLength(0);
  });

  it('grant for Parish A does not expose Parish B rows', async () => {
    await testDb.dataSharingGrant.deleteMany({});
    await grantCategory(FX.parishAId, 'MEMBER_DIRECTORY');

    const rows = await queryMemberIds(FX.parishBId);
    expect(rows).toHaveLength(0);
  });
});
