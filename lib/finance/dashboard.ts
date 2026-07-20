/**
 * Entity financial-picture aggregation for the /finance dashboard.
 * Scoped to a single ledger owner (diocese | parish | organization).
 * All amounts are integer-cent strings for JSON safety.
 */

import type { AccountType, Prisma } from '@prisma/client';
import { computeLedgerSummary, type ReportBasis } from '@/lib/finance/reporting';
import { centsToJson } from '@/lib/finance/money';

type Tx = Prisma.TransactionClient;

export type LedgerOwnerRef = {
  ownerType: 'DIOCESE' | 'PARISH' | 'ORGANIZATION';
  ownerId: string;
};

export type FinancePicture = {
  basis: ReportBasis;
  fiscalYear: number;
  range: { from: string; to: string };
  kpis: {
    incomeCents: string;
    expenseCents: string;
    netOperatingCents: string;
    cashCents: string;
    assetCents: string;
    liabilityCents: string;
    equityCents: string;
    netPositionCents: string;
  };
  byType: Array<{ type: AccountType; netCents: string }>;
  topIncome: Array<{ accountId: string; code: string; name: string; amountCents: string }>;
  topExpense: Array<{ accountId: string; code: string; name: string; amountCents: string }>;
  funds: Array<{ fundId: string | null; name: string; balanceCents: string }>;
  budget: {
    fiscalYear: number;
    budgetedIncomeCents: string;
    budgetedExpenseCents: string;
    actualIncomeCents: string;
    actualExpenseCents: string;
    incomeVarianceCents: string;
    expenseVarianceCents: string;
  } | null;
  periods: {
    openCount: number;
    closedCount: number;
    current: {
      id: string;
      startDate: string;
      endDate: string;
      status: string;
    } | null;
  };
  approvals: { pendingCount: number };
  activity: {
    recentJournals: Array<{
      id: string;
      entryDate: string;
      description: string;
      status: string;
      source: string;
      totalDebitCents: string;
    }>;
    recentDonations: Array<{
      id: string;
      receivedAt: string;
      amountCents: string;
      method: string;
      status: string;
    }>;
  };
  counts: {
    accounts: number;
    funds: number;
    openBatches: number;
  };
};

