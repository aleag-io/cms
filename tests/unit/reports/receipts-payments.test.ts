import { describe, it, expect } from 'vitest';
import { buildReceiptsPayments } from '@/lib/reports/defs/receipts-payments';
import type { ReceiptsPaymentsInput } from '@/lib/reports/defs/receipts-payments';

// Income accounts carry credit balances, so computeAccountActuals (DEBIT − CREDIT)
// returns them negative; the builder must flip them to positive receipts.
const base: ReceiptsPaymentsInput = {
  categories: [
    { id: 'c1', name: 'Subscription', section: 'Church Operation', sortOrder: 1, incomeAccountId: 'inc-4110' },
    { id: 'c2', name: 'Offertory (Plate)', section: 'Church Operation', sortOrder: 2, incomeAccountId: 'inc-4120' },
    { id: 'c3', name: 'Harvest', section: 'Mission Fund', sortOrder: 1, incomeAccountId: 'inc-4210' },
  ],
  incomeAccounts: [
    { id: 'inc-4110', code: '4110', name: 'Subscription' },
    { id: 'inc-4120', code: '4120', name: 'Offertory (Plate)' },
    { id: 'inc-4210', code: '4210', name: 'Harvest' },
    { id: 'inc-4900', code: '4900', name: 'Uncategorized income' },
  ],
  expenseAccounts: [
    { id: 'exp-5000', code: '5000', name: 'Salaries', reportSection: 'Personnel' },
    { id: 'exp-5100', code: '5100', name: 'Utilities', reportSection: 'Operations' },
    { id: 'exp-5900', code: '5900', name: 'Misc', reportSection: null },
  ],
  actuals: new Map<string, bigint>([
    ['inc-4110', -100_000n],
    ['inc-4120', -50_000n],
    ['inc-4210', -25_000n],
    ['inc-4900', -5_000n],
    ['exp-5000', 60_000n],
    ['exp-5100', 20_000n],
    ['exp-5900', 1_000n],
  ]),
  budgetByAccount: new Map<string, bigint>([
    ['inc-4110', 120_000n],
    ['exp-5000', 70_000n],
  ]),
  year: 2026,
};

function sectionTitles(result: ReturnType<typeof buildReceiptsPayments>) {
  return result.sections.map((s) => s.title);
}

function findSection(result: ReturnType<typeof buildReceiptsPayments>, title: string) {
  const section = result.sections.find((s) => s.title === title);
  if (!section) throw new Error(`missing section ${title}`);
  return section;
}

describe('buildReceiptsPayments', () => {
  it('groups receipts by giving-category section in sortOrder', () => {
    const result = buildReceiptsPayments(base);
    const church = findSection(result, 'Receipts — Church Operation');
    expect(church.rows.map((r) => r.item)).toEqual([
      'Subscription',
      'Offertory (Plate)',
    ]);
    expect(sectionTitles(result)).toContain('Receipts — Mission Fund');
  });

  it('renders receipts credit-positive and payments debit-positive', () => {
    const result = buildReceiptsPayments(base);
    const church = findSection(result, 'Receipts — Church Operation');
    expect(church.rows[0].actual_cents).toBe('100000');
    const personnel = findSection(result, 'Payments — Personnel');
    expect(personnel.rows[0].actual_cents).toBe('60000');
  });

  it('computes variance as budget minus actual', () => {
    const result = buildReceiptsPayments(base);
    const church = findSection(result, 'Receipts — Church Operation');
    // Subscription: budget 1200.00, actual 1000.00 → variance 200.00
    expect(church.rows[0].variance_cents).toBe('20000');
    // Offertory has no budget line → variance is negative actual
    expect(church.rows[1].variance_cents).toBe('-50000');
  });

  it('buckets income with no giving category under Other receipts', () => {
    const result = buildReceiptsPayments(base);
    const other = findSection(result, 'Receipts — Other receipts');
    expect(other.rows).toHaveLength(1);
    expect(other.rows[0].item).toBe('4900 Uncategorized income');
    expect(other.rows[0].actual_cents).toBe('5000');
  });

  it('buckets null reportSection expenses under Other payments', () => {
    const result = buildReceiptsPayments(base);
    const other = findSection(result, 'Payments — Other payments');
    expect(other.rows.map((r) => r.item)).toEqual(['5900 Misc']);
  });

  it('totals each section and nets receipts over payments', () => {
    const result = buildReceiptsPayments(base);
    const church = findSection(result, 'Receipts — Church Operation');
    expect(church.totals?.actual_cents).toBe('150000');

    // receipts 100000 + 50000 + 25000 + 5000 = 180000
    // payments 60000 + 20000 + 1000 = 81000 → net 99000
    expect(result.grandTotals?.receipts_actual_cents).toBe('180000');
    expect(result.grandTotals?.payments_actual_cents).toBe('81000');
    expect(result.grandTotals?.net_cents).toBe('99000');
  });

  it('omits Other receipts when every income account has a category', () => {
    const result = buildReceiptsPayments({
      ...base,
      incomeAccounts: base.incomeAccounts.filter((a) => a.id !== 'inc-4900'),
    });
    expect(sectionTitles(result)).not.toContain('Receipts — Other receipts');
  });

  it('reports the year in meta', () => {
    const result = buildReceiptsPayments(base);
    expect(result.meta.params.year).toBe('2026');
    expect(result.meta.subtitle).toContain('2026');
  });
});
