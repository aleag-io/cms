/**
 * @rls @r4 @m8
 * SacramentalRecord row isolation: parish boundary, role matrix, own-member read,
 * and SACRAMENTAL_RECORDS grant path.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';
import { FX, resetTestDb, testDb } from '../helpers/db';

const RECORD_A_ID = '00000000-0000-0000-0000-000000000501';
const RECORD_B_ID = '00000000-0000-0000-0000-000000000502';
const RECORD_PEER_ID = '00000000-0000-0000-0000-000000000503';

const adminA = makeClaims({
  userId: FX.users.parishAAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_admin',
});

const staffA = makeClaims({
  userId: FX.users.parishAStaff.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_staff',
});

const memberA = makeClaims({
  userId: FX.users.parishAMember.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'member',
  memberId: FX.members.aliceSmithId,
});

const clergyA = makeClaims({
  userId: FX.users.clergyA.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'clergy',
  memberId: FX.members.clergyAId,
});

const dioceseAdmin = makeClaims({
  userId: FX.users.dioceseAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: null,
  role: 'diocese_admin',
});

const adminB = makeClaims({
  userId: FX.users.parishBAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishBId,
  role: 'parish_admin',
});

async function seedRecords() {
  await testDb.sacramentalRecord.createMany({
    data: [
      {
        id: RECORD_A_ID,
        parishId: FX.parishAId,
        memberId: FX.members.aliceSmithId,
        sacramentType: 'BAPTISM',
        occurredOn: new Date('2000-01-15'),
        officiantName: 'Fr. Test',
        isActive: true,
      },
      {
        id: RECORD_PEER_ID,
        parishId: FX.parishAId,
        memberId: FX.members.clergyAId,
        sacramentType: 'ORDINATION',
        occurredOn: new Date('1990-06-01'),
        ordainedOffice: 'Priest',
        isActive: true,
      },
      {
        id: RECORD_B_ID,
        parishId: FX.parishBId,
        memberId: FX.members.bobJonesBId,
        sacramentType: 'BAPTISM',
        occurredOn: new Date('1995-03-20'),
        isActive: true,
      },
    ],
  });
}

async function selectIds(claims: ReturnType<typeof makeClaims>): Promise<string[]> {
  return withTenantSession(claims, async (c) => {
    const { rows } = await c.query(
      'SELECT id FROM "SacramentalRecord" ORDER BY id',
    );
    return rows.map((r) => r.id as string);
  });
}

beforeAll(async () => {
  await resetTestDb();
});

beforeEach(async () => {
  await testDb.sacramentalRecord.deleteMany({});
  await testDb.dataSharingGrant.deleteMany({});
  await testDb.emergencyAccessGrant.deleteMany({});
  await testDb.parishPermissionOverride.deleteMany({});
  await seedRecords();
});

afterAll(async () => {
  await closeRlsPool();
  await testDb.$disconnect();
});

describe('R4 SacramentalRecord RLS', () => {
  it('parish admin in A sees only Parish A records', async () => {
    const ids = await selectIds(adminA);
    expect(ids.sort()).toEqual([RECORD_A_ID, RECORD_PEER_ID].sort());
  });

  it('parish admin in B cannot see Parish A records', async () => {
    const ids = await selectIds(adminB);
    expect(ids).toEqual([RECORD_B_ID]);
  });

  it('clergy can read and insert in own parish', async () => {
    const ids = await selectIds(clergyA);
    expect(ids).toContain(RECORD_A_ID);

    const inserted = await withTenantSession(clergyA, async (c) => {
      const id = '00000000-0000-0000-0000-000000000510';
      await c.query(
        `INSERT INTO "SacramentalRecord" (
          id, "parishId", "memberId", "sacramentType", "occurredOn", "isActive", "createdAt", "updatedAt"
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'HOLY_COMMUNION', '2010-05-01', true, now(), now())`,
        [id, FX.parishAId, FX.members.aliceSmithId],
      );
      const { rows } = await c.query(
        'SELECT id FROM "SacramentalRecord" WHERE id = $1::uuid',
        [id],
      );
      return rows.length;
    });
    // Session rolls back — insert only proves policy allowed it within txn.
    expect(inserted).toBe(1);
  });

  it('parish staff cannot read or write sacramental rows by default', async () => {
    const ids = await selectIds(staffA);
    expect(ids).toHaveLength(0);

    await expect(
      withTenantSession(staffA, async (c) => {
        await c.query(
          `INSERT INTO "SacramentalRecord" (
            id, "parishId", "memberId", "sacramentType", "occurredOn", "isActive", "createdAt", "updatedAt"
          ) VALUES (
            '00000000-0000-0000-0000-000000000511'::uuid,
            $1::uuid, $2::uuid, 'BAPTISM', '2011-01-01', true, now(), now()
          )`,
          [FX.parishAId, FX.members.aliceSmithId],
        );
      }),
    ).rejects.toThrow();
  });

  it('parish staff with WRITE override can insert and read register rows (PA-12)', async () => {
    await testDb.parishPermissionOverride.create({
      data: {
        parishId: FX.parishAId,
        role: 'PARISH_STAFF',
        resource: 'MEMBER_SACRAMENTAL_RECORD',
        action: 'WRITE',
        isAllowed: true,
        grantedByUserId: FX.users.parishAAdmin.id,
      },
    });

    const inserted = await withTenantSession(staffA, async (c) => {
      const id = '00000000-0000-0000-0000-000000000513';
      await c.query(
        `INSERT INTO "SacramentalRecord" (
          id, "parishId", "memberId", "sacramentType", "occurredOn", "isActive", "createdAt", "updatedAt"
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'HOLY_COMMUNION', '2013-05-01', true, now(), now())`,
        [id, FX.parishAId, FX.members.aliceSmithId],
      );
      const { rows } = await c.query(
        'SELECT id FROM "SacramentalRecord" WHERE id = $1::uuid',
        [id],
      );
      return rows.length;
    });
    expect(inserted).toBe(1);
  });

  it('parish staff with READ-only override can select but not insert', async () => {
    await testDb.parishPermissionOverride.create({
      data: {
        parishId: FX.parishAId,
        role: 'PARISH_STAFF',
        resource: 'MEMBER_SACRAMENTAL_RECORD',
        action: 'READ',
        isAllowed: true,
        grantedByUserId: FX.users.parishAAdmin.id,
      },
    });

    const ids = await selectIds(staffA);
    expect(ids.sort()).toEqual([RECORD_A_ID, RECORD_PEER_ID].sort());

    await expect(
      withTenantSession(staffA, async (c) => {
        await c.query(
          `INSERT INTO "SacramentalRecord" (
            id, "parishId", "memberId", "sacramentType", "occurredOn", "isActive", "createdAt", "updatedAt"
          ) VALUES (
            '00000000-0000-0000-0000-000000000514'::uuid,
            $1::uuid, $2::uuid, 'BAPTISM', '2014-01-01', true, now(), now()
          )`,
          [FX.parishAId, FX.members.aliceSmithId],
        );
      }),
    ).rejects.toThrow();
  });

  it('deny override blocks clergy writes at the DB layer', async () => {
    await testDb.parishPermissionOverride.create({
      data: {
        parishId: FX.parishAId,
        role: 'CLERGY',
        resource: 'MEMBER_SACRAMENTAL_RECORD',
        action: 'WRITE',
        isAllowed: false,
        grantedByUserId: FX.users.parishAAdmin.id,
      },
    });

    await expect(
      withTenantSession(clergyA, async (c) => {
        await c.query(
          `INSERT INTO "SacramentalRecord" (
            id, "parishId", "memberId", "sacramentType", "occurredOn", "isActive", "createdAt", "updatedAt"
          ) VALUES (
            '00000000-0000-0000-0000-000000000515'::uuid,
            $1::uuid, $2::uuid, 'BAPTISM', '2015-01-01', true, now(), now()
          )`,
          [FX.parishAId, FX.members.aliceSmithId],
        );
      }),
    ).rejects.toThrow();
  });

  it('override in Parish B does not leak into Parish A', async () => {
    await testDb.parishPermissionOverride.create({
      data: {
        parishId: FX.parishBId,
        role: 'PARISH_STAFF',
        resource: 'MEMBER_SACRAMENTAL_RECORD',
        action: 'READ',
        isAllowed: true,
        grantedByUserId: FX.users.parishBAdmin.id,
      },
    });

    const ids = await selectIds(staffA);
    expect(ids).toHaveLength(0);
  });

  it('parish staff cannot insert pastoral data by default; write override enables it', async () => {
    const insertPastoral = () =>
      withTenantSession(staffA, async (c) => {
        await c.query(
          `INSERT INTO "MemberPastoralData" (
            id, "memberId", "parishId", "createdAt", "updatedAt"
          ) VALUES (
            '00000000-0000-0000-0000-000000000516'::uuid,
            $1::uuid, $2::uuid, now(), now()
          )`,
          [FX.members.clergyAId, FX.parishAId],
        );
      });

    await expect(insertPastoral()).rejects.toThrow();

    await testDb.parishPermissionOverride.create({
      data: {
        parishId: FX.parishAId,
        role: 'PARISH_STAFF',
        resource: 'MEMBER_PASTORAL_DATA',
        action: 'WRITE',
        isAllowed: true,
        grantedByUserId: FX.users.parishAAdmin.id,
      },
    });

    await expect(insertPastoral()).resolves.toBeUndefined();
  });

  it('member can read own records but not peer records', async () => {
    const ids = await selectIds(memberA);
    expect(ids).toEqual([RECORD_A_ID]);
  });

  it('member cannot insert sacramental rows', async () => {
    await expect(
      withTenantSession(memberA, async (c) => {
        await c.query(
          `INSERT INTO "SacramentalRecord" (
            id, "parishId", "memberId", "sacramentType", "occurredOn", "isActive", "createdAt", "updatedAt"
          ) VALUES (
            '00000000-0000-0000-0000-000000000512'::uuid,
            $1::uuid, $2::uuid, 'CONFIRMATION', '2012-01-01', true, now(), now()
          )`,
          [FX.parishAId, FX.members.aliceSmithId],
        );
      }),
    ).rejects.toThrow();
  });

  it('diocese without grant sees zero sacramental rows', async () => {
    const ids = await selectIds(dioceseAdmin);
    expect(ids).toHaveLength(0);
  });

  it('diocese with SACRAMENTAL_RECORDS grant sees Parish A rows only', async () => {
    await testDb.dataSharingGrant.create({
      data: {
        parishId: FX.parishAId,
        dioceseId: FX.dioceseId,
        dataCategory: 'SACRAMENTAL_RECORDS',
        granteeType: 'DIOCESE',
        granteeId: FX.dioceseId,
        scope: 'ALL_RECORDS',
        grantedByUserId: FX.users.parishAAdmin.id,
        isActive: true,
      },
    });

    const ids = await selectIds(dioceseAdmin);
    expect(ids.sort()).toEqual([RECORD_A_ID, RECORD_PEER_ID].sort());
  });

  it('MEMBER_DIRECTORY grant does not expose sacramental rows', async () => {
    await testDb.dataSharingGrant.create({
      data: {
        parishId: FX.parishAId,
        dioceseId: FX.dioceseId,
        dataCategory: 'MEMBER_DIRECTORY',
        granteeType: 'DIOCESE',
        granteeId: FX.dioceseId,
        scope: 'ALL_RECORDS',
        grantedByUserId: FX.users.parishAAdmin.id,
        isActive: true,
      },
    });

    const ids = await selectIds(dioceseAdmin);
    expect(ids).toHaveLength(0);
  });

  it('revoked sacramental grant returns zero rows immediately', async () => {
    const grant = await testDb.dataSharingGrant.create({
      data: {
        parishId: FX.parishAId,
        dioceseId: FX.dioceseId,
        dataCategory: 'SACRAMENTAL_RECORDS',
        granteeType: 'DIOCESE',
        granteeId: FX.dioceseId,
        scope: 'ALL_RECORDS',
        grantedByUserId: FX.users.parishAAdmin.id,
        isActive: true,
      },
    });

    let ids = await selectIds(dioceseAdmin);
    expect(ids.length).toBeGreaterThan(0);

    await testDb.dataSharingGrant.update({
      where: { id: grant.id },
      data: { isActive: false },
    });

    ids = await selectIds(dioceseAdmin);
    expect(ids).toHaveLength(0);
  });
});
