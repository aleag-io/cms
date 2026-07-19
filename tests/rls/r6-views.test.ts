/**
 * @rls @r6 @m11
 * R6 diocese Tier-2 reporting views: diocese+role predicates are baked into
 * each view, so a parish actor sees nothing and a reporting viewer sees the
 * aggregate — never PII columns.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';
import { FX, resetTestDb, testDb } from '../helpers/db';

const ACC_INCOME = '00000000-0000-0000-0000-0000000d0001';
const CAMPAIGN = '00000000-0000-0000-0000-0000000d0002';
const FUND = '00000000-0000-0000-0000-0000000d0003';

const dioceseAdmin = makeClaims({
  userId: FX.users.dioceseAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: null,
  role: 'diocese_admin',
});
const reportViewer = makeClaims({
  userId: FX.users.dioceseAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: null,
  role: 'diocese_report_viewer',
});
const parishAdmin = makeClaims({
  userId: FX.users.parishAAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_admin',
});
const otherDioceseAdmin = makeClaims({
  userId: FX.users.dioceseAdmin.id,
  dioceseId: '00000000-0000-0000-0000-0000000000ff',
  parishId: null,
  role: 'diocese_admin',
});

const VIEWS = [
  'diocese_approval_policy_dashboard',
  'diocese_approval_request_summary',
  'diocese_parish_membership_trend',
  'diocese_parish_sacramental_summary',
  'diocese_parish_attendance_summary',
  'diocese_parish_event_summary',
  'diocese_parish_pledge_summary',
] as const;

async function seed() {
  await testDb.approvalPolicy.create({
    data: {
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      entityKind: 'JOURNAL',
      mode: 'THRESHOLD_BASED',
      thresholdCents: 50_000n,
      approverRoles: ['PARISH_ADMIN'],
      minApprovals: 1,
      updatedAt: new Date(),
    },
  });
  await testDb.approvalRequest.create({
    data: {
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      entityKind: 'JOURNAL',
      entityId: FX.parishAId,
      makerUserId: FX.users.parishAAdmin.id,
      amountCents: 75_000n,
      status: 'PENDING',
      requiredApprovals: 1,
      updatedAt: new Date(),
    },
  });
  await testDb.sacramentalRecord.create({
    data: {
      parishId: FX.parishAId,
      memberId: FX.members.aliceSmithId,
      sacramentType: 'BAPTISM',
      occurredOn: new Date('2024-05-01'),
      updatedAt: new Date(),
    },
  });
  await testDb.fund.create({
    data: {
      id: FUND,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      name: 'General',
    },
  });
  await testDb.account.create({
    data: {
      id: ACC_INCOME,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      code: '4000',
      name: 'Offerings',
      type: 'INCOME',
      fundId: FUND,
    },
  });
  await testDb.campaign.create({
    data: {
      id: CAMPAIGN,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      name: 'Building 2026',
      fundId: FUND,
      accountId: ACC_INCOME,
      goalCents: 1_000_000n,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      updatedAt: new Date(),
    },
  });
  await testDb.pledge.create({
    data: {
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      campaignId: CAMPAIGN,
      familyId: FX.families.smithId,
      amountCents: 100_000n,
      fulfilledCents: 25_000n,
      startDate: new Date('2026-01-01'),
      updatedAt: new Date(),
    },
  });
}

describe('r6 diocese reporting views RLS', () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeRlsPool();
  });

  it('diocese admin sees policy configuration with owner labels', async () => {
    const rows = await withTenantSession(dioceseAdmin, async (c) => {
      const { rows } = await c.query(
        `SELECT owner_label, entity_kind, mode, threshold_cents, min_approvals
         FROM diocese_approval_policy_dashboard`,
      );
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].owner_label).toBe('St. Thomas Parish (Parish A)');
    expect(rows[0].entity_kind).toBe('JOURNAL');
    expect(rows[0].mode).toBe('THRESHOLD_BASED');
  });

  it('diocese admin sees approval-request counts by status', async () => {
    const rows = await withTenantSession(dioceseAdmin, async (c) => {
      const { rows } = await c.query(
        `SELECT status, request_count, total_amount_cents
         FROM diocese_approval_request_summary`,
      );
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING');
    expect(Number(rows[0].request_count)).toBe(1);
    expect(String(rows[0].total_amount_cents)).toBe('75000');
  });

  it('parish-scoped actors see zero rows in every reporting view', async () => {
    for (const view of VIEWS) {
      const rows = await withTenantSession(parishAdmin, async (c) => {
        const { rows } = await c.query(`SELECT * FROM ${view}`);
        return rows;
      });
      expect(rows, `${view} must be empty for a parish admin`).toHaveLength(0);
    }
  });

  it('another diocese sees zero rows in every reporting view', async () => {
    for (const view of VIEWS) {
      const rows = await withTenantSession(otherDioceseAdmin, async (c) => {
        const { rows } = await c.query(`SELECT * FROM ${view}`);
        return rows;
      });
      expect(rows, `${view} must be empty cross-diocese`).toHaveLength(0);
    }
  });

  it('diocese_report_viewer can read every reporting view', async () => {
    const counts = await withTenantSession(reportViewer, async (c) => {
      const out: Record<string, number> = {};
      for (const view of VIEWS) {
        const { rows } = await c.query(`SELECT count(*)::int AS n FROM ${view}`);
        out[view] = rows[0].n;
      }
      return out;
    });
    expect(counts.diocese_approval_policy_dashboard).toBe(1);
    expect(counts.diocese_parish_sacramental_summary).toBe(1);
    expect(counts.diocese_parish_pledge_summary).toBe(1);
    expect(counts.diocese_parish_membership_trend).toBeGreaterThan(0);
  });

  it('reporting views expose only non-PII aggregate columns', async () => {
    const columns = await withTenantSession(reportViewer, async (c) => {
      const out: Record<string, string[]> = {};
      for (const view of VIEWS) {
        const { rows } = await c.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1`,
          [view],
        );
        out[view] = rows.map((r) => r.column_name).sort();
      }
      return out;
    });

    expect(columns.diocese_parish_membership_trend).toEqual([
      'diocese_id',
      'month',
      'new_member_count',
      'parish_id',
    ]);
    expect(columns.diocese_parish_sacramental_summary).toEqual([
      'diocese_id',
      'parish_id',
      'record_count',
      'sacrament_type',
      'year',
    ]);
    expect(columns.diocese_parish_pledge_summary).toEqual([
      'campaign_count',
      'diocese_id',
      'fulfilled_cents',
      'parish_id',
      'pledge_count',
      'pledged_cents',
    ]);

    // No view may leak a person-identifying column.
    const forbidden = /name|email|phone|note|address|dob|birth|member_id/i;
    for (const [view, cols] of Object.entries(columns)) {
      for (const col of cols) {
        if (view === 'diocese_approval_policy_dashboard' && col === 'owner_label') {
          continue; // parish/organization label, not a person
        }
        expect(forbidden.test(col), `${view}.${col} looks person-identifying`).toBe(
          false,
        );
      }
    }
  });
});
