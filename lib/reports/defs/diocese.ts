import { Prisma, Role } from '@prisma/client';
import { formatCents } from '@/lib/finance/money';
import type { ReportDefinition } from '@/lib/reports/types';

// Diocese-scope reports read the self-securing Tier-2 views (counts/sums only,
// never raw rows) inside withTenant — access is double-enforced: route roles
// here, plus the diocese/role predicate baked into each view's WHERE clause.

const DIOCESE_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.DIOCESE_REPORT_VIEWER,
];

type Tx = Prisma.TransactionClient;

async function parishNames(tx: Tx, dioceseId: string): Promise<Map<string, string>> {
  const parishes = await tx.parish.findMany({
    where: { dioceseId },
    select: { id: true, name: true },
  });
  return new Map(parishes.map((p) => [p.id, p.name]));
}

const generatedAt = () => new Date().toISOString().slice(0, 10);

export const dioceseMembershipReport: ReportDefinition = {
  id: 'diocese-membership',
  title: 'Diocese membership',
  description: 'Per-parish member and family counts with 12-month new-member trend.',
  category: 'people',
  scopes: ['diocese'],
  roles: DIOCESE_ROLES,
  params: [],
  async run(tx, ctx) {
    const names = await parishNames(tx, ctx.dioceseId);
    const [summary, trend] = await Promise.all([
      tx.$queryRaw<
        { parish_id: string; member_count: number; active_count: number }[]
      >(Prisma.sql`
        SELECT parish_id, total_count::int AS member_count, active_count
        FROM diocese_parish_member_summary
      `),
      tx.$queryRaw<
        { parish_id: string; month: Date; new_member_count: number }[]
      >(Prisma.sql`
        SELECT parish_id, month, new_member_count
        FROM diocese_parish_membership_trend
        WHERE month >= (date_trunc('month', now()) - interval '11 months')::date
        ORDER BY parish_id, month
      `),
    ]);

    const trendByParish = new Map<string, number>();
    for (const row of trend) {
      trendByParish.set(
        row.parish_id,
        (trendByParish.get(row.parish_id) ?? 0) + row.new_member_count,
      );
    }

    const rows = summary
      .map((row) => ({
        parish: names.get(row.parish_id) ?? row.parish_id,
        members: row.member_count,
        active: row.active_count,
        new_last_12mo: trendByParish.get(row.parish_id) ?? 0,
      }))
      .sort((a, b) => a.parish.localeCompare(b.parish));

    return {
      columns: [
        { key: 'parish', label: 'Parish' },
        { key: 'members', label: 'Members', kind: 'number' },
        { key: 'active', label: 'Active', kind: 'number' },
        { key: 'new_last_12mo', label: 'New (12 mo)', kind: 'number' },
      ],
      sections: [{ rows }],
      grandTotals: {
        parish: null,
        members: rows.reduce((n, r) => n + r.members, 0),
        active: rows.reduce((n, r) => n + r.active, 0),
        new_last_12mo: rows.reduce((n, r) => n + r.new_last_12mo, 0),
      },
      meta: { title: 'Diocese membership', generatedAt: generatedAt(), params: {} },
    };
  },
};

export const dioceseSacramentalReport: ReportDefinition = {
  id: 'diocese-sacramental',
  title: 'Diocese sacramental summary',
  description: 'Per-parish sacramental record counts by type and year.',
  category: 'people',
  scopes: ['diocese'],
  roles: DIOCESE_ROLES,
  params: [],
  async run(tx, ctx) {
    const names = await parishNames(tx, ctx.dioceseId);
    const rows = await tx.$queryRaw<
      { parish_id: string; sacrament_type: string; year: number; record_count: number }[]
    >(Prisma.sql`
      SELECT parish_id, sacrament_type, year, record_count
      FROM diocese_parish_sacramental_summary
      ORDER BY year DESC, parish_id, sacrament_type
    `);

    return {
      columns: [
        { key: 'parish', label: 'Parish' },
        { key: 'year', label: 'Year', kind: 'number' },
        { key: 'sacrament', label: 'Sacrament' },
        { key: 'records', label: 'Records', kind: 'number' },
      ],
      sections: [
        {
          rows: rows.map((row) => ({
            parish: names.get(row.parish_id) ?? row.parish_id,
            year: row.year,
            sacrament: row.sacrament_type,
            records: row.record_count,
          })),
        },
      ],
      meta: {
        title: 'Diocese sacramental summary',
        generatedAt: generatedAt(),
        params: {},
      },
    };
  },
};

