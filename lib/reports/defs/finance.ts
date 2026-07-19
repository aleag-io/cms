import { Role } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { computeAccountActuals } from '@/lib/finance/reporting';
import { formatCents } from '@/lib/finance/money';
import type { ReportDefinition } from '@/lib/reports/types';

const FINANCE_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
];

function requireParish(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

function parseYear(raw: string | undefined): number {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new ApiError(400, 'Invalid year');
  }
  return year;
}

// PA-22 / D11: aggregates by category and month only — never donor identities.
export const givingSummaryReport: ReportDefinition = {
  id: 'giving-summary',
  title: 'Giving summary',
  description: 'Donation totals by giving category and month (no donor data).',
  category: 'finance',
  scopes: ['parish'],
  roles: FINANCE_ROLES,
  params: [{ key: 'year', label: 'Year', type: 'year', required: true }],
  async run(tx, ctx, params) {
    const parishId = requireParish(ctx.parishId);
    const year = parseYear(params.year);

    const [donations, categories] = await Promise.all([
      tx.donation.findMany({
        where: {
          parishId,
          status: 'ACTIVE',
          receivedAt: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        },
        select: { amountCents: true, receivedAt: true, categoryId: true },
      }),
      tx.givingCategory.findMany({
        where: { parishId },
        select: { id: true, name: true, section: true },
      }),
    ]);

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const byKey = new Map<string, { total: bigint; count: number }>();
    for (const donation of donations) {
      const month = donation.receivedAt.toISOString().slice(0, 7);
      const key = `${donation.categoryId ?? ''}|${month}`;
      const bucket = byKey.get(key) ?? { total: 0n, count: 0 };
      bucket.total += donation.amountCents;
      bucket.count += 1;
      byKey.set(key, bucket);
    }

    const rows = [...byKey.entries()]
      .map(([key, bucket]) => {
        const [categoryId, month] = key.split('|');
        const category = categoryId ? categoryById.get(categoryId) : undefined;
        return {
          category: category?.name ?? 'Uncategorized',
          section: category?.section ?? '—',
          month,
          donations: bucket.count,
          total: formatCents(bucket.total),
          total_cents: bucket.total.toString(),
        };
      })
      .sort(
        (a, b) =>
          a.section.localeCompare(b.section) ||
          a.category.localeCompare(b.category) ||
          a.month.localeCompare(b.month),
      );

    const grandTotal = donations.reduce((n, d) => n + d.amountCents, 0n);
    return {
      columns: [
        { key: 'category', label: 'Category' },
        { key: 'section', label: 'Section' },
        { key: 'month', label: 'Month' },
        { key: 'donations', label: 'Donations', kind: 'number' },
        { key: 'total', label: 'Total', kind: 'money' },
      ],
      sections: [{ rows }],
      grandTotals: {
        category: null,
        section: null,
        month: null,
        donations: donations.length,
        total: formatCents(grandTotal),
        total_cents: grandTotal.toString(),
      },
      meta: {
        title: 'Giving summary',
        subtitle: `Year ${year}`,
        generatedAt: new Date().toISOString().slice(0, 10),
        params: { year: String(year) },
      },
    };
  },
};

