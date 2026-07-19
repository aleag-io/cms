import { Role } from '@prisma/client';
import { computeAccountActuals } from '@/lib/finance/reporting';
import { formatCents } from '@/lib/finance/money';
import { ApiError } from '@/lib/api';
import type {
  ReportDefinition,
  ReportResult,
  ReportSection,
} from '@/lib/reports/types';

// R6 flagship report: cash-basis annual Receipts & Payments statement modeled
// on the real parish annual report — receipts are GivingCategory line items
// grouped by section, payments are expense accounts grouped by
// Account.reportSection, each with Budget / Actual / Variance columns.

export type ReceiptsPaymentsInput = {
  categories: {
    id: string;
    name: string;
    section: string;
    sortOrder: number;
    incomeAccountId: string;
  }[];
  incomeAccounts: { id: string; code: string; name: string }[];
  expenseAccounts: {
    id: string;
    code: string;
    name: string;
    reportSection: string | null;
  }[];
  /** From computeAccountActuals (cash basis): accountId → DEBIT − CREDIT. */
  actuals: Map<string, bigint>;
  /** revisedCents per accountId from the fiscal-year budget (may be empty). */
  budgetByAccount: Map<string, bigint>;
  year: number;
};

const COLUMNS = [
  { key: 'item', label: 'Line item' },
  { key: 'budget', label: 'Budget', kind: 'money' as const },
  { key: 'actual', label: 'Actual', kind: 'money' as const },
  { key: 'variance', label: 'Variance', kind: 'money' as const },
];

type LineTotals = { budget: bigint; actual: bigint };

function moneyRow(item: string, budget: bigint, actual: bigint) {
  return {
    item,
    budget: formatCents(budget),
    actual: formatCents(actual),
    variance: formatCents(budget - actual),
    budget_cents: budget.toString(),
    actual_cents: actual.toString(),
    variance_cents: (budget - actual).toString(),
  };
}

export function buildReceiptsPayments(
  input: ReceiptsPaymentsInput,
): ReportResult {
  const sections: ReportSection[] = [];

  // ── Receipts: GivingCategory line items grouped by category.section ────────
  // Income accounts hold credit balances → actual = −(DEBIT − CREDIT).
  const receiptsBySection = new Map<string, typeof input.categories>();
  for (const category of [...input.categories].sort(
    (a, b) =>
      a.section.localeCompare(b.section) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name),
  )) {
    const list = receiptsBySection.get(category.section) ?? [];
    list.push(category);
    receiptsBySection.set(category.section, list);
  }

  const receiptsTotal: LineTotals = { budget: 0n, actual: 0n };
  const categorizedIncomeAccounts = new Set(
    input.categories.map((c) => c.incomeAccountId),
  );

  for (const [sectionName, categories] of receiptsBySection) {
    const rows = [];
    const sectionTotal: LineTotals = { budget: 0n, actual: 0n };
    for (const category of categories) {
      const actual = -(input.actuals.get(category.incomeAccountId) ?? 0n);
      const budget = input.budgetByAccount.get(category.incomeAccountId) ?? 0n;
      rows.push(moneyRow(category.name, budget, actual));
      sectionTotal.budget += budget;
      sectionTotal.actual += actual;
    }
    receiptsTotal.budget += sectionTotal.budget;
    receiptsTotal.actual += sectionTotal.actual;
    sections.push({
      title: `Receipts — ${sectionName}`,
      rows,
      totals: { ...moneyRow('', sectionTotal.budget, sectionTotal.actual), item: null },
    });
  }

  // Income activity on accounts no category points at → "Other receipts".
  const otherReceiptRows = [];
  const otherReceiptsTotal: LineTotals = { budget: 0n, actual: 0n };
  for (const account of input.incomeAccounts) {
    if (categorizedIncomeAccounts.has(account.id)) continue;
    const actual = -(input.actuals.get(account.id) ?? 0n);
    const budget = input.budgetByAccount.get(account.id) ?? 0n;
    if (actual === 0n && budget === 0n) continue;
    otherReceiptRows.push(
      moneyRow(`${account.code} ${account.name}`, budget, actual),
    );
    otherReceiptsTotal.budget += budget;
    otherReceiptsTotal.actual += actual;
  }
  if (otherReceiptRows.length > 0) {
    receiptsTotal.budget += otherReceiptsTotal.budget;
    receiptsTotal.actual += otherReceiptsTotal.actual;
    sections.push({
      title: 'Receipts — Other receipts',
      rows: otherReceiptRows,
      totals: {
        ...moneyRow('', otherReceiptsTotal.budget, otherReceiptsTotal.actual),
        item: null,
      },
    });
  }

  // ── Payments: expense accounts grouped by Account.reportSection ────────────
  // Expense accounts hold debit balances → actual = +(DEBIT − CREDIT).
  const paymentsBySection = new Map<string, typeof input.expenseAccounts>();
  for (const account of [...input.expenseAccounts].sort(
    (a, b) => a.code.localeCompare(b.code),
  )) {
    const sectionName = account.reportSection ?? 'Other payments';
    const list = paymentsBySection.get(sectionName) ?? [];
    list.push(account);
    paymentsBySection.set(sectionName, list);
  }

  const paymentsTotal: LineTotals = { budget: 0n, actual: 0n };
  for (const [sectionName, accounts] of [...paymentsBySection.entries()].sort(
    (a, b) => a[0].localeCompare(b[0]),
  )) {
    const rows = [];
    const sectionTotal: LineTotals = { budget: 0n, actual: 0n };
    for (const account of accounts) {
      const actual = input.actuals.get(account.id) ?? 0n;
      const budget = input.budgetByAccount.get(account.id) ?? 0n;
      rows.push(moneyRow(`${account.code} ${account.name}`, budget, actual));
      sectionTotal.budget += budget;
      sectionTotal.actual += actual;
    }
    paymentsTotal.budget += sectionTotal.budget;
    paymentsTotal.actual += sectionTotal.actual;
    sections.push({
      title: `Payments — ${sectionName}`,
      rows,
      totals: { ...moneyRow('', sectionTotal.budget, sectionTotal.actual), item: null },
    });
  }

  const net = receiptsTotal.actual - paymentsTotal.actual;
  return {
    columns: COLUMNS,
    sections,
    grandTotals: {
      item: `Net receipts over payments: ${formatCents(net)}`,
      budget: formatCents(receiptsTotal.budget - paymentsTotal.budget),
      actual: formatCents(net),
      variance: null,
      receipts_actual_cents: receiptsTotal.actual.toString(),
      payments_actual_cents: paymentsTotal.actual.toString(),
      net_cents: net.toString(),
    },
    meta: {
      title: 'Receipts & Payments',
      subtitle: `Cash basis — Year ${input.year}`,
      generatedAt: new Date().toISOString().slice(0, 10),
      params: { year: String(input.year) },
    },
  };
}