export const dioceseGivingReport: ReportDefinition = {
  id: 'diocese-giving',
  title: 'Diocese giving',
  description: 'Per-parish monthly giving totals by fund (Tier-2 aggregate).',
  category: 'finance',
  scopes: ['diocese'],
  roles: DIOCESE_ROLES,
  params: [],
  async run(tx, ctx) {
    const names = await parishNames(tx, ctx.dioceseId);
    const rows = await tx.$queryRaw<
      {
        parish_id: string;
        period_start: Date;
        fund_name: string;
        total_cents: bigint;
        donation_count: number;
      }[]
    >(Prisma.sql`
      SELECT parish_id, period_start, fund_name, total_cents, donation_count
      FROM diocese_parish_giving_summary
      ORDER BY period_start DESC, parish_id, fund_name
    `);

    const grandTotal = rows.reduce((n, r) => n + r.total_cents, 0n);
    return {
      columns: [
        { key: 'parish', label: 'Parish' },
        { key: 'month', label: 'Month' },
        { key: 'fund', label: 'Fund' },
        { key: 'donations', label: 'Donations', kind: 'number' },
        { key: 'total', label: 'Total', kind: 'money' },
      ],
      sections: [
        {
          rows: rows.map((row) => ({
            parish: names.get(row.parish_id) ?? row.parish_id,
            month: row.period_start.toISOString().slice(0, 7),
            fund: row.fund_name,
            donations: row.donation_count,
            total: formatCents(row.total_cents),
            total_cents: row.total_cents.toString(),
          })),
        },
      ],
      grandTotals: {
        parish: null,
        month: null,
        fund: null,
        donations: rows.reduce((n, r) => n + r.donation_count, 0),
        total: formatCents(grandTotal),
        total_cents: grandTotal.toString(),
      },
      meta: { title: 'Diocese giving', generatedAt: generatedAt(), params: {} },
    };
  },
};

export const diocesePledgesReport: ReportDefinition = {
  id: 'diocese-pledges',
  title: 'Diocese pledges',
  description: 'Per-parish campaign and pledge totals (Tier-2 aggregate).',
  category: 'finance',
  scopes: ['diocese'],
  roles: DIOCESE_ROLES,
  params: [],
  async run(tx, ctx) {
    const names = await parishNames(tx, ctx.dioceseId);
    const rows = await tx.$queryRaw<
      {
        parish_id: string;
        campaign_count: number;
        pledge_count: number;
        pledged_cents: bigint;
        fulfilled_cents: bigint;
      }[]
    >(Prisma.sql`
      SELECT parish_id, campaign_count, pledge_count, pledged_cents, fulfilled_cents
      FROM diocese_parish_pledge_summary
      ORDER BY parish_id
    `);

    return {
      columns: [
        { key: 'parish', label: 'Parish' },
        { key: 'campaigns', label: 'Campaigns', kind: 'number' },
        { key: 'pledges', label: 'Pledges', kind: 'number' },
        { key: 'pledged', label: 'Pledged', kind: 'money' },
        { key: 'fulfilled', label: 'Fulfilled', kind: 'money' },
      ],
      sections: [
        {
          rows: rows.map((row) => ({
            parish: names.get(row.parish_id) ?? row.parish_id,
            campaigns: row.campaign_count,
            pledges: row.pledge_count,
            pledged: formatCents(row.pledged_cents),
            fulfilled: formatCents(row.fulfilled_cents),
            pledged_cents: row.pledged_cents.toString(),
            fulfilled_cents: row.fulfilled_cents.toString(),
          })),
        },
      ],
      meta: { title: 'Diocese pledges', generatedAt: generatedAt(), params: {} },
    };
  },
};
