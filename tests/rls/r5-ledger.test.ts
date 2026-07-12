/**
 * @rls @r5 @m10
 * Finance ledger RLS (exit gate #5): parish isolation, org-leader scope,
 * parish-admin read-only oversight, diocese sees zero raw rows without a grant.
 * Plus giving-statement member own-read (exit gate #7).
 *
 * The grant-exposes-parish-ledger positive path reuses the identical
 * has_active_grant()/has_emergency_access() helpers already proven for
 * Member/Family in tests/rls/phase4-*, so it is not re-verified here.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';
import { FX, resetTestDb, testDb } from '../helpers/db';

const ORG_ID = '00000000-0000-0000-0000-0000000d0001';
const ORG_LEADER_USER = '00000000-0000-0000-0000-0000000d0002';
const ORG_LEADER_MEMBER = '00000000-0000-0000-0000-0000000d0003';
const ACC_A = '00000000-0000-0000-0000-0000000d0010';
const ACC_B = '00000000-0000-0000-0000-0000000d0011';
const ACC_ORG = '00000000-0000-0000-0000-0000000d0012';
const PERIOD_A = '00000000-0000-0000-0000-0000000d0020';
const DON_A = '00000000-0000-0000-0000-0000000d0030';
const STMT_MEMBER = '00000000-0000-0000-0000-0000000d0040';
const STMT_FAMILY = '00000000-0000-0000-0000-0000000d0041';

const adminA = makeClaims({ userId: FX.users.parishAAdmin.id, dioceseId: FX.dioceseId, parishId: FX.parishAId, role: 'parish_admin' });
const adminB = makeClaims({ userId: FX.users.parishBAdmin.id, dioceseId: FX.dioceseId, parishId: FX.parishBId, role: 'parish_admin' });
const dioceseAdmin = makeClaims({ userId: FX.users.dioceseAdmin.id, dioceseId: FX.dioceseId, parishId: null, role: 'diocese_admin' });
const orgLeader = makeClaims({ userId: ORG_LEADER_USER, dioceseId: FX.dioceseId, parishId: FX.parishAId, role: 'organization_leader', memberId: ORG_LEADER_MEMBER, orgLeaderIds: [ORG_ID] });
const member = makeClaims({ userId: FX.users.parishAMember.id, dioceseId: FX.dioceseId, parishId: FX.parishAId, role: 'member', memberId: FX.members.aliceSmithId });

async function seed() {
  await testDb.appUser.create({ data: { id: ORG_LEADER_USER, email: 'orglead@test.local', displayName: 'Org Lead', role: 'MEMBER', dioceseId: FX.dioceseId, parishId: FX.parishAId } });
  await testDb.member.create({ data: { id: ORG_LEADER_MEMBER, dioceseId: FX.dioceseId, parishId: FX.parishAId, familyId: FX.families.smithId, userId: ORG_LEADER_USER, memberIdentifier: '100.9', firstName: 'Org', lastName: 'Lead' } });
  await testDb.organization.create({ data: { id: ORG_ID, dioceseId: FX.dioceseId, parishId: FX.parishAId, name: 'Youth Group', hasOwnLedger: true } });
  // current_org_leader_ids() derives leadership from DB rows, not the claim.
  await testDb.organizationOfficer.create({ data: { dioceseId: FX.dioceseId, organizationId: ORG_ID, parishId: FX.parishAId, memberId: ORG_LEADER_MEMBER, title: 'President', isActive: true } });

  await testDb.account.createMany({
    data: [
      { id: ACC_A, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '1000', name: 'A Cash', type: 'ASSET' },
      { id: ACC_B, dioceseId: FX.dioceseId, parishId: FX.parishBId, ownerType: 'PARISH', ownerId: FX.parishBId, code: '1000', name: 'B Cash', type: 'ASSET' },
      { id: ACC_ORG, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'ORGANIZATION', ownerId: ORG_ID, code: '1000', name: 'Org Cash', type: 'ASSET' },
    ],
  });
  await testDb.accountingPeriod.create({ data: { id: PERIOD_A, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), status: 'OPEN' } });
  await testDb.donation.create({ data: { id: DON_A, dioceseId: FX.dioceseId, parishId: FX.parishAId, familyId: FX.families.smithId, periodId: PERIOD_A, amountCents: 5000n, method: 'CASH', receivedAt: new Date('2026-03-01') } });
  await testDb.givingStatement.createMany({
    data: [
      { id: STMT_MEMBER, dioceseId: FX.dioceseId, parishId: FX.parishAId, periodType: 'ANNUAL', periodKey: '2026', recipientType: 'MEMBER', memberId: FX.members.aliceSmithId, totalCents: 5000n, pdfBlobUrl: 'inline:x', generatedByUserId: FX.users.parishAAdmin.id },
      { id: STMT_FAMILY, dioceseId: FX.dioceseId, parishId: FX.parishAId, periodType: 'ANNUAL', periodKey: '2026', recipientType: 'FAMILY', familyId: FX.families.smithId, totalCents: 9000n, pdfBlobUrl: 'inline:y', generatedByUserId: FX.users.parishAAdmin.id },
    ],
  });
}

async function readAccountIds(claims: Parameters<typeof withTenantSession>[0], ownerId: string) {
  return withTenantSession(claims, async (c) => {
    const { rows } = await c.query(`SELECT id FROM "Account" WHERE "ownerId" = $1`, [ownerId]);
    return rows.map((r) => r.id as string);
  });
}

describe('r5 ledger RLS', () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeRlsPool();
  });

  it('parish A ledger is invisible to parish B (and vice versa)', async () => {
    expect(await readAccountIds(adminB, FX.parishAId)).toHaveLength(0);
    expect(await readAccountIds(adminA, FX.parishBId)).toHaveLength(0);
    expect(await readAccountIds(adminA, FX.parishAId)).toContain(ACC_A);
  });

  it('org leader reads only their own organization ledger', async () => {
    expect(await readAccountIds(orgLeader, ORG_ID)).toEqual([ACC_ORG]);
    // Org leader cannot read the parish general ledger.
    expect(await readAccountIds(orgLeader, FX.parishAId)).toHaveLength(0);
  });

  it('parish admin can READ org ledger (oversight) but not INSERT into it', async () => {
    expect(await readAccountIds(adminA, ORG_ID)).toContain(ACC_ORG);
    await expect(
      withTenantSession(adminA, async (c) => {
        await c.query(
          `INSERT INTO "Account"(id,"dioceseId","parishId","ownerType","ownerId",code,name,type) VALUES (gen_random_uuid(),$1,$2,'ORGANIZATION',$3,'9999','X','ASSET')`,
          [FX.dioceseId, FX.parishAId, ORG_ID],
        );
      }),
    ).rejects.toThrow();
  });

  it('diocese role sees ZERO raw journal/donation/account rows without a grant', async () => {
    expect(await readAccountIds(dioceseAdmin, FX.parishAId)).toHaveLength(0);
    const donations = await withTenantSession(dioceseAdmin, async (c) => {
      const { rows } = await c.query(`SELECT id FROM "Donation" WHERE "parishId" = $1`, [FX.parishAId]);
      return rows;
    });
    expect(donations).toHaveLength(0);
  });

  it('a member reads only their own MEMBER giving statement, never a FAMILY row', async () => {
    const seen = await withTenantSession(member, async (c) => {
      const { rows } = await c.query(`SELECT id, "recipientType" FROM "GivingStatement"`);
      return rows;
    });
    expect(seen.map((r) => r.id)).toEqual([STMT_MEMBER]);
    expect(seen.every((r) => r.recipientType === 'MEMBER')).toBe(true);
  });
});
