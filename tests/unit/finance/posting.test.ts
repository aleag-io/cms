import { describe, expect, it } from 'vitest';
import { assertBalanced, PostingError } from '@/lib/finance/posting';

describe('assertBalanced', () => {
  it('accepts a balanced two-line entry', () => {
    expect(() =>
      assertBalanced([
        { accountId: 'a', direction: 'DEBIT', amountCents: BigInt(1000) },
        { accountId: 'b', direction: 'CREDIT', amountCents: BigInt(1000) },
      ]),
    ).not.toThrow();
  });

  it('accepts multi-line balanced entries', () => {
    expect(() =>
      assertBalanced([
        { accountId: 'a', direction: 'DEBIT', amountCents: BigInt(500) },
        { accountId: 'b', direction: 'DEBIT', amountCents: BigInt(500) },
        { accountId: 'c', direction: 'CREDIT', amountCents: BigInt(1000) },
      ]),
    ).not.toThrow();
  });

  it('rejects unbalanced, one-line, and zero-total', () => {
    expect(() =>
      assertBalanced([
        { accountId: 'a', direction: 'DEBIT', amountCents: BigInt(1000) },
        { accountId: 'b', direction: 'CREDIT', amountCents: BigInt(999) },
      ]),
    ).toThrow(PostingError);

    expect(() =>
      assertBalanced([
        { accountId: 'a', direction: 'DEBIT', amountCents: BigInt(1000) },
      ]),
    ).toThrow(/at least two/);

    expect(() =>
      assertBalanced([
        { accountId: 'a', direction: 'DEBIT', amountCents: BigInt(0) },
        { accountId: 'b', direction: 'CREDIT', amountCents: BigInt(0) },
      ]),
    ).toThrow();
  });

  it('property: random balanced pairs pass; perturbations fail', () => {
    for (let i = 1; i <= 50; i++) {
      const amount = BigInt(i * 17);
      expect(() =>
        assertBalanced([
          { accountId: 'cash', direction: 'DEBIT', amountCents: amount },
          { accountId: 'income', direction: 'CREDIT', amountCents: amount },
        ]),
      ).not.toThrow();
      expect(() =>
        assertBalanced([
          { accountId: 'cash', direction: 'DEBIT', amountCents: amount },
          {
            accountId: 'income',
            direction: 'CREDIT',
            amountCents: amount + BigInt(1),
          },
        ]),
      ).toThrow(PostingError);
    }
  });
});