export const pledgeFulfillmentReport: ReportDefinition = {
  id: 'pledge-fulfillment',
  title: 'Pledge fulfillment',
  description: 'Pledged vs fulfilled amounts per campaign.',
  category: 'finance',
  scopes: ['parish'],
  roles: FINANCE_ROLES,
  params: [],
  async run(tx, ctx) {
    const parishId = requireParish(ctx.parishId);
    const pledges = await tx.pledge.findMany({
      where: { parishId },
      select: {
        amountCents: true,
        fulfilledCents: true,
        status: true,
        campaign: { select: { id: true, name: true } },
      },
    });

    const byCampaign = new Map<
      string,
      {
        name: string;
        pledged: bigint;
        fulfilled: bigint;
        count: number;
        active: number;
        completed: number;
      }
    >();
    for (const pledge of pledges) {
      const bucket = byCampaign.get(pledge.campaign.id) ?? {
        name: pledge.campaign.name,
        pledged: 0n,
        fulfilled: 0n,
        count: 0,
        active: 0,
        completed: 0,
      };
      bucket.pledged += pledge.amountCents;
      bucket.fulfilled += pledge.fulfilledCents;
      bucket.count += 1;
      if (pledge.status === 'ACTIVE') bucket.active += 1;
      if (pledge.status === 'FULFILLED') bucket.completed += 1;
      byCampaign.set(pledge.campaign.id, bucket);
    }

    const rows = [...byCampaign.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((bucket) => ({
        campaign: bucket.name,
        pledges: bucket.count,
        active: bucket.active,
        completed: bucket.completed,
        pledged: formatCents(bucket.pledged),
        fulfilled: formatCents(bucket.fulfilled),
        fulfillment_rate:
          bucket.pledged > 0n
            ? `${Number((bucket.fulfilled * 100n) / bucket.pledged)}%`
            : '—',
        pledged_cents: bucket.pledged.toString(),
        fulfilled_cents: bucket.fulfilled.toString(),
      }));

    return {
      columns: [
        { key: 'campaign', label: 'Campaign' },
        { key: 'pledges', label: 'Pledges', kind: 'number' },
        { key: 'active', label: 'Active', kind: 'number' },
        { key: 'completed', label: 'Fulfilled', kind: 'number' },
        { key: 'pledged', label: 'Pledged', kind: 'money' },
        { key: 'fulfilled', label: 'Fulfilled', kind: 'money' },
        { key: 'fulfillment_rate', label: 'Fulfillment' },
      ],
      sections: [{ rows }],
      meta: {
        title: 'Pledge fulfillment',
        generatedAt: new Date().toISOString().slice(0, 10),
        params: {},
      },
    };
  },
};

export const incomeVsBudgetReport: ReportDefinition = {
  id: 'income-vs-budget',
  title: 'Income & expense vs budget',
  description:
    'Per-account budget, actual, and variance for a fiscal year on the chosen basis.',
  category: 'finance',
  scopes: ['parish', 'diocese'],
  roles: [...FINANCE_ROLES, Role.ORGANIZATION_LEADER],
  needsLedgerOwner: true,
  params: [
    { key: 'year', label: 'Fiscal year', type: 'year', required: true },
    {
      key: 'basis',
      label: 'Basis',
      type: 'select',
      options: [
        { value: 'accrual', label: 'Accrual' },
        { value: 'cash', label: 'Cash' },
      ],
    },
  ],
  async run(tx, ctx, params) {
    const ledger = ctx.ledger;
    if (!ledger) throw new ApiError(400, 'Missing ledger owner');
    const year = parseYear(params.year);
    const basis = params.basis === 'cash' ? 'cash' : 'accrual';

    const [accounts, actuals, budget] = await Promise.all([
      tx.account.findMany({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          type: { in: ['INCOME', 'EXPENSE'] },
          isActive: true,
        },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { code: 'asc' },
      }),
      computeAccountActuals(
        tx,
        { ownerType: ledger.ownerType, ownerId: ledger.ownerId },
        {
          from: new Date(Date.UTC(year, 0, 1)),
          to: new Date(Date.UTC(year, 11, 31)),
          basis,
        },
      ),
      tx.budget.findFirst({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          fiscalYear: year,
        },
        include: {
          lines: { select: { accountId: true, revisedCents: true } },
        },
      }),
    ]);

    const budgetByAccount = new Map(
      (budget?.lines ?? []).map((line) => [line.accountId, line.revisedCents]),
    );

    const makeRows = (type: 'INCOME' | 'EXPENSE') =>
      accounts
        .filter((account) => account.type === type)
        .map((account) => {
          const raw = actuals.get(account.id) ?? 0n;
          const actual = type === 'INCOME' ? -raw : raw;
          const budgeted = budgetByAccount.get(account.id) ?? 0n;
          return {
            account: `${account.code} ${account.name}`,
            budget: formatCents(budgeted),
            actual: formatCents(actual),
            variance: formatCents(budgeted - actual),
            budget_cents: budgeted.toString(),
            actual_cents: actual.toString(),
            variance_cents: (budgeted - actual).toString(),
          };
        });

    return {
      columns: [
        { key: 'account', label: 'Account' },
        { key: 'budget', label: 'Budget', kind: 'money' },
        { key: 'actual', label: 'Actual', kind: 'money' },
        { key: 'variance', label: 'Variance', kind: 'money' },
      ],
      sections: [
        { title: 'Income', rows: makeRows('INCOME') },
        { title: 'Expenses', rows: makeRows('EXPENSE') },
      ],
      meta: {
        title: 'Income & expense vs budget',
        subtitle: `FY ${year} — ${basis} basis`,
        generatedAt: new Date().toISOString().slice(0, 10),
        params: { year: String(year), basis },
      },
    };
  },
};

