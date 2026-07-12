/**
 * Basis-aware ledger aggregation primitives (PA-17/18, §2.7).
 * accrual = all POSTED entries; cash = only cashImpact=true POSTED entries.
 * These feed the summary endpoint and budget variance; full report packs are M11.
 */

import type { AccountType, Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export type ReportBasis = 'cash' | 'accrual';

export type LedgerOwnerRef = {
  ownerType: 'DIOCESE' | 'PARISH' | 'ORGANIZATION';
  ownerId: string;
};

export type AccountTotal = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  /** Signed natural balance: DEBIT − CREDIT (positive for asset/expense). */
  netCents: string;
};

/** Sum posted journal lines for an owner, honoring the cash/accrual basis. */
export async function computeLedgerSummary(
  tx: Tx,
  owner: LedgerOwnerRef,
  opts: { from?: Date; to?: Date; basis: ReportBasis },
) {
  const lines = await tx.journalLine.findMany({
    where: {
      journalEntry: {
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        status: 'POSTED',
        ...(opts.basis === 'cash' ? { cashImpact: true } : {}),
        ...(opts.from || opts.to
          ? {
              entryDate: {
                ...(opts.from ? { gte: opts.from } : {}),
                ...(opts.to ? { lte: opts.to } : {}),
              },
            }
          : {}),
      },
    },
    select: {
      direction: true,
      amountCents: true,
      account: { select: { id: true, code: true, name: true, type: true } },
    },
  });

  const byAccount = new Map<string, { code: string; name: string; type: AccountType; net: bigint }>();
  let income = BigInt(0);
  let expense = BigInt(0);
  for (const l of lines) {
    const signed = l.direction === 'DEBIT' ? l.amountCents : -l.amountCents;
    const cur =
      byAccount.get(l.account.id) ??
      { code: l.account.code, name: l.account.name, type: l.account.type, net: BigInt(0) };
    cur.net += signed;
    byAccount.set(l.account.id, cur);
    if (l.account.type === 'INCOME') income += -signed; // credits increase income
    if (l.account.type === 'EXPENSE') expense += signed; // debits increase expense
  }

  const accounts: AccountTotal[] = [...byAccount.entries()].map(([accountId, v]) => ({
    accountId,
    code: v.code,
    name: v.name,
    type: v.type,
    netCents: v.net.toString(),
  }));

  return {
    basis: opts.basis,
    incomeCents: income.toString(),
    expenseCents: expense.toString(),
    netCents: (income - expense).toString(),
    accounts,
  };
}

/** Actual posted movement per account (DEBIT − CREDIT) within a date range. */
export async function computeAccountActuals(
  tx: Tx,
  owner: LedgerOwnerRef,
  opts: { from?: Date; to?: Date; basis?: ReportBasis } = {},
): Promise<Map<string, bigint>> {
  const lines = await tx.journalLine.findMany({
    where: {
      journalEntry: {
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        status: 'POSTED',
        ...(opts.basis === 'cash' ? { cashImpact: true } : {}),
        ...(opts.from || opts.to
          ? {
              entryDate: {
                ...(opts.from ? { gte: opts.from } : {}),
                ...(opts.to ? { lte: opts.to } : {}),
              },
            }
          : {}),
      },
    },
    select: { accountId: true, direction: true, amountCents: true },
  });
  const out = new Map<string, bigint>();
  for (const l of lines) {
    const signed = l.direction === 'DEBIT' ? l.amountCents : -l.amountCents;
    out.set(l.accountId, (out.get(l.accountId) ?? BigInt(0)) + signed);
  }
  return out;
}