export const receiptsPaymentsReport: ReportDefinition = {
  id: 'receipts-payments',
  title: 'Receipts & Payments',
  description:
    'Annual cash-basis statement: giving categories grouped by section, expense accounts grouped by report section, with Budget / Actual / Variance.',
  category: 'finance',
  scopes: ['parish', 'diocese'],
  roles: [
    Role.GLOBAL_ADMIN,
    Role.DIOCESE_ADMIN,
    Role.DIOCESE_STAFF,
    Role.PARISH_ADMIN,
    Role.PARISH_STAFF,
    Role.ORGANIZATION_LEADER,
  ],
  needsLedgerOwner: true,
  params: [{ key: 'year', label: 'Year', type: 'year', required: true }],
  async run(tx, ctx, params) {
    const year = Number(params.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      throw new ApiError(400, 'Invalid year');
    }
    const ledger = ctx.ledger;
    if (!ledger) throw new ApiError(400, 'Missing ledger owner');
    const owner = { ownerType: ledger.ownerType, ownerId: ledger.ownerId };

    const [categories, accounts, actuals, budget] = await Promise.all([
      tx.givingCategory.findMany({
        where: { ownerType: ledger.ownerType, ownerId: ledger.ownerId, isActive: true },
        select: {
          id: true,
          name: true,
          section: true,
          sortOrder: true,
          incomeAccountId: true,
        },
      }),
      tx.account.findMany({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          type: { in: ['INCOME', 'EXPENSE'] },
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          reportSection: true,
        },
      }),
      computeAccountActuals(tx, owner, {
        from: new Date(Date.UTC(year, 0, 1)),
        to: new Date(Date.UTC(year, 11, 31)),
        basis: 'cash',
      }),
      tx.budget.findFirst({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          fiscalYear: year,
        },
        include: { lines: { select: { accountId: true, revisedCents: true } } },
      }),
    ]);

    const budgetByAccount = new Map<string, bigint>(
      (budget?.lines ?? []).map((line) => [line.accountId, line.revisedCents]),
    );

    return buildReceiptsPayments({
      categories,
      incomeAccounts: accounts
        .filter((a) => a.type === 'INCOME')
        .map(({ id, code, name }) => ({ id, code, name })),
      expenseAccounts: accounts
        .filter((a) => a.type === 'EXPENSE')
        .map(({ id, code, name, reportSection }) => ({
          id,
          code,
          name,
          reportSection,
        })),
      actuals,
      budgetByAccount,
      year,
    });
  },
};