export const fundBalancesReport: ReportDefinition = {
  id: 'fund-balances',
  title: 'Fund balances',
  description: 'Income, expense, and net movement per fund for a year.',
  category: 'finance',
  scopes: ['parish', 'diocese'],
  roles: [...FINANCE_ROLES, Role.ORGANIZATION_LEADER],
  needsLedgerOwner: true,
  params: [{ key: 'year', label: 'Year', type: 'year', required: true }],
  async run(tx, ctx, params) {
    const ledger = ctx.ledger;
    if (!ledger) throw new ApiError(400, 'Missing ledger owner');
    const year = parseYear(params.year);

    const [funds, lines] = await Promise.all([
      tx.fund.findMany({
        where: { ownerType: ledger.ownerType, ownerId: ledger.ownerId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      tx.journalLine.findMany({
        where: {
          journalEntry: {
            ownerType: ledger.ownerType,
            ownerId: ledger.ownerId,
            status: 'POSTED',
            entryDate: {
              gte: new Date(Date.UTC(year, 0, 1)),
              lte: new Date(Date.UTC(year, 11, 31)),
            },
          },
        },
        select: {
          direction: true,
          amountCents: true,
          account: { select: { fundId: true, type: true } },
        },
      }),
    ]);

    const byFund = new Map<string, { income: bigint; expense: bigint }>();
    for (const line of lines) {
      const fundId = line.account.fundId ?? '';
      const bucket = byFund.get(fundId) ?? { income: 0n, expense: 0n };
      const signed =
        line.direction === 'DEBIT' ? line.amountCents : -line.amountCents;
      if (line.account.type === 'INCOME') bucket.income += -signed;
      else if (line.account.type === 'EXPENSE') bucket.expense += signed;
      byFund.set(fundId, bucket);
    }

    const fundName = new Map(funds.map((f) => [f.id, f.name]));
    const rows = [...byFund.entries()]
      .map(([fundId, bucket]) => ({
        fund: fundId ? (fundName.get(fundId) ?? 'Unknown fund') : 'Unallocated',
        income: formatCents(bucket.income),
        expense: formatCents(bucket.expense),
        net: formatCents(bucket.income - bucket.expense),
        income_cents: bucket.income.toString(),
        expense_cents: bucket.expense.toString(),
        net_cents: (bucket.income - bucket.expense).toString(),
      }))
      .sort((a, b) => a.fund.localeCompare(b.fund));

    return {
      columns: [
        { key: 'fund', label: 'Fund' },
        { key: 'income', label: 'Income', kind: 'money' },
        { key: 'expense', label: 'Expense', kind: 'money' },
        { key: 'net', label: 'Net', kind: 'money' },
      ],
      sections: [{ rows }],
      meta: {
        title: 'Fund balances',
        subtitle: `Year ${year}`,
        generatedAt: new Date().toISOString().slice(0, 10),
        params: { year: String(year) },
      },
    };
  },
};
