import { describe, it, expect } from 'vitest';
import { groupCreditsByAccount, batchTotalCents } from '@/lib/finance/batch';

describe('batch grouping', () => {
  it('sums credits per income account and totals', () => {
    const lines = [
      { incomeAccountId: 'a', amountCents: 5000n },
      { incomeAccountId: 'b', amountCents: 2500n },
      { incomeAccountId: 'a', amountCents: 1500n },
    ];
    const grouped = groupCreditsByAccount(lines);
    expect(grouped.find((g) => g.accountId === 'a')?.amountCents).toBe(6500n);
    expect(grouped.find((g) => g.accountId === 'b')?.amountCents).toBe(2500n);
    expect(batchTotalCents(lines)).toBe(9000n);
  });

  it('handles empty', () => {
    expect(groupCreditsByAccount([])).toEqual([]);
    expect(batchTotalCents([])).toBe(0n);
  });
});