function startOfYearUtc(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

function endOfYearUtc(year: number): Date {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

function isCashLike(code: string, name: string): boolean {
  const c = code.toLowerCase();
  const n = name.toLowerCase();
  return (
    c.startsWith('1') ||
    n.includes('cash') ||
    n.includes('bank') ||
    n.includes('checking') ||
    n.includes('savings') ||
    n.includes('operating')
  );
}

/** Build a full financial picture for one ledger owner. */
export async function computeFinancePicture(
  tx: Tx,
  owner: LedgerOwnerRef,
  opts: {
    basis?: ReportBasis;
    fiscalYear?: number;
    /** Parish id for giving (donations/batches); null for diocese-scoped gifts. */
    givingParishId?: string | null;
  } = {},
): Promise<FinancePicture> {
  const basis: ReportBasis = opts.basis ?? 'accrual';
  const fiscalYear = opts.fiscalYear ?? new Date().getUTCFullYear();
  const from = startOfYearUtc(fiscalYear);
  const to = endOfYearUtc(fiscalYear);
  const ownerWhere = {
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  };

  const [
    ytd,
    allTime,
    funds,
    accounts,
    budget,
    periods,
    pendingApprovals,
    recentJournals,
    openBatches,
    recentDonations,
  ] = await Promise.all([
    computeLedgerSummary(tx, owner, { from, to, basis }),
    computeLedgerSummary(tx, owner, { basis }),
    tx.fund.findMany({
      where: { ...ownerWhere, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    tx.account.findMany({
      where: { ...ownerWhere, isActive: true },
      select: { id: true, code: true, name: true, type: true, fundId: true },
    }),
    tx.budget.findFirst({
      where: { ...ownerWhere, fiscalYear },
      include: { lines: { include: { account: { select: { type: true } } } } },
    }),
    tx.accountingPeriod.findMany({
      where: ownerWhere,
      orderBy: { startDate: 'desc' },
      take: 24,
    }),
    tx.approvalRequest.count({
      where: {
        ...ownerWhere,
        status: 'PENDING',
      },
    }),
    tx.journalEntry.findMany({
      where: ownerWhere,
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      select: {
        id: true,
        entryDate: true,
        description: true,
        status: true,
        source: true,
        lines: { select: { direction: true, amountCents: true } },
      },
    }),
    tx.donationBatch.count({
      where: { ...ownerWhere, status: 'OPEN' },
    }),
    // Donations are parish/diocese scoped (not org ledger). Skip for pure org books.
    owner.ownerType === 'ORGANIZATION'
      ? Promise.resolve([])
      : tx.donation.findMany({
          where: {
            status: 'ACTIVE',
            parishId:
              opts.givingParishId === undefined
                ? owner.ownerType === 'PARISH'
                  ? owner.ownerId
                  : null
                : opts.givingParishId,
            receivedAt: { gte: from, lte: to },
          },
          orderBy: { receivedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            receivedAt: true,
            amountCents: true,
            method: true,
            status: true,
          },
        }),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Position totals from all-time posted balances (assets/liabilities accumulate).
  let cash = 0n;
  let assets = 0n;
  let liabilities = 0n;
  let equity = 0n;
  const fundBalances = new Map<string | null, bigint>();
  for (const f of funds) fundBalances.set(f.id, 0n);
  fundBalances.set(null, 0n);

  for (const row of allTime.accounts) {
    const net = BigInt(row.netCents);
    const meta = accountById.get(row.accountId);
    const type = row.type;
    if (type === 'ASSET') {
      assets += net;
      if (meta && isCashLike(meta.code, meta.name)) cash += net;
      const fid = meta?.fundId ?? null;
      fundBalances.set(fid, (fundBalances.get(fid) ?? 0n) + net);
    } else if (type === 'LIABILITY') {
      // Credit-normal: natural balance is credit, so -net is positive liability
      liabilities += -net;
    } else if (type === 'EQUITY') {
      equity += -net;
    }
  }

  // Top income/expense for YTD (natural positive amounts)
  const topIncome = ytd.accounts
    .filter((a) => a.type === 'INCOME')
    .map((a) => ({
      accountId: a.accountId,
      code: a.code,
      name: a.name,
      amountCents: (-BigInt(a.netCents)).toString(), // income credits → positive
    }))
    .filter((a) => BigInt(a.amountCents) > 0n)
    .sort((a, b) => (BigInt(b.amountCents) > BigInt(a.amountCents) ? 1 : -1))
    .slice(0, 6);

  const topExpense = ytd.accounts
    .filter((a) => a.type === 'EXPENSE')
    .map((a) => ({
      accountId: a.accountId,
      code: a.code,
      name: a.name,
      amountCents: a.netCents,
    }))
    .filter((a) => BigInt(a.amountCents) > 0n)
    .sort((a, b) => (BigInt(b.amountCents) > BigInt(a.amountCents) ? 1 : -1))
    .slice(0, 6);

  const byTypeMap = new Map<AccountType, bigint>();
  for (const row of allTime.accounts) {
    byTypeMap.set(row.type, (byTypeMap.get(row.type) ?? 0n) + BigInt(row.netCents));
  }

  let budgetPicture: FinancePicture['budget'] = null;
  if (budget) {
    let budgetedIncome = 0n;
    let budgetedExpense = 0n;
    for (const line of budget.lines) {
      // revisedCents is the working plan (seeded equal to original when unset).
      const amt = line.revisedCents;
      if (line.account.type === 'INCOME') budgetedIncome += amt;
      if (line.account.type === 'EXPENSE') budgetedExpense += amt;
    }
    const actualIncome = BigInt(ytd.incomeCents);
    const actualExpense = BigInt(ytd.expenseCents);
    budgetPicture = {
      fiscalYear,
      budgetedIncomeCents: centsToJson(budgetedIncome),
      budgetedExpenseCents: centsToJson(budgetedExpense),
      actualIncomeCents: centsToJson(actualIncome),
      actualExpenseCents: centsToJson(actualExpense),
      incomeVarianceCents: centsToJson(actualIncome - budgetedIncome),
      expenseVarianceCents: centsToJson(budgetedExpense - actualExpense),
    };
  }

  const openPeriods = periods.filter((p) => p.status === 'OPEN');
  const closedPeriods = periods.filter((p) => p.status === 'CLOSED');
  const today = new Date();
  const current =
    periods.find(
      (p) =>
        p.status === 'OPEN' &&
        new Date(p.startDate) <= today &&
        new Date(p.endDate) >= today,
    ) ?? openPeriods[0] ?? null;

  const fundName = new Map(funds.map((f) => [f.id, f.name]));
  const fundsOut = [...fundBalances.entries()]
    .map(([fundId, bal]) => ({
      fundId,
      name: fundId ? (fundName.get(fundId) ?? 'Fund') : 'Unassigned',
      balanceCents: centsToJson(bal),
    }))
    .filter((f) => f.balanceCents !== '0')
    .sort((a, b) => (BigInt(b.balanceCents) > BigInt(a.balanceCents) ? 1 : -1));

  return {
    basis,
    fiscalYear,
    range: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    kpis: {
      incomeCents: ytd.incomeCents,
      expenseCents: ytd.expenseCents,
      netOperatingCents: ytd.netCents,
      cashCents: centsToJson(cash),
      assetCents: centsToJson(assets),
      liabilityCents: centsToJson(liabilities),
      equityCents: centsToJson(equity),
      netPositionCents: centsToJson(assets - liabilities),
    },
    byType: [...byTypeMap.entries()].map(([type, net]) => ({
      type,
      netCents: centsToJson(net),
    })),
    topIncome,
    topExpense,
    funds: fundsOut,
    budget: budgetPicture,
    periods: {
      openCount: openPeriods.length,
      closedCount: closedPeriods.length,
      current: current
        ? {
            id: current.id,
            startDate: new Date(current.startDate).toISOString().slice(0, 10),
            endDate: new Date(current.endDate).toISOString().slice(0, 10),
            status: current.status,
          }
        : null,
    },
    approvals: { pendingCount: pendingApprovals },
    activity: {
      recentJournals: recentJournals.map((j) => {
        const debit = j.lines
          .filter((l) => l.direction === 'DEBIT')
          .reduce((s, l) => s + l.amountCents, 0n);
        return {
          id: j.id,
          entryDate: new Date(j.entryDate).toISOString().slice(0, 10),
          description: j.description,
          status: j.status,
          source: j.source,
          totalDebitCents: centsToJson(debit),
        };
      }),
      recentDonations: recentDonations.map((d) => ({
        id: d.id,
        receivedAt: new Date(d.receivedAt).toISOString().slice(0, 10),
        amountCents: centsToJson(d.amountCents),
        method: d.method,
        status: d.status,
      })),
    },
    counts: {
      accounts: accounts.length,
      funds: funds.length,
      openBatches,
    },
  };
}
